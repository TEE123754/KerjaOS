-- M2 additive pipeline. Apply only after M1's configured backup/live gate.
begin;
alter table public.m1_jobs add column policy jsonb not null default '{"version":1,"demo_only":true,"required_identity":true,"required_quiz":true,"background_checks":[],"allowed_skips":[],"allowed_exceptions":[],"stage_days":7}';
alter table public.m1_jobs add column closed_at timestamptz;
alter table public.m1_applications add column policy_snapshot jsonb not null default '{"version":1,"demo_only":true,"required_identity":true,"required_quiz":true,"background_checks":[],"allowed_skips":[],"allowed_exceptions":[],"stage_days":7}';
alter table public.m1_applications add column next_action text not null default 'await_resume_review';
alter table public.m1_applications add column deadline_at timestamptz;
alter table public.m1_applications add column resume_snapshot_id uuid references kerja_private.documents(id);
alter table public.m1_applications add column paused_next_action text;
alter table public.m1_applications add column previous_status text;
alter table public.m1_applications add constraint m2_stages check(stage in ('P0','P1','P2','P3','P4','P5','P6'));
create table kerja_private.pipeline_evidence (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.m1_applications(id),
 kind text not null check(kind in ('identity','quiz','credit','criminal')), outcome text not null check(outcome in ('satisfied','exception','needs_review')),
 method text not null check(method in ('manual','official','mock')), reviewer_id uuid not null references auth.users(id),
 consent_id uuid references kerja_private.consents(id), expires_at timestamptz not null, revoked_at timestamptz,
 reason text not null check(length(trim(reason))>=5), created_at timestamptz not null default now()
);
create table kerja_private.pipeline_notes (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.m1_applications(id),
 actor_id uuid not null references auth.users(id), note text not null, evidence_ids jsonb not null default '[]', created_at timestamptz not null default now()
);
alter table kerja_private.pipeline_evidence enable row level security;
alter table kerja_private.pipeline_notes enable row level security;
revoke all on kerja_private.pipeline_evidence,kerja_private.pipeline_notes from public,anon,authenticated;
grant all on kerja_private.pipeline_evidence,kerja_private.pipeline_notes to service_role;
create index m2_evidence_application on kerja_private.pipeline_evidence(application_id,kind);
create index m2_notes_application on kerja_private.pipeline_notes(application_id,created_at);
grant select(closed_at) on public.m1_jobs to anon,authenticated;

create function kerja_private.m2_requirements_met(p_app uuid,p_kind text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kerja_private.pipeline_evidence e join public.m1_applications a on a.id=e.application_id
 where a.id=p_app and e.kind=p_kind and e.revoked_at is null and e.expires_at>now()
 and (e.method!='mock' or a.policy_snapshot->>'demo_only'='true')
 and ((e.outcome='satisfied' and exists(select 1 from public.m1_memberships m
       where m.user_id=e.reviewer_id and m.employer_id=a.employer_id and m.active and m.role in ('hm','admin','reviewer')))
   or (e.outcome='exception' and (a.policy_snapshot->'allowed_exceptions') ? p_kind and exists(select 1 from public.m1_memberships m
       where m.user_id=e.reviewer_id and m.employer_id=a.employer_id and m.active and m.role='admin')))
 and (p_kind='quiz' or exists(select 1 from kerja_private.consents c where c.id=e.consent_id
      and c.candidate_id=a.candidate_id and c.employer_id=a.employer_id and c.purpose=p_kind and c.revoked_at is null
      and c.version=coalesce(a.policy_snapshot->'consent_versions'->>p_kind,c.version)))
 );
$$;
revoke all on function kerja_private.m2_requirements_met(uuid,text) from public,anon,authenticated;

create or replace function kerja_private.submit_application(p_job uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.m1_jobs; a public.m1_applications; prior kerja_private.operation_keys; result jsonb;
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select * into prior from kerja_private.operation_keys where actor_id=auth.uid() and key=p_key;
 if found then
   if prior.operation!='apply' or prior.request!=jsonb_build_object('job',p_job) then raise unique_violation; end if;
   return prior.result;
 end if;
 select * into j from public.m1_jobs where id=p_job for update;
 if not found or not j.published or j.closed_at is not null then raise no_data_found; end if;
 if not exists(select 1 from public.m1_profiles where id=auth.uid()) then raise insufficient_privilege; end if;
 insert into public.m1_applications(candidate_id,job_id,employer_id,cycle,submission_snapshot,policy_snapshot,deadline_at)
 values(auth.uid(),j.id,j.employer_id,j.cycle,
 (select jsonb_build_object('display_name',display_name,'locale',locale,'job_title',j.title) from public.m1_profiles where id=auth.uid()),j.policy,
 now()+make_interval(days=>least(30,greatest(1,coalesce((j.policy->>'stage_days')::integer,7))))) returning * into a;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type) values(a.id,auth.uid(),'human','applied');
 insert into public.m1_outbox(application_id,recipient_id,event_type) values(a.id,a.candidate_id,'applied');
 result:=jsonb_build_object('id',a.id,'job_id',a.job_id,'stage',a.stage,'status',a.status,'version',a.version);
 insert into kerja_private.operation_keys values(auth.uid(),p_key,'apply',jsonb_build_object('job',p_job),result);
 return result;
end; $$;

create function kerja_private.m2_transition(p_id uuid,p_action text,p_version integer,p_key uuid,p_reason text,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.m1_applications; j public.m1_jobs; prior kerja_private.operation_keys; request jsonb; result jsonb;
 staff boolean; target text; check_kind text; doc uuid;
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 if length(trim(p_reason))<5 or length(p_reason)>1000 or p_action not in ('advance','pause','resume','shortlist','reject','withdraw','reopen','skip','interview_entry','note') then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select job_id into doc from public.m1_applications where id=p_id;
 select * into j from public.m1_jobs where id=doc for update;
 select * into a from public.m1_applications where id=p_id for update;
 if not found then raise no_data_found; end if;
 staff:=kerja_private.can_review(a.job_id) and exists(select 1 from public.m1_memberships
 where user_id=auth.uid() and employer_id=a.employer_id and active and role in ('hm','admin'));
 if p_action='withdraw' then
   if a.candidate_id!=auth.uid() then raise insufficient_privilege; end if;
 elsif not staff then raise insufficient_privilege; end if;
 request:=jsonb_build_object('id',p_id,'action',p_action,'version',p_version,'reason',p_reason,'evidence',p_evidence);
 select * into prior from kerja_private.operation_keys where actor_id=auth.uid() and key=p_key;
 if found then
   if prior.operation!='transition' or prior.request!=request then raise unique_violation; end if;
   return prior.result;
 end if;
 if a.version!=p_version then raise serialization_failure; end if;
 if j.closed_at is not null or a.status in ('rejected','hired','job_closed') then raise serialization_failure; end if;
 if p_action!='withdraw' then
   if jsonb_typeof(p_evidence)!='array' or jsonb_array_length(p_evidence)<1 or jsonb_array_length(p_evidence)>10 then raise insufficient_privilege; end if;
   for check_kind in select jsonb_array_elements_text(p_evidence) loop
     if check_kind!=a.id::text and not exists(select 1 from kerja_private.documents where id::text=check_kind and application_id=a.id and deleted_at is null and expires_at>now())
        and not exists(select 1 from kerja_private.pipeline_evidence where id::text=check_kind and application_id=a.id and revoked_at is null and expires_at>now()) then raise insufficient_privilege; end if;
   end loop;
 end if;
 if p_action='reopen' then
   -- Explicit same-cycle restoration only before screening; reviewed new cycles use a new application.
   if a.status!='withdrawn' or a.stage!='P0' then raise serialization_failure; end if;
   a.status:='applied'; a.next_action:='await_resume_review';
 elsif a.status='withdrawn' then raise serialization_failure;
 elsif p_action='withdraw' then a.status:='withdrawn'; a.next_action:='none';
 elsif p_action='reject' then a.status:='rejected'; a.next_action:='none';
 elsif p_action='pause' then
   if a.status in ('on_hold','shortlisted','interview_ready') then raise serialization_failure; end if;
   a.previous_status:=a.status; a.paused_next_action:=a.next_action; a.status:='on_hold'; a.next_action:='await_human_review';
 elsif p_action='resume' then
   if a.status!='on_hold' or a.previous_status is null then raise serialization_failure; end if;
   a.status:=a.previous_status; a.previous_status:=null; a.next_action:=coalesce(a.paused_next_action,'await_human_review'); a.paused_next_action:=null;
 elsif p_action='note' then
   insert into kerja_private.pipeline_notes(application_id,actor_id,note,evidence_ids) values(a.id,auth.uid(),p_reason,p_evidence);
 elsif p_action='interview_entry' then
   if a.stage!='P6' or a.status!='shortlisted' then raise serialization_failure; end if;
   if coalesce((a.policy_snapshot->>'required_identity')::boolean,true) and not kerja_private.m2_requirements_met(a.id,'identity') then raise check_violation; end if;
   if coalesce((a.policy_snapshot->>'required_quiz')::boolean,true) and not kerja_private.m2_requirements_met(a.id,'quiz') then raise check_violation; end if;
   for check_kind in select jsonb_array_elements_text(coalesce(a.policy_snapshot->'background_checks','[]')) loop
     if not kerja_private.m2_requirements_met(a.id,check_kind) then raise check_violation; end if;
   end loop;
   a.status:='interview_ready'; a.next_action:='schedule_human_interview';
 else
   if a.status in ('on_hold','shortlisted','interview_ready') then raise serialization_failure; end if;
   -- Recheck all completed required gates, including revoked/expired evidence.
   if a.stage in ('P3','P4','P5') and coalesce((a.policy_snapshot->>'required_identity')::boolean,true) and not kerja_private.m2_requirements_met(a.id,'identity') then raise check_violation; end if;
   if a.stage in ('P4','P5') and coalesce((a.policy_snapshot->>'required_quiz')::boolean,true) and not kerja_private.m2_requirements_met(a.id,'quiz') then raise check_violation; end if;
   if p_action='shortlist' then
     if a.stage!='P5' then raise check_violation; end if;
     for check_kind in select jsonb_array_elements_text(coalesce(a.policy_snapshot->'background_checks','[]')) loop
       if not kerja_private.m2_requirements_met(a.id,check_kind) then raise check_violation; end if;
     end loop;
     a.stage:='P6'; a.status:='shortlisted'; a.next_action:='schedule_human_interview';
   else
     if a.stage='P5' or a.stage='P6' then raise check_violation; end if;
     if p_action='skip' and not (a.policy_snapshot->'allowed_skips') ? a.stage then raise check_violation; end if;
     if a.stage='P1' and p_action!='skip' then
       select id into doc from kerja_private.documents where application_id=a.id and purpose='resume' and state in ('quarantined','ready') and deleted_at is null and expires_at>now() order by created_at desc limit 1;
       if doc is null then raise check_violation; end if;
       a.resume_snapshot_id:=doc;
     end if;
     if a.stage='P2' and coalesce((a.policy_snapshot->>'required_identity')::boolean,true) and not kerja_private.m2_requirements_met(a.id,'identity') then raise check_violation; end if;
     if a.stage='P3' and coalesce((a.policy_snapshot->>'required_quiz')::boolean,true) and not kerja_private.m2_requirements_met(a.id,'quiz') then raise check_violation; end if;
     if a.stage='P4' then
       for check_kind in select jsonb_array_elements_text(coalesce(a.policy_snapshot->'background_checks','[]')) loop
         if not kerja_private.m2_requirements_met(a.id,check_kind) then raise check_violation; end if;
       end loop;
     end if;
     a.stage:='P'||((substring(a.stage from 2))::integer+1)::text;
     a.status:='under_review';
     a.next_action:=case a.stage when 'P1' then 'await_resume_review' when 'P2' then 'complete_identity' when 'P3' then 'complete_quiz' when 'P4' then 'await_background_review' else 'await_human_decision' end;
   end if;
 end if;
 update public.m1_applications set stage=a.stage,status=a.status,next_action=a.next_action,version=version+1,
 resume_snapshot_id=a.resume_snapshot_id,previous_status=a.previous_status,paused_next_action=a.paused_next_action,
 deadline_at=case when p_action='note' then a.deadline_at when a.next_action='none' then null else now()+make_interval(days=>least(30,greatest(1,coalesce((a.policy_snapshot->>'stage_days')::integer,7)))) end
 where id=a.id returning * into a;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type,reason)
 values(a.id,auth.uid(),'human',p_action,case when p_action='note' then 'Internal review note recorded' else p_reason end);
 if p_action!='note' then insert into public.m1_outbox(application_id,recipient_id,event_type) values(a.id,a.candidate_id,p_action); end if;
 if a.status in ('withdrawn','rejected') then update kerja_private.documents set expires_at=least(expires_at,now()+interval '24 hours') where application_id=a.id and deleted_at is null; end if;
 result:=jsonb_build_object('id',a.id,'stage',a.stage,'status',a.status,'version',a.version,'next_action',a.next_action);
 insert into kerja_private.operation_keys values(auth.uid(),p_key,'transition',request,result);
 return result;
end; $$;
revoke all on function kerja_private.m2_transition(uuid,text,integer,uuid,text,jsonb) from public,anon;
grant execute on function kerja_private.m2_transition(uuid,text,integer,uuid,text,jsonb) to authenticated;
create function public.m2_transition(p_id uuid,p_action text,p_version integer,p_key uuid,p_reason text,p_evidence jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select kerja_private.m2_transition(p_id,p_action,p_version,p_key,p_reason,p_evidence); $$;
revoke all on function public.m2_transition(uuid,text,integer,uuid,text,jsonb) from public,anon;
grant execute on function public.m2_transition(uuid,text,integer,uuid,text,jsonb) to authenticated;

-- Retire the M1 decision mutation; all decisions now share the audited service.
create or replace function kerja_private.human_decision(p_application uuid,p_decision text,p_reason text,p_version integer,p_key uuid) returns jsonb
language sql security definer set search_path='' as $$
 select kerja_private.m2_transition(p_application,case p_decision when 'rejected' then 'reject' when 'shortlisted' then 'shortlist' else '' end,p_version,p_key,p_reason,jsonb_build_array(p_application));
$$;

create function kerja_private.m2_close_job(p_job uuid,p_key uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.m1_jobs; a public.m1_applications; prior kerja_private.operation_keys; result jsonb; n integer:=0;
begin
 if not kerja_private.active_auth_session() or not kerja_private.can_review(p_job) or length(trim(p_reason))<5 or length(p_reason)>1000 then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select * into j from public.m1_jobs where id=p_job for update;
 if not exists(select 1 from public.m1_memberships where user_id=auth.uid() and employer_id=j.employer_id and role in ('hm','admin') and active) then raise insufficient_privilege; end if;
 select * into prior from kerja_private.operation_keys where actor_id=auth.uid() and key=p_key;
 if found then
   if prior.operation!='close_job' or prior.request!=jsonb_build_object('job',p_job,'reason',p_reason) then raise unique_violation; end if;
   return prior.result;
 end if;
 if j.closed_at is not null then raise serialization_failure; end if;
 update public.m1_jobs set closed_at=now(),published=false where id=p_job;
 for a in select * from public.m1_applications where job_id=p_job and status not in ('rejected','withdrawn','hired','job_closed') order by id for update loop
   update public.m1_applications set status='job_closed',next_action='none',deadline_at=null,version=version+1 where id=a.id;
   insert into public.m1_application_events(application_id,actor_id,actor_type,event_type,reason) values(a.id,auth.uid(),'human','job_closed',p_reason);
   insert into public.m1_outbox(application_id,recipient_id,event_type) values(a.id,a.candidate_id,'job_closed');
   update kerja_private.documents set expires_at=least(expires_at,now()+interval '24 hours') where application_id=a.id and deleted_at is null;
   n:=n+1;
 end loop;
 result:=jsonb_build_object('job_id',p_job,'closed_applications',n);
 insert into kerja_private.operation_keys values(auth.uid(),p_key,'close_job',jsonb_build_object('job',p_job,'reason',p_reason),result);
 return result;
end; $$;
revoke all on function kerja_private.m2_close_job(uuid,uuid,text) from public,anon;
grant execute on function kerja_private.m2_close_job(uuid,uuid,text) to authenticated;
create function public.m2_close_job(p_job uuid,p_key uuid,p_reason text) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m2_close_job(p_job,p_key,p_reason); $$;
revoke all on function public.m2_close_job(uuid,uuid,text) from public,anon;
grant execute on function public.m2_close_job(uuid,uuid,text) to authenticated;

create function kerja_private.m2_staff_notes(p_id uuid) returns table(id uuid,note text,evidence_ids jsonb,created_at timestamptz)
language sql security definer set search_path='' as $$
 select n.id,n.note,n.evidence_ids,n.created_at from kerja_private.pipeline_notes n join public.m1_applications a on a.id=n.application_id
 where a.id=p_id and kerja_private.can_review(a.job_id);
$$;
revoke all on function kerja_private.m2_staff_notes(uuid) from public,anon;
grant execute on function kerja_private.m2_staff_notes(uuid) to authenticated;
create function public.m2_staff_notes(p_id uuid) returns table(id uuid,note text,evidence_ids jsonb,created_at timestamptz)
language sql security invoker set search_path='' as $$ select * from kerja_private.m2_staff_notes(p_id); $$;
revoke all on function public.m2_staff_notes(uuid) from public,anon;
grant execute on function public.m2_staff_notes(uuid) to authenticated;

create function kerja_private.m2_staff_resume(p_id uuid) returns table(id uuid,object_key text)
language sql security definer set search_path='' as $$
 select d.id,d.object_key from kerja_private.documents d join public.m1_applications a on a.id=d.application_id
 where a.id=p_id and kerja_private.can_review(a.job_id) and d.purpose='resume' and d.state in ('quarantined','ready')
 and d.deleted_at is null and d.expires_at>now() and (a.resume_snapshot_id is null or a.resume_snapshot_id=d.id)
 order by d.created_at desc limit 1;
$$;
revoke all on function kerja_private.m2_staff_resume(uuid) from public,anon;
grant execute on function kerja_private.m2_staff_resume(uuid) to authenticated;
create function public.m2_staff_resume(p_id uuid) returns table(id uuid,object_key text)
language sql security invoker set search_path='' as $$ select * from kerja_private.m2_staff_resume(p_id); $$;
revoke all on function public.m2_staff_resume(uuid) from public,anon;
grant execute on function public.m2_staff_resume(uuid) to authenticated;
create function kerja_private.m2_staff_queue(p_offset integer default 0) returns setof public.m1_applications
language sql security definer set search_path='' as $$
 select a.* from public.m1_applications a where kerja_private.can_review(a.job_id)
 order by a.created_at desc,a.id limit 50 offset least(10000,greatest(0,p_offset));
$$;
revoke all on function kerja_private.m2_staff_queue(integer) from public,anon;
grant execute on function kerja_private.m2_staff_queue(integer) to authenticated;
create function public.m2_staff_queue(p_offset integer default 0) returns setof public.m1_applications
language sql security invoker set search_path='' as $$ select * from kerja_private.m2_staff_queue(p_offset); $$;
revoke all on function public.m2_staff_queue(integer) from public,anon;
grant execute on function public.m2_staff_queue(integer) to authenticated;
create or replace function public.m1_document_register(p_id uuid,p_user uuid,p_application uuid,p_key text,p_expiry timestamptz) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.m1_applications where id=p_application and candidate_id=p_user and stage in ('P0','P1')
 and resume_snapshot_id is null and status not in ('rejected','withdrawn','hired','job_closed') for update;
 if not found or p_key!=p_user::text||'/'||p_id::text||'.enc' then raise insufficient_privilege; end if;
 insert into kerja_private.documents(id,owner_id,application_id,object_key,expires_at) values(p_id,p_user,p_application,p_key,least(p_expiry,now()+interval '90 days'));
end; $$;
commit;
