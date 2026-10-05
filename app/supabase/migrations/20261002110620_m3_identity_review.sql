-- M3: identity evidence stays private; real capture disabled until operator approval.
begin;
create table kerja_private.identity_policy(id boolean primary key default true check(id),version text not null check(version='identity-v1'),retention_hours integer not null default 24 check(retention_hours=24),real_capture_enabled boolean not null default false);
insert into kerja_private.identity_policy(version) values('identity-v1');
create table kerja_private.identity_reviewers(user_id uuid references auth.users(id),job_id uuid references public.m1_jobs(id),qualified boolean not null default false,active boolean not null default true,primary key(user_id,job_id));
create table kerja_private.identity_cases(
 id uuid primary key default gen_random_uuid(),application_id uuid not null unique references public.m1_applications(id),
 candidate_id uuid not null references auth.users(id),employer_id uuid not null references public.m1_employers(id),consent_id uuid not null references kerja_private.consents(id),
 reviewer_id uuid references auth.users(id),route text not null check(route in ('mykad','passport','alternative','assertion')),
 synthetic boolean not null,state text not null default 'awaiting_document',reason_code text,version integer not null default 0,
 document_id uuid references kerja_private.documents(id),created_at timestamptz not null default now(),reviewed_at timestamptz
);
create table kerja_private.identity_assertions(
 id uuid primary key default gen_random_uuid(),case_id uuid not null references kerja_private.identity_cases(id),owner_id uuid not null references auth.users(id),
 reviewer_id uuid not null references auth.users(id),method text not null check(method in ('manual','mock')),verified_at timestamptz not null default now(),expires_at timestamptz not null,revoked_at timestamptz
);
create table kerja_private.identity_shares(
 id uuid primary key default gen_random_uuid(),assertion_id uuid not null references kerja_private.identity_assertions(id),target_case_id uuid not null unique references kerja_private.identity_cases(id),consent_id uuid not null references kerja_private.consents(id),revoked_at timestamptz,created_at timestamptz not null default now()
);
create table kerja_private.identity_deletion_ledger(document_id uuid primary key,deleted_at timestamptz not null,object_deleted boolean not null check(object_deleted));
alter table kerja_private.documents add column quality_hint text;
alter table kerja_private.documents add column media_type text;
alter table kerja_private.consents add column application_id uuid references public.m1_applications(id);
alter table kerja_private.documents add column deletion_lease uuid;
alter table kerja_private.documents add column deletion_lease_until timestamptz;
alter table kerja_private.pipeline_evidence add column identity_assertion_id uuid references kerja_private.identity_assertions(id);
alter table kerja_private.pipeline_evidence add column identity_share_id uuid references kerja_private.identity_shares(id);
do $$ declare t text; begin
 foreach t in array array['identity_policy','identity_reviewers','identity_cases','identity_assertions','identity_shares','identity_deletion_ledger'] loop
 execute format('alter table kerja_private.%I enable row level security',t);
 execute format('revoke all on kerja_private.%I from public,anon,authenticated',t);
 execute format('grant all on kerja_private.%I to service_role',t);
 end loop;
end $$;
create index m3_case_reviewer on kerja_private.identity_cases(reviewer_id,state);

create function kerja_private.m3_reviewer(p_case uuid) returns boolean language sql stable security definer set search_path='' as $$
 select kerja_private.active_auth_session() and auth.jwt()->>'aal'='aal2' and exists(
 select 1 from kerja_private.identity_cases c join public.m1_applications a on a.id=c.application_id
 join kerja_private.identity_reviewers r on r.user_id=c.reviewer_id and r.job_id=a.job_id
 join public.m1_job_assignments j on j.user_id=r.user_id and j.job_id=r.job_id
 join public.m1_memberships m on m.user_id=r.user_id and m.employer_id=c.employer_id
 where c.id=p_case and c.reviewer_id=auth.uid() and r.active and r.qualified and m.active and m.role in ('hm','admin','reviewer'));
$$;
revoke all on function kerja_private.m3_reviewer(uuid) from public,anon,authenticated;

create function kerja_private.m3_current_consent(p_application uuid) returns uuid language sql stable security definer set search_path='' as $$
 select c.id from kerja_private.consents c join public.m1_applications a on a.id=p_application
 join kerja_private.identity_policy p on p.id where c.candidate_id=a.candidate_id and c.employer_id=a.employer_id and c.purpose='identity'
 and c.version=p.version and c.version=coalesce(a.policy_snapshot->'consent_versions'->>'identity',p.version)
 and c.application_id=p_application and c.revoked_at is null and c.text_hash='identity-v1-purpose-employer-retention-sharing' order by c.granted_at desc limit 1;
$$;
revoke all on function kerja_private.m3_current_consent(uuid) from public,anon,authenticated;

create function kerja_private.m3_consent(p_application uuid,p_version text,p_agree boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.m1_applications; c uuid; v text;
begin
 if not kerja_private.active_auth_session() or p_agree is distinct from true then raise insufficient_privilege; end if;
 select * into a from public.m1_applications where id=p_application and candidate_id=auth.uid() for update;
 if not found or a.stage!='P2' or a.status in ('withdrawn','rejected','job_closed','hired') then raise insufficient_privilege; end if;
 select version into v from kerja_private.identity_policy where id;
 if p_version!=v or p_version!=coalesce(a.policy_snapshot->'consent_versions'->>'identity',v) then raise check_violation; end if;
 c:=kerja_private.m3_current_consent(a.id);
 if c is null then
 insert into kerja_private.consents(candidate_id,employer_id,purpose,version,text_hash,application_id) values(auth.uid(),a.employer_id,'identity',v,'identity-v1-purpose-employer-retention-sharing',a.id) returning id into c;
 end if;
 return jsonb_build_object('id',c,'version',v,'employer_id',a.employer_id);
end; $$;

create function kerja_private.m3_start(p_application uuid,p_route text,p_synthetic boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.m1_applications; c kerja_private.identity_cases; consent uuid; reviewer uuid; real_allowed boolean;
begin
 if not kerja_private.active_auth_session() or p_route not in ('mykad','passport','alternative') then raise insufficient_privilege; end if;
 select * into a from public.m1_applications where id=p_application and candidate_id=auth.uid() for update;
 if not found or a.stage!='P2' or a.status in ('withdrawn','rejected','job_closed','hired') then raise insufficient_privilege; end if;
 consent:=kerja_private.m3_current_consent(a.id);
 select real_capture_enabled into real_allowed from kerja_private.identity_policy where id;
 if consent is null or (not p_synthetic and not real_allowed) or (p_synthetic and not coalesce((a.policy_snapshot->>'demo_only')::boolean,false)) then raise insufficient_privilege; end if;
 select * into c from kerja_private.identity_cases where application_id=a.id for update;
 if found then
 if c.state not in ('needs_review','cancelled') then
   if c.route!=p_route or c.synthetic!=p_synthetic then raise serialization_failure; end if;
   return jsonb_build_object('id',c.id,'state',c.state,'version',c.version);
 end if;
 update kerja_private.documents set expires_at=least(expires_at,now()) where id=c.document_id and deleted_at is null;
 update kerja_private.identity_assertions set revoked_at=now() where case_id=c.id;
 update kerja_private.identity_cases set route=p_route,synthetic=p_synthetic,consent_id=consent,state=case when p_route='alternative' then 'awaiting_review' else 'awaiting_document' end,document_id=null,version=version+1 where id=c.id returning * into c;
 else
 select r.user_id into reviewer from kerja_private.identity_reviewers r join public.m1_job_assignments j on j.user_id=r.user_id and j.job_id=r.job_id
 join public.m1_memberships m on m.user_id=r.user_id and m.employer_id=a.employer_id
 where r.job_id=a.job_id and r.active and r.qualified and m.active and m.role in ('hm','admin','reviewer') order by r.user_id limit 1;
 insert into kerja_private.identity_cases(application_id,candidate_id,employer_id,consent_id,reviewer_id,route,synthetic,state)
 values(a.id,auth.uid(),a.employer_id,consent,reviewer,p_route,p_synthetic,case when p_route='alternative' then 'awaiting_review' else 'awaiting_document' end) returning * into c;
 end if;
 return jsonb_build_object('id',c.id,'state',c.state,'version',c.version);
end; $$;

create function kerja_private.m3_upload_intent(p_case uuid,p_doc uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c kerja_private.identity_cases; expiry timestamptz; key text;
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 select * into c from kerja_private.identity_cases where id=p_case and candidate_id=auth.uid() for update;
 if not found or c.route not in ('mykad','passport') or c.state not in ('awaiting_document','needs_review') or c.consent_id is distinct from kerja_private.m3_current_consent(c.application_id) then raise insufficient_privilege; end if;
 if not exists(select 1 from public.m1_applications where id=c.application_id and stage='P2' and status not in ('withdrawn','rejected','job_closed','hired')) then raise insufficient_privilege; end if;
 -- Overdue deletion blocks capture globally; an offline operator is not a cleanup promise.
 if exists(select 1 from kerja_private.documents where purpose='identity' and deleted_at is null and (expires_at<now() or (state='upload_pending' and created_at<now()-interval '1 hour'))) then raise check_violation; end if;
 if (select count(*) from kerja_private.documents where application_id=c.application_id and purpose='identity' and deleted_at is null)>=3 then raise check_violation; end if;
 select now()+make_interval(hours=>retention_hours) into expiry from kerja_private.identity_policy where id;
 key:=auth.uid()::text||'/'||p_doc::text||'.enc';
 insert into kerja_private.documents(id,owner_id,application_id,object_key,purpose,expires_at) values(p_doc,auth.uid(),c.application_id,key,'identity',expiry);
 update kerja_private.identity_cases set document_id=p_doc,state='upload_pending',version=version+1 where id=c.id;
 return jsonb_build_object('id',p_doc,'object_key',key,'expires_at',expiry);
end; $$;

create function public.m3_document_ready(p_doc uuid,p_quality text,p_media text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_quality not in ('needs_review','evidence_consistent') or p_media not in ('application/pdf','image/jpeg') then raise check_violation; end if;
 update kerja_private.documents set state='quarantined',quality_hint=p_quality,media_type=p_media where id=p_doc and purpose='identity' and state='upload_pending';
 update kerja_private.identity_cases c set state='awaiting_review',version=version+1 where document_id=p_doc
 and consent_id=kerja_private.m3_current_consent(c.application_id);
end; $$;
revoke all on function public.m3_document_ready(uuid,text,text) from public,anon,authenticated;
grant execute on function public.m3_document_ready(uuid,text,text) to service_role;
grant execute on function kerja_private.m3_current_consent(uuid) to service_role;

create function kerja_private.m3_cases(p_staff boolean) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'application_id',c.application_id,'employer_id',c.employer_id,'route',c.route,'synthetic',c.synthetic,'state',c.state,'version',c.version,'reason_code',c.reason_code,'assigned',c.reviewer_id is not null,'quality_hint',d.quality_hint,'expires_at',d.expires_at,
 'shared_assertion',(select jsonb_build_object('id',a.id,'method',a.method,'reviewer_id',a.reviewer_id,'verified_at',a.verified_at,'expires_at',a.expires_at,'revoked',a.revoked_at is not null or s.revoked_at is not null)
 from kerja_private.identity_shares s join kerja_private.identity_assertions a on a.id=s.assertion_id where s.target_case_id=c.id)) order by c.created_at desc),'[]'::jsonb)
 from (select * from kerja_private.identity_cases where kerja_private.active_auth_session() and ((not p_staff and candidate_id=auth.uid()) or (p_staff and kerja_private.m3_reviewer(id))) order by created_at desc limit 1000) c left join kerja_private.documents d on d.id=c.document_id;
$$;

create function kerja_private.m3_document(p_case uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',d.id,'object_key',d.object_key,'media_type',d.media_type) from kerja_private.identity_cases c join kerja_private.documents d on d.id=c.document_id
 where c.id=p_case and kerja_private.active_auth_session() and (c.candidate_id=auth.uid() or kerja_private.m3_reviewer(c.id))
 and c.consent_id=kerja_private.m3_current_consent(c.application_id) and c.state not in ('cancelled')
 and d.purpose='identity' and d.state='quarantined' and d.deleted_at is null and d.expires_at>now();
$$;

create function kerja_private.m3_review(p_case uuid,p_version integer,p_decision text,p_reason text,p_attested boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c kerja_private.identity_cases; assertion uuid; method text; shared kerja_private.identity_shares;
begin
 if not kerja_private.m3_reviewer(p_case) or p_decision is null or p_reason is null or p_decision not in ('verified_manual','needs_review','evidence_consistent') or p_reason not in ('review_completed','blurred','inconsistent','missing_document','alternative_completed') then raise insufficient_privilege; end if;
 select * into c from kerja_private.identity_cases where id=p_case for update;
 if c.version!=p_version or c.state not in ('awaiting_review','evidence_consistent') then raise serialization_failure; end if;
 if c.consent_id is distinct from kerja_private.m3_current_consent(c.application_id) then raise insufficient_privilege; end if;
 if not exists(select 1 from public.m1_applications where id=c.application_id and stage='P2' and status not in ('withdrawn','rejected','job_closed','hired')) then raise insufficient_privilege; end if;
 if c.route in ('mykad','passport') and not exists(select 1 from kerja_private.documents where id=c.document_id and state='quarantined' and expires_at>now() and deleted_at is null) then raise check_violation; end if;
 if c.route='assertion' then
 select * into shared from kerja_private.identity_shares where target_case_id=c.id and revoked_at is null;
 if not found or not exists(select 1 from kerja_private.identity_assertions where id=shared.assertion_id and revoked_at is null and expires_at>now()) then raise check_violation; end if;
 end if;
 if p_decision='verified_manual' then
   if p_attested is distinct from true or p_reason not in ('review_completed','alternative_completed') then raise insufficient_privilege; end if;
   if c.route in ('mykad','passport') and exists(select 1 from kerja_private.documents where id=c.document_id and quality_hint='needs_review') then raise check_violation; end if;
   method:=case when c.synthetic then 'mock' else 'manual' end;
   if c.route='assertion' then select a.method into method from kerja_private.identity_assertions a where a.id=shared.assertion_id; end if;
   insert into kerja_private.identity_assertions(case_id,owner_id,reviewer_id,method,expires_at) values(c.id,c.candidate_id,auth.uid(),method,now()+interval '90 days') returning id into assertion;
   update kerja_private.pipeline_evidence set revoked_at=now() where application_id=c.application_id and kind='identity';
   insert into kerja_private.pipeline_evidence(application_id,kind,outcome,method,reviewer_id,consent_id,expires_at,reason,identity_assertion_id,identity_share_id)
   values(c.application_id,'identity','satisfied',method,auth.uid(),c.consent_id,now()+interval '90 days','Human identity review; no official registry claim',assertion,shared.id);
 end if;
 update kerja_private.identity_cases set state=case when p_decision='verified_manual' and method='mock' then 'verified_mock' else p_decision end,reason_code=p_reason,reviewed_at=now(),version=version+1 where id=c.id;
 if p_decision='verified_manual' then update kerja_private.documents set expires_at=least(expires_at,now()+interval '1 hour') where id=c.document_id and deleted_at is null; end if;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type,reason) values(c.application_id,auth.uid(),'human','identity_review',p_decision||':'||p_reason);
 insert into public.m1_outbox(application_id,recipient_id,event_type) values(c.application_id,c.candidate_id,'identity_review');
 return jsonb_build_object('id',c.id,'decision',p_decision,'method',method,'assertion_id',assertion);
end; $$;

create function kerja_private.m3_assertions() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'method',method,'reviewer_id',reviewer_id,'verified_at',verified_at,'expires_at',expires_at,'revoked',revoked_at is not null)),'[]'::jsonb) from kerja_private.identity_assertions
 where owner_id=auth.uid() and kerja_private.active_auth_session();
$$;
create function kerja_private.m3_share(p_assertion uuid,p_application uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare source kerja_private.identity_assertions; a public.m1_applications; consent uuid; reviewer uuid; target uuid; share_id uuid;
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 select * into source from kerja_private.identity_assertions where id=p_assertion and owner_id=auth.uid() and revoked_at is null and expires_at>now() for update;
 if not found then raise insufficient_privilege; end if;
 if exists(select 1 from kerja_private.identity_cases where id=source.case_id and route='assertion') then raise check_violation; end if;
 select * into a from public.m1_applications where id=p_application and candidate_id=auth.uid() and stage='P2' and status not in ('withdrawn','rejected','job_closed','hired') for update;
 if not found or (source.method='mock' and not coalesce((a.policy_snapshot->>'demo_only')::boolean,false)) then raise insufficient_privilege; end if;
 consent:=kerja_private.m3_current_consent(a.id);if consent is null then raise insufficient_privilege; end if;
 select r.user_id into reviewer from kerja_private.identity_reviewers r join public.m1_job_assignments j on j.user_id=r.user_id and j.job_id=r.job_id
 join public.m1_memberships m on m.user_id=r.user_id and m.employer_id=a.employer_id
 where r.job_id=a.job_id and r.active and r.qualified and m.active and m.role in ('hm','admin','reviewer') order by r.user_id limit 1;
 insert into kerja_private.identity_cases(application_id,candidate_id,employer_id,consent_id,reviewer_id,route,synthetic,state)
 values(a.id,auth.uid(),a.employer_id,consent,reviewer,'assertion',source.method='mock','awaiting_review') returning id into target;
 insert into kerja_private.identity_shares(assertion_id,target_case_id,consent_id) values(source.id,target,consent) returning id into share_id;
 return jsonb_build_object('id',share_id,'case_id',target,'state','awaiting_review');
end; $$;

create function kerja_private.m3_revoke(p_id uuid,p_kind text) returns void language plpgsql security definer set search_path='' as $$
declare consent uuid; c kerja_private.identity_cases;
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 if p_kind='consent' then
   if not exists(select 1 from public.m1_applications where id=p_id and candidate_id=auth.uid()) then raise insufficient_privilege; end if;
   select * into c from kerja_private.identity_cases where application_id=p_id and candidate_id=auth.uid() for update;
   if c.id is null then consent:=kerja_private.m3_current_consent(p_id); else consent:=c.consent_id; end if;
   update kerja_private.consents set revoked_at=now() where id=consent;
   update kerja_private.identity_cases set state='cancelled',version=version+1 where id=c.id;
   update kerja_private.identity_assertions set revoked_at=now() where case_id=c.id;
   update kerja_private.pipeline_evidence set revoked_at=now() where application_id=p_id and kind='identity';
   update kerja_private.documents set expires_at=least(expires_at,now()) where application_id=p_id and purpose='identity' and deleted_at is null;
 elsif p_kind='sharing' then
   if not exists(select 1 from kerja_private.identity_shares s join kerja_private.identity_assertions a on a.id=s.assertion_id where s.id=p_id and a.owner_id=auth.uid()) then raise insufficient_privilege; end if;
   update kerja_private.identity_shares set revoked_at=now() where id=p_id;
   update kerja_private.pipeline_evidence set revoked_at=now() where identity_share_id=p_id;
 elsif p_kind='assertion' then
   if not exists(select 1 from kerja_private.identity_assertions where id=p_id and owner_id=auth.uid()) then raise insufficient_privilege; end if;
   update kerja_private.identity_assertions set revoked_at=now() where id=p_id;
 else raise insufficient_privilege; end if;
end; $$;

-- Live assertion/sharing validity is checked in addition to M2's reviewer/consent/policy rules.
alter function kerja_private.m2_requirements_met(uuid,text) rename to m2_requirements_base;
create function kerja_private.m2_requirements_met(p_app uuid,p_kind text) returns boolean language sql stable security definer set search_path='' as $$
 select kerja_private.m2_requirements_base(p_app,p_kind) and (p_kind!='identity' or exists(
 select 1 from kerja_private.pipeline_evidence e join kerja_private.identity_assertions a on a.id=e.identity_assertion_id
 left join kerja_private.identity_shares s on s.id=e.identity_share_id left join kerja_private.identity_assertions src on src.id=s.assertion_id
 where e.application_id=p_app and e.kind='identity' and e.revoked_at is null and e.expires_at>now() and a.revoked_at is null and a.expires_at>now()
 and (e.identity_share_id is null or (s.revoked_at is null and src.revoked_at is null and src.expires_at>now()))));
$$;
revoke all on function kerja_private.m2_requirements_met(uuid,text) from public,anon,authenticated;

-- Narrow service-only deletion leases. No completion before object deletion.
create function public.m3_cleanup_claim(p_lease uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d kerja_private.documents;
begin
 select * into d from kerja_private.documents where purpose='identity' and deleted_at is null
 and ((state!='upload_pending' and expires_at<=now()) or (state='upload_pending' and created_at<now()-interval '1 hour')) and (deletion_lease_until is null or deletion_lease_until<now())
 order by expires_at for update skip locked limit 1;
 if not found then return null; end if;
 update kerja_private.documents set deletion_lease=p_lease,deletion_lease_until=now()+interval '2 minutes' where id=d.id;
 return jsonb_build_object('id',d.id,'object_key',d.object_key);
end; $$;
create function public.m3_cleanup_complete(p_doc uuid,p_lease uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update kerja_private.documents set state='deleted',deleted_at=now(),deletion_lease=null,deletion_lease_until=null
 where id=p_doc and purpose='identity' and deleted_at is null and deletion_lease=p_lease and deletion_lease_until>now();
 if not found then return false; end if;
 insert into kerja_private.identity_deletion_ledger values(p_doc,now(),true) on conflict do nothing;
 update kerja_private.identity_cases set state='needs_review',reason_code='missing_document',version=version+1
 where document_id=p_doc and state in ('upload_pending','awaiting_review','evidence_consistent');
 return true;
end; $$;
revoke all on function public.m3_cleanup_claim(uuid),public.m3_cleanup_complete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.m3_cleanup_claim(uuid),public.m3_cleanup_complete(uuid,uuid) to service_role;
revoke all on function kerja_private.m3_consent(uuid,text,boolean) from public,anon;
grant execute on function kerja_private.m3_consent(uuid,text,boolean) to authenticated;
create function public.m3_consent(p_application uuid,p_version text,p_agree boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m3_consent(p_application,p_version,p_agree); $$;
revoke all on function public.m3_consent(uuid,text,boolean) from public,anon;
grant execute on function public.m3_consent(uuid,text,boolean) to authenticated;

revoke all on function kerja_private.m3_start(uuid,text,boolean) from public,anon;
grant execute on function kerja_private.m3_start(uuid,text,boolean) to authenticated;
create function public.m3_start(p_application uuid,p_route text,p_synthetic boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m3_start(p_application,p_route,p_synthetic); $$;
revoke all on function public.m3_start(uuid,text,boolean) from public,anon;
grant execute on function public.m3_start(uuid,text,boolean) to authenticated;

revoke all on function kerja_private.m3_upload_intent(uuid,uuid) from public,anon;
grant execute on function kerja_private.m3_upload_intent(uuid,uuid) to authenticated;
create function public.m3_upload_intent(p_case uuid,p_doc uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m3_upload_intent(p_case,p_doc); $$;
revoke all on function public.m3_upload_intent(uuid,uuid) from public,anon;
grant execute on function public.m3_upload_intent(uuid,uuid) to authenticated;

revoke all on function kerja_private.m3_cases(boolean) from public,anon;
grant execute on function kerja_private.m3_cases(boolean) to authenticated;
create function public.m3_cases(p_staff boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m3_cases(p_staff); $$;
revoke all on function public.m3_cases(boolean) from public,anon;
grant execute on function public.m3_cases(boolean) to authenticated;

revoke all on function kerja_private.m3_document(uuid) from public,anon;
grant execute on function kerja_private.m3_document(uuid) to authenticated;
create function public.m3_document(p_case uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m3_document(p_case); $$;
revoke all on function public.m3_document(uuid) from public,anon;
grant execute on function public.m3_document(uuid) to authenticated;

revoke all on function kerja_private.m3_review(uuid,integer,text,text,boolean) from public,anon;
grant execute on function kerja_private.m3_review(uuid,integer,text,text,boolean) to authenticated;
create function public.m3_review(p_case uuid,p_version integer,p_decision text,p_reason text,p_attested boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m3_review(p_case,p_version,p_decision,p_reason,p_attested); $$;
revoke all on function public.m3_review(uuid,integer,text,text,boolean) from public,anon;
grant execute on function public.m3_review(uuid,integer,text,text,boolean) to authenticated;

revoke all on function kerja_private.m3_assertions() from public,anon;
grant execute on function kerja_private.m3_assertions() to authenticated;
create function public.m3_assertions() returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m3_assertions(); $$;
revoke all on function public.m3_assertions() from public,anon;
grant execute on function public.m3_assertions() to authenticated;

revoke all on function kerja_private.m3_share(uuid,uuid) from public,anon;
grant execute on function kerja_private.m3_share(uuid,uuid) to authenticated;
create function public.m3_share(p_assertion uuid,p_application uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m3_share(p_assertion,p_application); $$;
revoke all on function public.m3_share(uuid,uuid) from public,anon;
grant execute on function public.m3_share(uuid,uuid) to authenticated;

revoke all on function kerja_private.m3_revoke(uuid,text) from public,anon;
grant execute on function kerja_private.m3_revoke(uuid,text) to authenticated;
create function public.m3_revoke(p_id uuid,p_kind text) returns void language sql security invoker set search_path='' as $$ select kerja_private.m3_revoke(p_id,p_kind); $$;
revoke all on function public.m3_revoke(uuid,text) from public,anon;
grant execute on function public.m3_revoke(uuid,text) to authenticated;
create function kerja_private.m3_shares() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'assertion_id',s.assertion_id,'application_id',c.application_id,'employer_id',c.employer_id,'revoked',s.revoked_at is not null)),'[]'::jsonb)
 from kerja_private.identity_shares s join kerja_private.identity_assertions a on a.id=s.assertion_id join kerja_private.identity_cases c on c.id=s.target_case_id
 where a.owner_id=auth.uid() and kerja_private.active_auth_session();
$$;
revoke all on function kerja_private.m3_shares() from public,anon;
grant execute on function kerja_private.m3_shares() to authenticated;
create function public.m3_shares() returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m3_shares(); $$;
revoke all on function public.m3_shares() from public,anon;
grant execute on function public.m3_shares() to authenticated;
commit;
