"""Scoped facade. PostgreSQL owns transitions and atomic event/outbox writes."""
from uuid import UUID
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
from .gateway import gateway


class Transition(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['advance','pause','resume','shortlist','reject','withdraw','reopen','skip','interview_entry','note']
    expected_version: int = Field(ge=0)
    idempotency_key: UUID
    reason: str = Field(min_length=5, max_length=1000)
    evidence_ids: list[UUID] = Field(default_factory=list, max_length=10)


class PipelineService:
    def recommendation_context(self, application_id: UUID, user):
        """Read-only replacement context for future graph adapters; no agent writes."""
        rows = gateway.table('m1_applications', token=user.token, params={
            'id': 'eq.'+str(application_id),
            'select': 'id,job_id,stage,status,version,submission_snapshot,policy_snapshot'})
        if not rows: raise HTTPException(404, 'Application not found')
        return rows[0]

    def transition(self, application_id, payload, user):
        if payload.action != 'withdraw' and user.aal != 'aal2':
            raise HTTPException(403, 'Staff MFA verification is required')
        return gateway.rpc('m2_transition', token=user.token, payload={
            'p_id': str(application_id), 'p_action': payload.action,
            'p_version': payload.expected_version, 'p_key': str(payload.idempotency_key),
            'p_reason': payload.reason, 'p_evidence': [str(value) for value in payload.evidence_ids]})


def application_dto(row):
    # Internal notes/evidence contents never share a candidate DTO.
    fields = ('id','job_id','stage','status','version','created_at','next_action','deadline_at','resume_snapshot_id','final_outcome','offer_accepted_at')
    result = {key: row.get(key) for key in fields}
    result['job_title'] = (row.get('submission_snapshot') or {}).get('job_title', 'Application')
    result['policy_version'] = (row.get('policy_snapshot') or {}).get('version', 1)
    return result


pipeline = PipelineService()
