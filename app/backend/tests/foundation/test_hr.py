from datetime import date, timedelta
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.foundation import auth, hr
from app.foundation.auth import Principal
from app.foundation.config import FoundationSettings
from app.foundation.server import create_app


def body(**fields):
    return dict(action='time_create', employee_id=str(uuid4()), idempotency_key=str(uuid4()), day=date.today().isoformat(), minutes=60, **fields)


@pytest.mark.parametrize('changes', [
    {'minutes':1.2}, {'minutes':True}, {'employee_id':'not-a-uuid'},
    {'owner_id':str(uuid4())}, {'company_id':str(uuid4())}, {'title':'bad\ntext'},
    {'minutes':1441}, {'minutes':0}, {'day':(date.today()+timedelta(days=2)).isoformat()},
    {'action':'payroll_save','period':'2026-13'},
    {'action':'payroll_save','period':'2026-10','base_cents':10,'deduction_cents':11},
    {'action':'event_create','title':'Meeting','starts_at':'2026-10-06T09:00:00','ends_at':'2026-10-06T10:00:00'},
    {'action':'event_create','title':'Meeting','starts_at':'2026-10-06T09:00:00Z','ends_at':'2026-10-06T14:00:00Z'},
    {'action':'employment_end','reason':'x'},
    {'action':'leave_create','end_day':(date.today()+timedelta(days=31)).isoformat(),'reason':'Annual leave'},
])
def test_strict_bounded_hr_input(changes):
    payload=body();payload.update(changes)
    with pytest.raises(ValueError): hr.HRCommand(**payload)


def test_hr_routes_require_session_and_csrf_and_forward_user_token(monkeypatch):
    from app.foundation import server
    monkeypatch.setattr(server,'get_settings',lambda:FoundationSettings(_env_file=None))
    calls=[]
    monkeypatch.setattr(hr.gateway,'rpc',lambda name,**kw:calls.append((name,kw)) or {'saved':True})
    app=create_app();client=TestClient(app)
    assert client.get('/api/v1/hr/context').status_code==401
    assert client.post('/api/v1/hr/command',json=body()).status_code==401
    assert calls==[]
    user=Principal(str(uuid4()),'fixture@example.test','USER_TOKEN','aal1','session','csrf')
    app.dependency_overrides[auth.require_user]=lambda:user
    assert client.get('/api/v1/hr/context?month=2026-10').status_code==200
    assert calls[-1]==('h1_context',{'token':'USER_TOKEN','payload':{'p_company':None,'p_month':'2026-10'}})
    # Overriding the read dependency does not bypass the write dependency.
    before=len(calls)
    assert client.post('/api/v1/hr/command',json=body()).status_code in (401,403)
    assert len(calls)==before
    app.dependency_overrides[auth.require_write]=lambda:user
    payload=body();response=client.post('/api/v1/hr/command',json=payload)
    assert response.status_code==200 and response.headers['cache-control']=='no-store'
    assert calls[-1][0]=='h1_command' and calls[-1][1]['token']=='USER_TOKEN'
    assert calls[-1][1]['payload']['p_data']['employee_id']==payload['employee_id']
    assert client.get('/api/v1/hr/context?month=2026-99').status_code==422
    invalid=body();invalid['minutes']=1.5
    assert client.post('/api/v1/hr/command',json=invalid).status_code==422
