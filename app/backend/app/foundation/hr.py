"""Company-scoped HR records. Payroll is a human-reviewed ledger, never a payment rail."""
from datetime import date, datetime, timezone, timedelta
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .auth import Principal, require_user, require_write
from .gateway import gateway

router = APIRouter(prefix='/hr', tags=['Company HR'])

class HRCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['join','employment_end','task_create','task_complete','time_create','time_submit','time_approve','time_reject','leave_create','leave_approve','leave_reject','leave_withdraw','payroll_save','payroll_approve','payroll_issue','event_create']
    employee_id: UUID
    id: UUID | None = None
    expected_revision: int = Field(default=0, ge=0)
    idempotency_key: UUID
    title: str = Field(default='', max_length=120)
    reason: str = Field(default='', max_length=500)
    day: date | None = None
    end_day: date | None = None
    minutes: int = Field(default=0, ge=0, le=1440, strict=True)
    leave_kind: Literal['annual','sick','unpaid'] = 'annual'
    period: str = Field(default='', pattern=r'^(|\d{4}-(0[1-9]|1[0-2]))$')
    base_cents: int = Field(default=0, ge=0, le=99999999, strict=True)
    allowance_cents: int = Field(default=0, ge=0, le=99999999, strict=True)
    deduction_cents: int = Field(default=0, ge=0, le=99999999, strict=True)
    completed: bool = Field(default=False, strict=True)
    starts_at: str = Field(default='', max_length=40)
    ends_at: str = Field(default='', max_length=40)

    @model_validator(mode='after')
    def validate_command(self):
        if any(ord(c)<32 for c in self.title+self.reason):
            raise ValueError('Use printable text')
        if self.action in ('time_create','leave_create') and self.day is None:
            raise ValueError('A date is required')
        if self.action=='time_create' and (self.minutes<1 or self.day>datetime.now(timezone(timedelta(hours=8))).date()):
            raise ValueError('Use a completed work date and at least one minute')
        if self.action=='leave_create' and (self.end_day is None or self.end_day<self.day or (self.end_day-self.day).days>30 or len(self.reason.strip())<3):
            raise ValueError('Leave needs dates within 31 calendar days and a reason')
        if self.action=='payroll_save' and (not self.period or self.deduction_cents>self.base_cents+self.allowance_cents):
            raise ValueError('Payroll needs a period and nonnegative net amount')
        if self.action=='employment_end' and len(self.reason.strip())<5:
            raise ValueError('A reviewed offboarding reason is required')
        if self.action in ('task_create','event_create') and len(self.title.strip())<2:
            raise ValueError('A title is required')
        if self.action=='event_create':
            try:
                start=datetime.fromisoformat(self.starts_at.replace('Z','+00:00'))
                end=datetime.fromisoformat(self.ends_at.replace('Z','+00:00'))
                if start.tzinfo is None or end.tzinfo is None or not 0<(end-start).total_seconds()<=14400:
                    raise ValueError()
            except ValueError:
                raise ValueError('Use offset-aware event dates, at most four hours') from None
        return self

@router.get('/context')
def context(company: UUID | None = None, month: str = Query('',pattern=r'^(|\d{4}-(0[1-9]|1[0-2]))$'), user:Principal=Depends(require_user)):
    return gateway.rpc('h1_context',token=user.token,payload={'p_company':str(company) if company else None,'p_month':month})

@router.post('/command')
def command(payload:HRCommand,user:Principal=Depends(require_write)):
    # DB derives employee/company ownership, live HR grants and MFA independently.
    return gateway.rpc('h1_command',token=user.token,payload={'p_data':payload.model_dump(mode='json')})
