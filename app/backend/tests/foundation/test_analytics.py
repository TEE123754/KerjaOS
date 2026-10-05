import csv,io
from fastapi import HTTPException
from app.foundation import analytics
from app.foundation.config import get_settings
from test_boundary import boundary,login

class Store:
 def __init__(self):self.calls=[];self.deny=False
 def rpc(self,name,**kw):
  self.calls.append((name,kw))
  if self.deny:raise HTTPException(403,'Assigned job and staff MFA required')
  p=kw['payload'];return {'scope':p['p_scope'],'from_date':p['p_from'],'to_date':p['p_to'],'timezone':p['p_timezone'],'total':1,'unknown_dates':2,'company_groups':1,'companies':[{'origin':'manual','company':'=HYPERLINK("https://example.test")','count':1}],'statuses':[],'stages':[],'activity':[],'sources':[],'observed_funnel':[],'outcomes':[{'origin':'manual','denominator':1,'interviews':1}]}

def test_analytics_token_scope_dates_disabled_and_no_store(boundary,monkeypatch):
 client,fake=boundary;store=Store();monkeypatch.setattr(analytics,'gateway',store)
 assert client.get('/api/v1/analytics/report').status_code==401
 login(client)
 r=client.get('/api/v1/analytics/report?from_date=2026-03-07&to_date=2026-03-08&timezone=America/New_York&origin=manual&company=Demo');assert r.status_code==200 and r.headers['cache-control']=='no-store'
 call=store.calls[-1];assert call[0]=='m11_report' and call[1]['token']==fake.token and 'admin' not in call[1];assert call[1]['payload']['p_timezone']=='America/New_York' and call[1]['payload']['p_company']=='Demo'
 for q in ['from_date=2026-03-09&to_date=2026-03-08','from_date=2025-01-01&to_date=2026-12-31','timezone=Bad/Zone','timezone=EST','scope=all','origin=bad','job_id=not-uuid']:
  assert client.get('/api/v1/analytics/report?'+q).status_code==422
 store.deny=True;assert client.get('/api/v1/analytics/report?scope=staff').status_code==403;assert client.get('/api/v1/analytics/export?scope=staff').status_code==403
 monkeypatch.setenv('ANALYTICS_ENABLED','false');get_settings.cache_clear();assert client.get('/api/v1/analytics/report').status_code==503;assert client.get('/api/v1/analytics/export').status_code==503

def test_export_matches_scoped_report_and_escapes_formula(boundary,monkeypatch):
 client,fake=boundary;store=Store();monkeypatch.setattr(analytics,'gateway',store);login(client)
 q='from_date=2026-01-01&to_date=2026-12-31&origin=manual'
 r=client.get('/api/v1/analytics/export?'+q);assert r.status_code==200 and r.headers['cache-control']=='no-store'
 rows=list(csv.reader(io.StringIO(r.text)));assert rows[1][2].startswith("'=HYPERLINK") and rows[1][6:9]==['candidate','2026-01-01','2026-12-31'];assert store.calls[-1][1]['token']==fake.token
 r=client.get('/api/v1/analytics/export?'+q+'&format=json');assert r.json()['unknown_dates']==2 and r.json()['scope']=='candidate'
 assert client.get('/api/v1/analytics/export?format=xlsx').status_code==422
 for text in ['=1','+1','-1','@SUM(1)','  =1','\t1','\r1','\n1']:assert analytics.safe_cell(text).startswith("'")
 assert analytics.safe_cell('Ordinary company')=='Ordinary company'
