-- M5 free/manual workflow. Official services are unconfigured; real capture off.
begin;
create table kerja_private.background_policy(id boolean primary key default true check(id),dispatch_enabled boolean not null default true,real_manual_enabled boolean not null default false);
insert into kerja_private.background_policy(id) values(true);
create table kerja_private.background_cases (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.m1_applications(id),
 kind text not null check(kind in ('ctos_basic','ccris','criminal')), provider text not null check(provider in ('mock','manual','official')),
 consent_id uuid not null references kerja_private.consents(id), synthetic boolean not null,
 scenario text not null check(scenario in ('ambiguous','consistent','unavailable')),
 state text not null default 'queued' check(state in ('queued','awaiting_document','needs_review','evidence_consistent','unavailable','on_hold','reviewed','cancelled')),
 version integer not null default 0, document_id uuid references kerja_private.documents(id), result_code text,
 coverage text not null default 'not_processed', expires_at timestamptz, review_decision text, reviewer_id uuid references auth.users(id),
 review_reason text, reviewed_at timestamptz, created_at timestamptz not null default now(), unique(application_id,kind,consent_id)
);
create table kerja_private.background_disputes(id uuid primary key default gen_random_uuid(),case_id uuid not null references kerja_private.background_cases(id),explanation text not null,created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references auth.users(id));
create table kerja_private.background_late_results(id uuid primary key default gen_random_uuid(),case_id uuid not null references kerja_private.background_cases(id),lease uuid not null,result_code text not null,quarantined boolean not null default true,created_at timestamptz not null default now(),unique(case_id,lease));
create table kerja_private.background_deletion_ledger(document_id uuid primary key references kerja_private.documents(id),deleted_at timestamptz not null,object_deleted boolean not null check(object_deleted));
alter table kerja_private.pipeline_evidence add column background_case_id uuid references kerja_private.background_cases(id);
do $$ declare n text; begin
 foreach n in array array['background_policy','background_cases','background_disputes','background_late_results','background_deletion_ledger'] loop
  execute format('alter table kerja_private.%I enable row level security',n);
  execute format('revoke all on kerja_private.%I from public,anon,authenticated',n);
  execute format('grant all on kerja_private.%I to service_role',n);
 end loop;
end $$;
create index background_case_application on kerja_private.background_cases(application_id,kind);

create function kerja_private.m5_configure(p_job uuid,p_checks jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; types jsonb;
begin
 if not kerja_private.m4_staff(p_job) then raise insufficient_privilege; end if;
 if jsonb_typeof(p_checks) is distinct from 'array' or jsonb_array_length(p_checks)>3
 or (select count(distinct x->>'kind') from jsonb_array_elements(p_checks) x)!=jsonb_array_length(p_checks) then raise check_violation; end if;
 for c in select jsonb_array_elements(p_checks) loop
  if c->>'kind' is null or c->>'kind' not in ('ctos_basic','ccris','criminal') or c->>'provider' is null or c->>'provider' not in ('mock','manual','official')
   or length(trim(coalesce(c->>'necessity',''))) not between 15 and 1000
   or exists(select 1 from jsonb_object_keys(c) k where k not in ('kind','provider','necessity','exception_allowed')) then raise check_violation; end if;
  if c->'exception_allowed' is not null and jsonb_typeof(c->'exception_allowed')!='boolean' then raise check_violation; end if;
  if c->>'exception_allowed'='true' and not exists(select 1 from public.m1_memberships m join public.m1_jobs j on j.employer_id=m.employer_id where j.id=p_job and m.user_id=auth.uid() and m.role='admin' and m.active) then raise insufficient_privilege; end if;
 end loop;
 select coalesce(jsonb_agg(distinct case when x->>'kind'='criminal' then 'criminal' else 'credit' end),'[]') into types from jsonb_array_elements(p_checks) x;
 update public.m1_jobs set policy=jsonb_set(jsonb_set(policy,'{background_checks}',types),'{background_policy}',
 jsonb_build_object('version','background-v1','stage','after_quiz','checks',p_checks,'legal_approved',false)) where id=p_job;
 return jsonb_build_object('job_id',p_job,'checks',p_checks,'stage','after_quiz','legal_approved',false,'new_applications_only',true);
end; $$;
create function kerja_private.m5_applications(p_staff boolean) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select a.id,a.job_id,a.stage,a.status,a.version,a.submission_snapshot->>'job_title' as title,a.policy_snapshot->'background_policy' as background_policy
 from public.m1_applications a where kerja_private.active_auth_session() and ((p_staff=false and a.candidate_id=auth.uid()) or (p_staff=true and kerja_private.m4_staff(a.job_id))) order by a.created_at desc limit 100) t;
$$;
create function kerja_private.m5_consent(p_application uuid,p_kind text,p_version text,p_agree boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.m1_applications; c uuid;
begin
 if not kerja_private.active_auth_session() or p_agree is distinct from true then raise insufficient_privilege; end if;
 select * into a from public.m1_applications where id=p_application for update;
 if a.id is null or a.candidate_id!=auth.uid() then raise insufficient_privilege; end if;
 if a.stage!='P4' or a.status not in ('under_review','on_hold') or p_version is distinct from ('background-'||p_kind||'-v1')
 or not exists(select 1 from jsonb_array_elements(coalesce(a.policy_snapshot->'background_policy'->'checks','[]')) x where x->>'kind'=p_kind) then raise check_violation; end if;
 select id into c from kerja_private.consents where application_id=a.id and candidate_id=auth.uid() and purpose=p_kind and version=p_version and revoked_at is null order by granted_at desc limit 1;
 if c is null then
  insert into kerja_private.consents(application_id,candidate_id,employer_id,purpose,version,text_hash)
  values(a.id,auth.uid(),a.employer_id,p_kind,p_version,md5('Purpose:'||p_kind||';employer-scoped;manual/mock;revoke;24h reports;human review')) returning id into c;
 end if;
 return jsonb_build_object('id',c,'kind',p_kind,'version',p_version);
end; $$;
create function kerja_private.m5_start(p_application uuid,p_kind text,p_key uuid,p_synthetic boolean,p_scenario text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.m1_applications; cfg jsonb; consent uuid; c kerja_private.background_cases; prior kerja_private.operation_keys; request jsonb;
begin
 if not kerja_private.active_auth_session() or p_key is null or p_synthetic is null then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select * into a from public.m1_applications where id=p_application for update;
 if a.id is null or a.candidate_id!=auth.uid() then raise insufficient_privilege; end if;
 request:=jsonb_build_object('application',p_application,'kind',p_kind,'synthetic',p_synthetic,'scenario',p_scenario);
 select * into prior from kerja_private.operation_keys where actor_id=auth.uid() and key=p_key;
 if found then
  if prior.operation!='background-start' or prior.request!=request then raise unique_violation; end if;
  return prior.result;
 end if;
 if not exists(select 1 from kerja_private.background_policy where dispatch_enabled) or a.stage!='P4' or a.status not in ('under_review','on_hold')
 or exists(select 1 from public.m1_jobs where id=a.job_id and closed_at is not null) then raise check_violation; end if;
 if coalesce((a.policy_snapshot->>'required_quiz')::boolean,true) and not kerja_private.m2_requirements_met(a.id,'quiz') then raise check_violation; end if;
 select x into cfg from jsonb_array_elements(coalesce(a.policy_snapshot->'background_policy'->'checks','[]')) x where x->>'kind'=p_kind;
 if cfg is null or p_scenario is null or p_scenario not in ('ambiguous','consistent','unavailable') then raise check_violation; end if;
 if cfg->>'provider'='mock' and (not p_synthetic or a.policy_snapshot->>'demo_only' is distinct from 'true') then raise check_violation; end if;
 if cfg->>'provider'='manual' and not p_synthetic and (a.policy_snapshot->'background_policy'->>'legal_approved' is distinct from 'true' or not exists(select 1 from kerja_private.background_policy where real_manual_enabled)) then raise check_violation; end if;
 if p_synthetic and a.policy_snapshot->>'demo_only' is distinct from 'true' then raise check_violation; end if;
 select id into consent from kerja_private.consents where application_id=a.id and candidate_id=a.candidate_id and employer_id=a.employer_id and purpose=p_kind and version='background-'||p_kind||'-v1' and revoked_at is null order by granted_at desc limit 1;
 if consent is null then raise insufficient_privilege; end if;
 insert into kerja_private.background_cases(application_id,kind,provider,consent_id,synthetic,scenario,state)
 values(a.id,p_kind,cfg->>'provider',consent,p_synthetic,p_scenario,case when cfg->>'provider'='manual' then 'awaiting_document' else 'queued' end)
 on conflict(application_id,kind,consent_id) do nothing returning * into c;
 if c.id is null then select * into c from kerja_private.background_cases where application_id=a.id and kind=p_kind and consent_id=consent; end if;
 if c.state='queued' then insert into kerja_private.work_items(kind,reference_id,idempotency_key) values('background',c.id,'background-'||c.id::text) on conflict(idempotency_key) do nothing; end if;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type) values(a.id,auth.uid(),'human','background_requested');
 insert into public.m1_outbox(application_id,recipient_id,event_type) values(a.id,a.candidate_id,'background_requested');
 request:=jsonb_build_object('id',c.id,'state',c.state,'kind',c.kind,'provider',c.provider);
 insert into kerja_private.operation_keys values(auth.uid(),p_key,'background-start',jsonb_build_object('application',p_application,'kind',p_kind,'synthetic',p_synthetic,'scenario',p_scenario),request);
 return request;
end; $$;
create function kerja_private.m5_cases(p_staff boolean) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select c.id,c.application_id,c.kind,c.provider,c.synthetic,c.state,c.version,c.result_code,c.coverage,c.expires_at,c.document_id,c.review_decision,c.review_reason,
 coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'explanation',d.explanation,'resolved',d.resolved_at is not null)) from kerja_private.background_disputes d where d.case_id=c.id),'[]') as disputes
 from kerja_private.background_cases c join public.m1_applications a on a.id=c.application_id where kerja_private.active_auth_session() and ((p_staff=false and a.candidate_id=auth.uid()) or (p_staff=true and kerja_private.m4_staff(a.job_id))) order by c.created_at desc limit 100) t;
$$;
create function kerja_private.m5_hold(p_application uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.m1_applications set previous_status=status,paused_next_action=next_action,status='on_hold',next_action='await_background_explanation',version=version+1
 where id=p_application and status in ('under_review','shortlisted','interview_ready');
end; $$;
create function kerja_private.m5_claim(p_case uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w kerja_private.work_items; c kerja_private.background_cases;
begin
 select * into w from kerja_private.work_items where kind='background' and (p_case is null or reference_id=p_case)
 and due_at<=now() and (state='pending' or (state='leased' and lease_until<now())) order by due_at for update skip locked limit 1;
 if w.id is null then return null; end if;
 select * into c from kerja_private.background_cases where id=w.reference_id;
 if w.attempts>=3 then
  update kerja_private.work_items set state='dead_letter',last_error_code='provider_unavailable' where id=w.id;
  update kerja_private.background_cases set state='unavailable',result_code='retry_exhausted',coverage='no_check_performed',version=version+1 where id=c.id and state='queued';
  if found then
   insert into public.m1_application_events(application_id,actor_id,actor_type,event_type) values(c.application_id,null,'system','background_unavailable');
   insert into public.m1_outbox(application_id,recipient_id,event_type) select a.id,a.candidate_id,'background_unavailable' from public.m1_applications a where a.id=c.application_id;
  end if;
  return null;
 end if;
 update kerja_private.work_items set state='leased',lease_token=p_lease,lease_until=now()+interval '2 minutes',attempts=attempts+1 where id=w.id;
 return jsonb_build_object('id',c.id,'kind',c.kind,'provider',c.provider,'scenario',c.scenario,'lease',p_lease);
end; $$;
create function kerja_private.m5_claim_user(p_case uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from kerja_private.background_cases c join public.m1_applications a on a.id=c.application_id where c.id=p_case and kerja_private.m4_staff(a.job_id)) then raise insufficient_privilege; end if;
 return kerja_private.m5_claim(p_case,p_lease);
end; $$;
create function kerja_private.m5_finish(p_case uuid,p_lease uuid,p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c kerja_private.background_cases; a public.m1_applications; w kerja_private.work_items;
begin
 select application_id into c.application_id from kerja_private.background_cases where id=p_case;
 select * into a from public.m1_applications where id=c.application_id for update;
 select * into c from kerja_private.background_cases where id=p_case for update;
 select * into w from kerja_private.work_items where kind='background' and reference_id=c.id for update;
 if c.id is null or w.lease_token is distinct from p_lease or p_lease is null then raise insufficient_privilege; end if;
 if p_code is null or p_code not in ('needs_review','evidence_consistent','unavailable') or (c.provider='official' and p_code!='unavailable') or c.provider='manual' then raise check_violation; end if;
 if c.state='cancelled' or a.status in ('withdrawn','rejected','job_closed') or exists(select 1 from kerja_private.consents where id=c.consent_id and revoked_at is not null) then
  insert into kerja_private.background_late_results(case_id,lease,result_code) values(c.id,p_lease,p_code) on conflict(case_id,lease) do nothing;
  return jsonb_build_object('state','quarantined','official',false);
 end if;
 if w.state='done' then return jsonb_build_object('state',c.state,'official',false); end if;
 if w.state!='leased' or w.lease_until<=now() or c.state!='queued' then raise serialization_failure; end if;
 update kerja_private.background_cases set state=p_code,result_code=case when c.provider='mock' then 'simulated_'||p_code else 'not_configured' end,
 coverage=case when c.provider='mock' then 'synthetic_workflow_only' else 'no_check_performed' end,expires_at=now()+interval '30 days',version=version+1 where id=c.id;
 update kerja_private.work_items set state='done',lease_until=null where id=w.id;
 if p_code='needs_review' then perform kerja_private.m5_hold(a.id); end if;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type) values(a.id,null,'system','background_result_available');
 insert into public.m1_outbox(application_id,recipient_id,event_type) values(a.id,a.candidate_id,'background_result_available');
 return jsonb_build_object('id',c.id,'state',p_code,'official',false,'coverage',case when c.provider='mock' then 'synthetic_workflow_only' else 'no_check_performed' end);
end; $$;
create function kerja_private.m5_dispute(p_case uuid,p_version integer,p_explanation text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c kerja_private.background_cases; a public.m1_applications; d uuid;
begin
 select application_id into c.application_id from kerja_private.background_cases where id=p_case;
 select * into a from public.m1_applications where id=c.application_id for update;
 select * into c from kerja_private.background_cases where id=p_case for update;
 if not kerja_private.active_auth_session() or c.id is null or a.candidate_id!=auth.uid() then raise insufficient_privilege; end if;
 if c.version is distinct from p_version or c.state not in ('needs_review','evidence_consistent','reviewed','unavailable','on_hold') or a.status not in ('under_review','on_hold','shortlisted','interview_ready')
 or length(trim(coalesce(p_explanation,''))) not between 5 and 1000 or exists(select 1 from kerja_private.background_disputes where case_id=c.id and resolved_at is null) then raise check_violation; end if;
 insert into kerja_private.background_disputes(case_id,explanation) values(c.id,p_explanation) returning id into d;
 update kerja_private.background_cases set state='on_hold',version=version+1 where id=c.id;
 update kerja_private.pipeline_evidence set revoked_at=now() where background_case_id=c.id and revoked_at is null;
 perform kerja_private.m5_hold(a.id);
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type) values(a.id,auth.uid(),'human','background_explanation');
 insert into public.m1_outbox(application_id,recipient_id,event_type) values(a.id,a.candidate_id,'background_explanation');
 return jsonb_build_object('id',d,'state','on_hold');
end; $$;
create function kerja_private.m5_review(p_case uuid,p_version integer,p_decision text,p_reason text,p_attested boolean,p_considered boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare c kerja_private.background_cases; a public.m1_applications; cfg jsonb; evidence uuid; k text;
begin
 select application_id into c.application_id from kerja_private.background_cases where id=p_case;
 select * into a from public.m1_applications where id=c.application_id for update;
 select * into c from kerja_private.background_cases where id=p_case for update;
 if c.id is null or not kerja_private.m4_staff(a.job_id) then raise insufficient_privilege; end if;
 if a.stage not in ('P4','P5','P6') or a.status not in ('under_review','on_hold','shortlisted','interview_ready') or c.version is distinct from p_version or c.state not in ('needs_review','evidence_consistent','unavailable','on_hold') then raise serialization_failure; end if;
 if p_attested is distinct from true or p_decision is null or p_decision not in ('satisfied','adverse_reviewed','exception') or length(trim(coalesce(p_reason,''))) not between 15 and 1000
 or exists(select 1 from kerja_private.consents where id=c.consent_id and revoked_at is not null) then raise check_violation; end if;
 if exists(select 1 from kerja_private.background_disputes where case_id=c.id and resolved_at is null) and p_considered is distinct from true then raise check_violation; end if;
 select x into cfg from jsonb_array_elements(a.policy_snapshot->'background_policy'->'checks') x where x->>'kind'=c.kind;
 if c.coverage='no_check_performed' or c.provider='official' or c.result_code is null then
  if p_decision!='exception' then raise check_violation; end if;
 end if;
 if c.provider='manual' and not exists(select 1 from kerja_private.documents where id=c.document_id and state='quarantined' and expires_at>now() and deleted_at is null) then raise check_violation; end if;
 if p_decision='exception' and (cfg->>'exception_allowed' is distinct from 'true' or not exists(select 1 from public.m1_memberships where user_id=auth.uid() and employer_id=a.employer_id and active and role='admin')) then raise insufficient_privilege; end if;
 update kerja_private.background_disputes set resolved_at=now(),resolved_by=auth.uid() where case_id=c.id and resolved_at is null;
 update kerja_private.background_cases set state='reviewed',version=version+1,review_decision=p_decision,reviewer_id=auth.uid(),review_reason=p_reason,reviewed_at=now(),expires_at=now()+interval '30 days' where id=c.id;
 k:=case when c.kind='criminal' then 'criminal' else 'credit' end;
 -- Exceptions use a satisfied gate only after explicit authorized per-check approval;
 -- their separate case decision/provenance never claims a check occurred.
 insert into kerja_private.pipeline_evidence(application_id,kind,outcome,method,reviewer_id,consent_id,expires_at,reason,background_case_id)
 values(a.id,k,case when p_decision='adverse_reviewed' then 'needs_review' else 'satisfied' end,case when c.synthetic then 'mock' else 'manual' end,auth.uid(),c.consent_id,now()+interval '30 days',p_reason,c.id) returning id into evidence;
 update kerja_private.documents set expires_at=least(expires_at,now()+interval '1 hour') where id=c.document_id and deleted_at is null;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type) values(a.id,auth.uid(),'human','background_human_review');
 insert into public.m1_outbox(application_id,recipient_id,event_type) values(a.id,a.candidate_id,'background_human_review');
 return jsonb_build_object('id',c.id,'evidence_id',evidence,'decision',p_decision,'stage_unchanged',true);
end; $$;
create function kerja_private.m5_cancel_case(p_case uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update kerja_private.background_cases set state='cancelled',version=version+1 where id=p_case and state!='cancelled';
 if found then
  insert into public.m1_application_events(application_id,actor_id,actor_type,event_type) select application_id,null,'system','background_cancelled' from kerja_private.background_cases where id=p_case;
  insert into public.m1_outbox(application_id,recipient_id,event_type) select a.id,a.candidate_id,'background_cancelled' from kerja_private.background_cases c join public.m1_applications a on a.id=c.application_id where c.id=p_case;
 end if;
 update kerja_private.pipeline_evidence set revoked_at=now() where background_case_id=p_case and revoked_at is null;
 update kerja_private.documents set expires_at=least(expires_at,now()) where id=(select document_id from kerja_private.background_cases where id=p_case) and deleted_at is null;
 update kerja_private.work_items set state='cancelled' where reference_id=p_case and kind='background' and state!='done';
end; $$;
create function kerja_private.m5_cancel_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
 if tg_table_name='consents' then
  if new.revoked_at is not null and old.revoked_at is null then for c in select id from kerja_private.background_cases where consent_id=new.id loop perform kerja_private.m5_cancel_case(c); end loop; end if;
 else
  if new.status in ('withdrawn','rejected','job_closed') and new.status!=old.status then for c in select id from kerja_private.background_cases where application_id=new.id loop perform kerja_private.m5_cancel_case(c); end loop; end if;
 end if;
 return new;
end; $$;
create trigger m5_cancel_application after update of status on public.m1_applications for each row execute function kerja_private.m5_cancel_trigger();
create trigger m5_cancel_consent after update of revoked_at on kerja_private.consents for each row execute function kerja_private.m5_cancel_trigger();
create function kerja_private.m5_revoke(p_case uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c kerja_private.background_cases;
begin
 select * into c from kerja_private.background_cases where id=p_case;
 if not kerja_private.active_auth_session() or not exists(select 1 from public.m1_applications where id=c.application_id and candidate_id=auth.uid()) then raise insufficient_privilege; end if;
 update kerja_private.consents set revoked_at=now() where id=c.consent_id and revoked_at is null;
 return jsonb_build_object('revoked',true,'profile_deleted',false);
end; $$;

-- Credit/criminal gates are per typed policy; generic/unbound legacy evidence cannot satisfy them.
alter function kerja_private.m2_requirements_met(uuid,text) rename to m5_requirements_before_background;
create function kerja_private.m2_requirements_met(p_app uuid,p_kind text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.m1_applications; cfg jsonb;
begin
 if p_kind not in ('credit','criminal') then return kerja_private.m5_requirements_before_background(p_app,p_kind); end if;
 select * into a from public.m1_applications where id=p_app;
 if a.id is null or a.policy_snapshot->'background_policy' is null then return false; end if;
 for cfg in select x from jsonb_array_elements(a.policy_snapshot->'background_policy'->'checks') x where case when x->>'kind'='criminal' then 'criminal' else 'credit' end=p_kind loop
  if not exists(select 1 from kerja_private.background_cases c join kerja_private.pipeline_evidence e on e.background_case_id=c.id join kerja_private.consents s on s.id=c.consent_id
   join public.m1_memberships m on m.user_id=c.reviewer_id and m.employer_id=a.employer_id join public.m1_job_assignments ja on ja.user_id=m.user_id and ja.job_id=a.job_id
   where c.application_id=a.id and c.kind=cfg->>'kind' and c.state='reviewed' and c.review_decision in ('satisfied','exception') and c.expires_at>now()
   and e.revoked_at is null and e.expires_at>now() and e.outcome='satisfied' and e.reviewer_id=c.reviewer_id
   and s.revoked_at is null and s.purpose=c.kind and s.application_id=a.id and s.version='background-'||c.kind||'-v1'
   and m.active and m.role in ('hm','admin') and (not c.synthetic or a.policy_snapshot->>'demo_only'='true')
   and (c.review_decision!='exception' or (m.role='admin' and cfg->>'exception_allowed'='true'))
   and not exists(select 1 from kerja_private.background_disputes d where d.case_id=c.id and d.resolved_at is null)) then return false; end if;
 end loop;
 return exists(select 1 from jsonb_array_elements(a.policy_snapshot->'background_policy'->'checks') x where case when x->>'kind'='criminal' then 'criminal' else 'credit' end=p_kind);
end; $$;
alter function kerja_private.m2_transition(uuid,text,integer,uuid,text,jsonb) rename to m5_transition_before_background;
create function kerja_private.m2_transition(p_id uuid,p_action text,p_version integer,p_key uuid,p_reason text,p_evidence jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.m1_applications; job uuid;
begin
 select job_id into job from public.m1_applications where id=p_id;
 perform 1 from public.m1_jobs where id=job for update;
 select * into a from public.m1_applications where id=p_id for update;
 if p_action in ('reject','resume','advance','shortlist','interview_entry') and exists(select 1 from kerja_private.background_cases where application_id=p_id and state='on_hold') then raise check_violation; end if;
 if p_action='reject' and exists(select 1 from kerja_private.background_cases where application_id=p_id and state!='cancelled') then
  if not exists(select 1 from kerja_private.background_cases c join kerja_private.pipeline_evidence e on e.background_case_id=c.id
    where c.application_id=p_id and c.state='reviewed' and c.review_decision='adverse_reviewed' and e.revoked_at is null and e.expires_at>now() and p_evidence ? e.id::text)
   or length(trim(coalesce(p_reason,'')))<15 then raise check_violation; end if;
 end if;
 return kerja_private.m5_transition_before_background(p_id,p_action,p_version,p_key,p_reason,p_evidence);
end; $$;
revoke all on function kerja_private.m5_transition_before_background(uuid,text,integer,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function kerja_private.m2_requirements_met(uuid,text),kerja_private.m5_hold(uuid),kerja_private.m5_cancel_case(uuid),kerja_private.m5_cancel_trigger(),kerja_private.m5_claim(uuid,uuid),kerja_private.m5_finish(uuid,uuid,text) from public,anon,authenticated;

-- Private encrypted PDF report: quarantine, 24h expiry, rechecked consent on every read.
create function kerja_private.m5_upload_intent(p_case uuid,p_doc uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c kerja_private.background_cases; a public.m1_applications; key text;
begin
 select application_id into c.application_id from kerja_private.background_cases where id=p_case;
 select * into a from public.m1_applications where id=c.application_id for update;
 select * into c from kerja_private.background_cases where id=p_case for update;
 if not kerja_private.active_auth_session() or a.candidate_id!=auth.uid() or c.id is null then raise insufficient_privilege; end if;
 if c.provider!='manual' or c.state not in ('awaiting_document','needs_review','on_hold') or a.stage!='P4' or a.status not in ('under_review','on_hold')
 or exists(select 1 from kerja_private.consents where id=c.consent_id and revoked_at is not null)
 or (not c.synthetic and (a.policy_snapshot->'background_policy'->>'legal_approved' is distinct from 'true' or not exists(select 1 from kerja_private.background_policy where real_manual_enabled)))
 or exists(select 1 from kerja_private.documents where purpose='background' and deleted_at is null and ((state!='upload_pending' and expires_at<=now()) or (state='upload_pending' and created_at<now()-interval '1 hour')))
 or (select count(*) from kerja_private.documents where application_id=a.id and purpose='background' and created_at>now()-interval '1 day')>=3 then raise check_violation; end if;
 key:=auth.uid()::text||'/'||p_doc::text||'.enc';
 insert into kerja_private.documents(id,owner_id,application_id,object_key,purpose,expires_at,media_type) values(p_doc,auth.uid(),a.id,key,'background',now()+interval '24 hours','application/pdf');
 update kerja_private.documents set expires_at=least(expires_at,now()) where id=c.document_id and deleted_at is null;
 update kerja_private.background_cases set document_id=p_doc,version=version+1 where id=c.id;
 return jsonb_build_object('id',p_doc,'object_key',key,'expires_at',now()+interval '24 hours');
end; $$;
create function public.m5_document_ready(p_doc uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 update kerja_private.documents set state='quarantined' where id=p_doc and purpose='background' and deleted_at is null and state='upload_pending';
 update kerja_private.background_cases c set state='evidence_consistent',result_code='candidate_supplied_unverified',coverage='manual_document_only',version=version+1
 where document_id=p_doc and state!='cancelled' and exists(select 1 from kerja_private.documents d where d.id=p_doc and d.state='quarantined');
end; $$;
create function kerja_private.m5_document(p_case uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',d.id,'object_key',d.object_key,'media_type',d.media_type) from kerja_private.background_cases c join public.m1_applications a on a.id=c.application_id join kerja_private.documents d on d.id=c.document_id join kerja_private.consents s on s.id=c.consent_id
 where c.id=p_case and kerja_private.active_auth_session() and (a.candidate_id=auth.uid() or kerja_private.m4_staff(a.job_id)) and c.state!='cancelled' and s.revoked_at is null and d.deleted_at is null and d.expires_at>now() and d.state='quarantined';
$$;
create function public.m5_cleanup_claim(p_lease uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d kerja_private.documents;
begin
 select * into d from kerja_private.documents where purpose='background' and deleted_at is null and ((state!='upload_pending' and expires_at<=now()) or (state='upload_pending' and created_at<now()-interval '1 hour'))
 and (deletion_lease_until is null or deletion_lease_until<now()) order by expires_at for update skip locked limit 1;
 if d.id is null then return null; end if;
 update kerja_private.documents set deletion_lease=p_lease,deletion_lease_until=now()+interval '2 minutes' where id=d.id;
 return jsonb_build_object('id',d.id,'object_key',d.object_key);
end; $$;
create function public.m5_cleanup_complete(p_doc uuid,p_lease uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update kerja_private.documents set state='deleted',deleted_at=now(),deletion_lease=null,deletion_lease_until=null where id=p_doc and purpose='background' and deleted_at is null and deletion_lease=p_lease and deletion_lease_until>now();
 if not found then return false; end if;
 insert into kerja_private.background_deletion_ledger values(p_doc,now(),true) on conflict do nothing;
 update kerja_private.background_cases set state='needs_review',version=version+1,result_code='report_expired' where document_id=p_doc and state in ('awaiting_document','evidence_consistent');
 return true;
end; $$;
revoke all on function public.m5_document_ready(uuid),public.m5_cleanup_claim(uuid),public.m5_cleanup_complete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.m5_document_ready(uuid),public.m5_cleanup_claim(uuid),public.m5_cleanup_complete(uuid,uuid) to service_role;
create function public.m5_claim_next(p_lease uuid) returns jsonb language sql security definer set search_path='' as $$ select kerja_private.m5_claim(null,p_lease); $$;
create function public.m5_finish(p_case uuid,p_lease uuid,p_code text) returns jsonb language sql security definer set search_path='' as $$ select kerja_private.m5_finish(p_case,p_lease,p_code); $$;
revoke all on function public.m5_claim_next(uuid),public.m5_finish(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.m5_claim_next(uuid),public.m5_finish(uuid,uuid,text) to service_role;
-- User RPC facades generated below; internal helpers remain private.

revoke all on function kerja_private.m5_configure(uuid,jsonb) from public,anon;
grant execute on function kerja_private.m5_configure(uuid,jsonb) to authenticated;
create function public.m5_configure(p_job uuid,p_checks jsonb) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m5_configure(p_job,p_checks); $$;
revoke all on function public.m5_configure(uuid,jsonb) from public,anon;
grant execute on function public.m5_configure(uuid,jsonb) to authenticated;

revoke all on function kerja_private.m5_applications(boolean) from public,anon;
grant execute on function kerja_private.m5_applications(boolean) to authenticated;
create function public.m5_applications(p_staff boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m5_applications(p_staff); $$;
revoke all on function public.m5_applications(boolean) from public,anon;
grant execute on function public.m5_applications(boolean) to authenticated;

revoke all on function kerja_private.m5_consent(uuid,text,text,boolean) from public,anon;
grant execute on function kerja_private.m5_consent(uuid,text,text,boolean) to authenticated;
create function public.m5_consent(p_application uuid,p_kind text,p_version text,p_agree boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m5_consent(p_application,p_kind,p_version,p_agree); $$;
revoke all on function public.m5_consent(uuid,text,text,boolean) from public,anon;
grant execute on function public.m5_consent(uuid,text,text,boolean) to authenticated;

revoke all on function kerja_private.m5_start(uuid,text,uuid,boolean,text) from public,anon;
grant execute on function kerja_private.m5_start(uuid,text,uuid,boolean,text) to authenticated;
create function public.m5_start(p_application uuid,p_kind text,p_key uuid,p_synthetic boolean,p_scenario text) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m5_start(p_application,p_kind,p_key,p_synthetic,p_scenario); $$;
revoke all on function public.m5_start(uuid,text,uuid,boolean,text) from public,anon;
grant execute on function public.m5_start(uuid,text,uuid,boolean,text) to authenticated;

revoke all on function kerja_private.m5_cases(boolean) from public,anon;
grant execute on function kerja_private.m5_cases(boolean) to authenticated;
create function public.m5_cases(p_staff boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m5_cases(p_staff); $$;
revoke all on function public.m5_cases(boolean) from public,anon;
grant execute on function public.m5_cases(boolean) to authenticated;

revoke all on function kerja_private.m5_claim_user(uuid,uuid) from public,anon;
grant execute on function kerja_private.m5_claim_user(uuid,uuid) to authenticated;
create function public.m5_claim_user(p_case uuid,p_lease uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m5_claim_user(p_case,p_lease); $$;
revoke all on function public.m5_claim_user(uuid,uuid) from public,anon;
grant execute on function public.m5_claim_user(uuid,uuid) to authenticated;

revoke all on function kerja_private.m5_dispute(uuid,integer,text) from public,anon;
grant execute on function kerja_private.m5_dispute(uuid,integer,text) to authenticated;
create function public.m5_dispute(p_case uuid,p_version integer,p_explanation text) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m5_dispute(p_case,p_version,p_explanation); $$;
revoke all on function public.m5_dispute(uuid,integer,text) from public,anon;
grant execute on function public.m5_dispute(uuid,integer,text) to authenticated;

revoke all on function kerja_private.m5_review(uuid,integer,text,text,boolean,boolean) from public,anon;
grant execute on function kerja_private.m5_review(uuid,integer,text,text,boolean,boolean) to authenticated;
create function public.m5_review(p_case uuid,p_version integer,p_decision text,p_reason text,p_attested boolean,p_considered boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m5_review(p_case,p_version,p_decision,p_reason,p_attested,p_considered); $$;
revoke all on function public.m5_review(uuid,integer,text,text,boolean,boolean) from public,anon;
grant execute on function public.m5_review(uuid,integer,text,text,boolean,boolean) to authenticated;

revoke all on function kerja_private.m5_revoke(uuid) from public,anon;
grant execute on function kerja_private.m5_revoke(uuid) to authenticated;
create function public.m5_revoke(p_case uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m5_revoke(p_case); $$;
revoke all on function public.m5_revoke(uuid) from public,anon;
grant execute on function public.m5_revoke(uuid) to authenticated;

revoke all on function kerja_private.m5_upload_intent(uuid,uuid) from public,anon;
grant execute on function kerja_private.m5_upload_intent(uuid,uuid) to authenticated;
create function public.m5_upload_intent(p_case uuid,p_doc uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m5_upload_intent(p_case,p_doc); $$;
revoke all on function public.m5_upload_intent(uuid,uuid) from public,anon;
grant execute on function public.m5_upload_intent(uuid,uuid) to authenticated;

revoke all on function kerja_private.m5_document(uuid) from public,anon;
grant execute on function kerja_private.m5_document(uuid) to authenticated;
create function public.m5_document(p_case uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m5_document(p_case); $$;
revoke all on function public.m5_document(uuid) from public,anon;
grant execute on function public.m5_document(uuid) to authenticated;
revoke all on function kerja_private.m2_transition(uuid,text,integer,uuid,text,jsonb) from public,anon;
grant execute on function kerja_private.m2_transition(uuid,text,integer,uuid,text,jsonb) to authenticated;
create or replace function public.m2_transition(p_id uuid,p_action text,p_version integer,p_key uuid,p_reason text,p_evidence jsonb) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m2_transition(p_id,p_action,p_version,p_key,p_reason,p_evidence); $$;
create or replace function kerja_private.human_decision(p_application uuid,p_decision text,p_reason text,p_version integer,p_key uuid) returns jsonb language sql security definer set search_path='' as $$
 select kerja_private.m2_transition(p_application,case p_decision when 'rejected' then 'reject' when 'shortlisted' then 'shortlist' else '' end,p_version,p_key,p_reason,jsonb_build_array(p_application));
$$;
commit;
