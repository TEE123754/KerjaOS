"""M11 scoped aggregates; no service credential or row-level private text."""
import csv,io,json
from datetime import date,datetime,timedelta
from zoneinfo import ZoneInfo,ZoneInfoNotFoundError
from uuid import UUID
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException,Query,Response
from .auth import Principal,require_user
from .config import get_settings
from .gateway import gateway

def enabled():
 if not get_settings().ANALYTICS_ENABLED:raise HTTPException(503,'Analytics is paused')
router=APIRouter(prefix='/analytics',tags=['Scoped descriptive analytics'],dependencies=[Depends(enabled)])

def report(scope:Literal['candidate','staff']='candidate',from_date:date|None=None,to_date:date|None=None,timezone:str=Query('Asia/Kuala_Lumpur',max_length=80),company:str=Query('',max_length=120),origin:Literal['all','internal','manual','discovery']='all',source:str=Query('',max_length=120),job_id:UUID|None=None,archived:bool=False,user:Principal=Depends(require_user)):
 try:zone=ZoneInfo(timezone)
 except (ZoneInfoNotFoundError,ValueError):raise HTTPException(422,'Use an IANA timezone') from None
 if timezone!='UTC' and '/' not in timezone:raise HTTPException(422,'Use an IANA timezone')
 end=to_date or datetime.now(zone).date();start=from_date or end-timedelta(days=89)
 if start>end or (end-start).days>365 or start<date(1900,1,1):raise HTTPException(422,'Use an ordered date range of at most 366 days')
 if scope=='candidate' and job_id:raise HTTPException(422,'Job scope is staff-only')
 return gateway.rpc('m11_report',token=user.token,payload={'p_scope':scope,'p_from':start.isoformat(),'p_to':end.isoformat(),'p_timezone':timezone,'p_company':company,'p_origin':origin,'p_job':str(job_id) if job_id else None,'p_archive':archived,'p_source':source})
router.add_api_route('/report',report,methods=['GET'])

def safe_cell(value):
 s=str(value if value is not None else '')
 return "'"+s if s.lstrip().startswith(('=','+','-','@')) or s.startswith(('\t','\r','\n')) else s

@router.get('/export')
def export(format:Literal['csv','json']='csv',data:dict=Depends(report)):
 if format=='json':content=json.dumps(data,ensure_ascii=False);media='application/json'
 else:
  output=io.StringIO(newline='');writer=csv.writer(output);writer.writerow(['section','origin','label','count','denominator','value','scope','from','to','timezone'])
  for section,label in [('statuses','status'),('stages','stage'),('activity','day'),('companies','company'),('sources','source'),('observed_funnel','stage')]:
   for r in data.get(section,[]):writer.writerow([safe_cell(v) for v in [section,r.get('origin','internal'),r.get(label,''),r.get('count',r.get('applications','')),r.get('denominator',''),r.get('mean_age_days',''),data['scope'],data['from_date'],data['to_date'],data['timezone']]])
  for r in data.get('outcomes',[]):
   for metric in ['interviews','offers','hires','rejections','withdrawals','closures']:writer.writerow([safe_cell(v) for v in ['outcomes',r['origin'],metric,r.get(metric,0),r['denominator'],'',data['scope'],data['from_date'],data['to_date'],data['timezone']]])
  for metric in ['total','unknown_dates','company_groups']:writer.writerow([metric,'all',metric,data.get(metric,0),'','','','','',''])
  content=output.getvalue();media='text/csv'
 return Response(content,media_type=media,headers={'Content-Disposition':f'attachment; filename="kerjaos-analytics.{format}"','Cache-Control':'no-store'})
