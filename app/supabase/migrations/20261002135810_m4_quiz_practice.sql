-- M4: separate private stores, immutable published versions, server-owned clocks.
-- Apply after M1-M3 and the configured backup/live gate. No legacy bank import.
begin;
create table kerja_private.quiz_policy (id boolean primary key default true check(id),real_enabled boolean not null default true,practice_enabled boolean not null default true);
insert into kerja_private.quiz_policy(id) values(true);
create table kerja_private.quiz_real_versions (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.m1_jobs(id),
 title text not null, competencies jsonb not null, questions jsonb not null,
 duration_minutes integer not null check(duration_minutes between 5 and 120),
 sample_count integer not null check(sample_count between 1 and 20),
 publisher_id uuid not null references auth.users(id), published_at timestamptz not null default now()
);
create table kerja_private.quiz_practice_versions (like kerja_private.quiz_real_versions including all);
alter table kerja_private.quiz_practice_versions add foreign key(job_id) references public.m1_jobs(id);
alter table kerja_private.quiz_practice_versions add foreign key(publisher_id) references auth.users(id);
create table kerja_private.quiz_real_attempts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 bank_id uuid not null references kerja_private.quiz_real_versions(id),
 application_id uuid not null references public.m1_applications(id),
 questions jsonb not null, answers jsonb not null default '{}', revision integer not null default 0,
 state text not null default 'active' check(state in ('active','submitted','reviewed','needs_review')),
 started_at timestamptz not null default now(), deadline_at timestamptz not null,
 submitted_at timestamptz, objective_result jsonb, review jsonb, reviewer_id uuid references auth.users(id)
);
create table kerja_private.quiz_practice_attempts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 bank_id uuid not null references kerja_private.quiz_practice_versions(id),
 questions jsonb not null, answers jsonb not null default '{}', revision integer not null default 0,
 state text not null default 'active' check(state in ('active','submitted')),
 started_at timestamptz not null default now(), deadline_at timestamptz not null,
 submitted_at timestamptz, objective_result jsonb
);
create unique index quiz_one_real_active on kerja_private.quiz_real_attempts(application_id) where state='active';
create index quiz_practice_owner on kerja_private.quiz_practice_attempts(owner_id,started_at);
create table kerja_private.quiz_adjustments (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.m1_applications(id),
 actor_id uuid not null references auth.users(id), action text not null check(action in ('request','extend','retake')),
 reason text not null, minutes integer, consumed_at timestamptz, created_at timestamptz not null default now()
);
alter table kerja_private.pipeline_evidence add column quiz_attempt_id uuid references kerja_private.quiz_real_attempts(id);
do $$ declare n text; begin
 foreach n in array array['quiz_policy','quiz_real_versions','quiz_practice_versions','quiz_real_attempts','quiz_practice_attempts','quiz_adjustments'] loop
  execute format('alter table kerja_private.%I enable row level security',n);
  execute format('revoke all on kerja_private.%I from public,anon,authenticated',n);
  execute format('grant all on kerja_private.%I to service_role',n);
 end loop;
end $$;

create function kerja_private.m4_staff(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select kerja_private.active_auth_session() and kerja_private.can_review(p_job) and exists(
 select 1 from public.m1_jobs j join public.m1_memberships m on m.employer_id=j.employer_id
 where j.id=p_job and m.user_id=auth.uid() and m.active and m.role in ('hm','admin'));
$$;
create function kerja_private.m4_publish(p_mode text,p_job uuid,p_title text,p_competencies jsonb,p_questions jsonb,p_minutes integer,p_count integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb; b uuid;
begin
 if p_mode is null or p_mode not in ('real','practice') or not kerja_private.m4_staff(p_job) then raise insufficient_privilege; end if;
 if length(trim(p_title)) not between 3 and 120 or jsonb_typeof(p_competencies) is distinct from 'array'
 or jsonb_array_length(p_competencies) not between 1 and 10 or jsonb_typeof(p_questions) is distinct from 'array'
 or jsonb_array_length(p_questions) not between 1 and 20 or p_minutes not between 5 and 120
 or p_count not between 1 and jsonb_array_length(p_questions) then raise check_violation; end if;
 if exists(select 1 from jsonb_array_elements_text(p_competencies) c where length(c) not between 2 and 80)
 or (select count(distinct element->>'id') from jsonb_array_elements(p_questions) element)!=jsonb_array_length(p_questions) then raise check_violation; end if;
 for q in select jsonb_array_elements(p_questions) loop
  if jsonb_typeof(q) is distinct from 'object' or exists(select 1 from jsonb_object_keys(q) k where k not in ('id','kind','prompt','competency','rubric','max_points','options','correct'))
  or q->>'max_points' is null or q->>'competency' is null then raise check_violation; end if;
  if q->>'id' is null or length(q->>'id') not between 1 and 40 or q->>'kind' is null or q->>'kind' not in ('objective','subjective')
  or length(trim(coalesce(q->>'prompt',''))) not between 3 and 2000
  or not (p_competencies ? (q->>'competency')) or length(trim(coalesce(q->>'rubric',''))) not between 3 and 1000
  or (q->>'max_points')::integer not between 1 and 10 then raise check_violation; end if;
  if q->>'kind'='objective' and (jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options') not between 2 and 6
   or (q->>'correct')::integer is null or (q->>'correct')::integer not between 0 and jsonb_array_length(q->'options')-1
   or exists(select 1 from jsonb_array_elements_text(q->'options') o where length(trim(o)) not between 1 and 300)) then raise check_violation; end if;
  if q->>'kind'='subjective' and q ? 'correct' then raise check_violation; end if;
 end loop;
 execute format('insert into kerja_private.quiz_%s_versions(job_id,title,competencies,questions,duration_minutes,sample_count,publisher_id) values($1,$2,$3,$4,$5,$6,$7) returning id',p_mode)
 into b using p_job,p_title,p_competencies,p_questions,p_minutes,p_count,auth.uid();
 return jsonb_build_object('id',b,'mode',p_mode,'published',true);
end; $$;

create function kerja_private.m4_banks(p_mode text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not kerja_private.active_auth_session() or p_mode is null or p_mode not in ('real','practice') then raise insufficient_privilege; end if;
 execute format('select coalesce(jsonb_agg(v),''[]''::jsonb) from (select b.id,b.job_id,b.title,b.competencies,b.duration_minutes,b.sample_count,b.published_at from kerja_private.quiz_%s_versions b join public.m1_jobs j on j.id=b.job_id where j.published and j.closed_at is null order by b.published_at desc limit 50) v',p_mode) into result;
 return result;
end; $$;

-- Only owner reads practice; only owner or assigned HM with MFA reads real submissions.
create function kerja_private.m4_attempt(p_mode text,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; questions jsonb; allowed boolean;
begin
 if not kerja_private.active_auth_session() or p_mode is null or p_mode not in ('real','practice') then raise insufficient_privilege; end if;
 execute format('select to_jsonb(t) from kerja_private.quiz_%s_attempts t where id=$1',p_mode) into a using p_id;
 if a is null then raise no_data_found; end if;
 allowed:=a->>'owner_id'=auth.uid()::text;
 if not allowed and p_mode='real' then select kerja_private.m4_staff(job_id) into allowed from public.m1_applications where id=(a->>'application_id')::uuid; end if;
 if allowed is distinct from true then raise insufficient_privilege; end if;
 -- Keys never leave the private function, even after submission or to staff.
 select coalesce(jsonb_agg(q-'correct'),'[]'::jsonb) into questions from jsonb_array_elements(a->'questions') q;
 return (a-'questions'-'owner_id'-'reviewer_id')||jsonb_build_object('questions',questions,'mode',p_mode,'server_now',clock_timestamp());
end; $$;

create function kerja_private.m4_start(p_mode text,p_bank uuid,p_application uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b jsonb; a public.m1_applications; attempt uuid; chosen jsonb; prior kerja_private.operation_keys; request jsonb; grant_id uuid;
begin
 if not kerja_private.active_auth_session() or p_mode is null or p_mode not in ('real','practice') or p_key is null then raise insufficient_privilege; end if;
 if not exists(select 1 from kerja_private.quiz_policy where case when p_mode='real' then real_enabled else practice_enabled end) then raise check_violation; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'quiz-start',0));
 request:=jsonb_build_object('mode',p_mode,'bank',p_bank,'application',p_application);
 select * into prior from kerja_private.operation_keys where actor_id=auth.uid() and key=p_key;
 if found then
  if prior.operation!='quiz-start' or prior.request!=request then raise unique_violation; end if;
  return kerja_private.m4_attempt(p_mode,(prior.result->>'id')::uuid);
 end if;
 execute format('select to_jsonb(b) from kerja_private.quiz_%s_versions b where id=$1',p_mode) into b using p_bank;
 if b is null or not exists(select 1 from public.m1_jobs where id=(b->>'job_id')::uuid and published and closed_at is null) then raise no_data_found; end if;
 if p_mode='real' then
  select * into a from public.m1_applications where id=p_application for update;
  if not found or a.candidate_id!=auth.uid() or a.job_id!=(b->>'job_id')::uuid then raise insufficient_privilege; end if;
  if a.stage!='P3' or a.status!='under_review' or (a.policy_snapshot->>'required_identity'='true' and not kerja_private.m2_requirements_met(a.id,'identity')) then raise check_violation; end if;
  select id into attempt from kerja_private.quiz_real_attempts where application_id=a.id and state='active';
  if attempt is not null then
   if (select bank_id from kerja_private.quiz_real_attempts where id=attempt)!=p_bank then raise serialization_failure; end if;
  elsif exists(select 1 from kerja_private.quiz_real_attempts where application_id=a.id) then
   select id into grant_id from kerja_private.quiz_adjustments where application_id=a.id and action='retake' and consumed_at is null order by created_at limit 1 for update;
   if grant_id is null or (select count(*) from kerja_private.quiz_real_attempts where application_id=a.id)>=3 then raise check_violation; end if;
   update kerja_private.quiz_adjustments set consumed_at=now() where id=grant_id;
  end if;
 else
  if p_application is not null then raise check_violation; end if;
  if (select count(*) from kerja_private.quiz_practice_attempts where owner_id=auth.uid() and started_at>now()-interval '1 day')>=20 then raise check_violation; end if;
 end if;
 if attempt is null then
  select jsonb_agg(q) into chosen from (select q from jsonb_array_elements(b->'questions') q order by random() limit (b->>'sample_count')::integer) s;
  if p_mode='real' then
   -- A new retake supersedes earlier approval, even if an operator moved back to P3.
   update kerja_private.pipeline_evidence set revoked_at=now() where application_id=a.id and kind='quiz' and revoked_at is null;
   insert into kerja_private.quiz_real_attempts(owner_id,bank_id,application_id,questions,deadline_at)
   values(auth.uid(),p_bank,p_application,chosen,clock_timestamp()+make_interval(mins=>(b->>'duration_minutes')::integer)) returning id into attempt;
  else
   insert into kerja_private.quiz_practice_attempts(owner_id,bank_id,questions,deadline_at)
   values(auth.uid(),p_bank,chosen,clock_timestamp()+make_interval(mins=>(b->>'duration_minutes')::integer)) returning id into attempt;
  end if;
 end if;
 insert into kerja_private.operation_keys values(auth.uid(),p_key,'quiz-start',request,jsonb_build_object('id',attempt));
 return kerja_private.m4_attempt(p_mode,attempt);
end; $$;

create function kerja_private.m4_grade(p_questions jsonb,p_answers jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare q jsonb; earned integer:=0; possible integer:=0; answered integer:=0; n integer:=0; subjective integer:=0; pillars jsonb:='{}'; item jsonb; pts integer;
begin
 for q in select jsonb_array_elements(p_questions) loop
  if q->>'kind'='subjective' then subjective:=subjective+1; continue; end if;
  n:=n+1; possible:=possible+(q->>'max_points')::integer; pts:=0;
  if p_answers ? (q->>'id') then answered:=answered+1; end if;
  if p_answers->(q->>'id')=q->'correct' then pts:=(q->>'max_points')::integer; end if;
  earned:=earned+pts; item:=coalesce(pillars->(q->>'competency'),'{}');
  pillars:=jsonb_set(pillars,array[q->>'competency'],jsonb_build_object('earned',coalesce((item->>'earned')::integer,0)+pts,'possible',coalesce((item->>'possible')::integer,0)+(q->>'max_points')::integer));
 end loop;
 return jsonb_build_object('earned',earned,'possible',possible,'objective_questions',n,'answered',answered,'subjective_pending',subjective,'pillars',pillars,'scorer','deterministic-v1');
end; $$;

create function kerja_private.m4_save(p_mode text,p_id uuid,p_revision integer,p_answers jsonb,p_submit boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; q jsonb; k text; v jsonb; merged jsonb; final boolean; result jsonb;
begin
 if not kerja_private.active_auth_session() or p_mode is null or p_mode not in ('real','practice') or p_submit is null then raise insufficient_privilege; end if;
 execute format('select to_jsonb(t) from kerja_private.quiz_%s_attempts t where id=$1 for update',p_mode) into a using p_id;
 if a is null then raise no_data_found; end if;
 if a->>'owner_id'!=auth.uid()::text then raise insufficient_privilege; end if;
 if p_mode='real' and not exists(select 1 from public.m1_applications ap join public.m1_jobs j on j.id=ap.job_id
  where ap.id=(a->>'application_id')::uuid and ap.stage='P3' and ap.status='under_review' and j.closed_at is null) then raise check_violation; end if;
 if a->>'state'!='active' then return kerja_private.m4_attempt(p_mode,p_id); end if; -- immutable, idempotent double submit
 final:=clock_timestamp()>=(a->>'deadline_at')::timestamptz or p_submit;
 merged:=a->'answers';
 if clock_timestamp()<(a->>'deadline_at')::timestamptz then
  if p_revision is distinct from (a->>'revision')::integer then raise serialization_failure; end if;
  if jsonb_typeof(p_answers) is distinct from 'object' or octet_length(p_answers::text)>48000 then raise check_violation; end if;
  for k,v in select * from jsonb_each(p_answers) loop
   select item into q from jsonb_array_elements(a->'questions') item where item->>'id'=k;
   if q is null then raise check_violation; end if;
   if q->>'kind'='objective' then
    if jsonb_typeof(v)!='number' or v::text !~ '^[0-9]+$' or (v::text)::integer not between 0 and jsonb_array_length(q->'options')-1 then raise check_violation; end if;
   elsif jsonb_typeof(v)!='string' or length(v#>>'{}')>2000 then raise check_violation; end if;
  end loop;
  merged:=merged||p_answers;
 end if; -- expired: grade only answers saved before deadline, never late input
 result:=case when final then kerja_private.m4_grade(a->'questions',merged) else null end;
 execute format('update kerja_private.quiz_%s_attempts set answers=$2,revision=revision+1,state=case when $3 then ''submitted'' else ''active'' end,submitted_at=case when $3 then clock_timestamp() else null end,objective_result=$4 where id=$1',p_mode)
 using p_id,merged,final,result;
 if final and p_mode='real' then
  insert into public.m1_application_events(application_id,actor_id,actor_type,event_type) values((a->>'application_id')::uuid,auth.uid(),'human','quiz_submitted');
  insert into public.m1_outbox(application_id,recipient_id,event_type) values((a->>'application_id')::uuid,auth.uid(),'quiz_submitted');
 end if;
 return kerja_private.m4_attempt(p_mode,p_id);
end; $$;

create function kerja_private.m4_attempts(p_staff boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not kerja_private.active_auth_session() or p_staff is null then raise insufficient_privilege; end if;
 if p_staff then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select q.id,'real' as mode,q.application_id,q.state,q.revision,q.deadline_at,q.submitted_at,q.objective_result
   from kerja_private.quiz_real_attempts q join public.m1_applications a on a.id=q.application_id where kerja_private.m4_staff(a.job_id) order by q.started_at desc limit 100) t;
 else
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
   select id,'real' as mode,application_id,state,revision,deadline_at,submitted_at,objective_result,started_at from kerja_private.quiz_real_attempts where owner_id=auth.uid()
   union all select id,'practice',null,state,revision,deadline_at,submitted_at,objective_result,started_at from kerja_private.quiz_practice_attempts where owner_id=auth.uid()
   order by started_at desc limit 100) t;
 end if;
 return result;
end; $$;

create function kerja_private.m4_review(p_id uuid,p_revision integer,p_decision text,p_scores jsonb,p_reason text,p_attested boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a kerja_private.quiz_real_attempts; ap public.m1_applications; q jsonb; k text; v jsonb; points integer:=0; evidence uuid;
begin
 -- Same application -> attempt lock order as adjustments; avoid crossed locks.
 select application_id into evidence from kerja_private.quiz_real_attempts where id=p_id;
 select * into ap from public.m1_applications where id=evidence for update;
 select * into a from kerja_private.quiz_real_attempts where id=p_id for update;
 evidence:=null;
 if a.id is null or not kerja_private.m4_staff(ap.job_id) then raise insufficient_privilege; end if;
 if ap.stage!='P3' or ap.status!='under_review' or exists(select 1 from public.m1_jobs where id=ap.job_id and closed_at is not null)
 or exists(select 1 from kerja_private.quiz_real_attempts newer where newer.application_id=ap.id and newer.started_at>a.started_at)
 or a.state not in ('submitted','needs_review') or a.revision is distinct from p_revision then raise serialization_failure; end if;
 if p_attested is distinct from true or p_decision is null or p_decision not in ('approve','needs_review')
 or length(trim(coalesce(p_reason,''))) not between 5 and 1000 or jsonb_typeof(p_scores) is distinct from 'object' then raise check_violation; end if;
 for k,v in select * from jsonb_each(p_scores) loop
  select item into q from jsonb_array_elements(a.questions) item where item->>'id'=k and item->>'kind'='subjective';
  if q is null or jsonb_typeof(v)!='number' or v::text !~ '^[0-9]+$' or (v::text)::integer not between 0 and (q->>'max_points')::integer then raise check_violation; end if;
  points:=points+(v::text)::integer;
 end loop;
 if p_decision='approve' and exists(select 1 from jsonb_array_elements(a.questions) element where element->>'kind'='subjective' and not p_scores ? (element->>'id')) then raise check_violation; end if;
 update kerja_private.quiz_real_attempts set state=case when p_decision='approve' then 'reviewed' else 'needs_review' end,
 revision=revision+1,reviewer_id=auth.uid(),review=jsonb_build_object('decision',p_decision,'scores',p_scores,'subjective_points',points,'reason',p_reason,'rubric_version',a.bank_id,'reviewed_at',now()) where id=a.id;
 if p_decision='approve' then
  insert into kerja_private.pipeline_evidence(application_id,kind,outcome,method,reviewer_id,expires_at,reason,quiz_attempt_id)
  values(ap.id,'quiz','satisfied','manual',auth.uid(),now()+interval '30 days',p_reason,a.id) returning id into evidence;
 end if;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type) values(ap.id,auth.uid(),'human','quiz_reviewed');
 insert into public.m1_outbox(application_id,recipient_id,event_type) values(ap.id,ap.candidate_id,'quiz_reviewed');
 return jsonb_build_object('id',a.id,'decision',p_decision,'evidence_id',evidence,'stage_unchanged',true);
end; $$;

create function kerja_private.m4_adjust(p_application uuid,p_action text,p_minutes integer,p_reason text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ap public.m1_applications; a kerja_private.quiz_real_attempts; adjustment uuid;
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 select * into ap from public.m1_applications where id=p_application for update;
 if ap.id is null or p_action is null or p_action not in ('request','extend','retake') then raise insufficient_privilege; end if;
 if p_action='request' then
  if ap.candidate_id!=auth.uid() then raise insufficient_privilege; end if;
 else
  if not kerja_private.m4_staff(ap.job_id) then raise insufficient_privilege; end if;
 end if;
 if ap.stage!='P3' or ap.status!='under_review' or exists(select 1 from public.m1_jobs where id=ap.job_id and closed_at is not null)
 or length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise check_violation; end if;
 select * into a from kerja_private.quiz_real_attempts where application_id=ap.id order by started_at desc limit 1 for update;
 if p_action!='request' and (a.id is null or a.revision is distinct from p_revision) then raise serialization_failure; end if;
 if p_action='extend' then
  if a.state!='active' or a.deadline_at<=clock_timestamp() or p_minutes is null or p_minutes not between 5 and 120
  or a.deadline_at+make_interval(mins=>p_minutes)>a.started_at+interval '4 hours' then raise check_violation; end if;
  update kerja_private.quiz_real_attempts set deadline_at=deadline_at+make_interval(mins=>p_minutes),revision=revision+1 where id=a.id;
 elsif p_action='retake' then
  if a.state='active' or (select count(*) from kerja_private.quiz_real_attempts where application_id=ap.id)>=3
   or exists(select 1 from kerja_private.quiz_adjustments where application_id=ap.id and action='retake' and consumed_at is null) then raise check_violation; end if;
  update kerja_private.quiz_real_attempts set revision=revision+1 where id=a.id;
 else
  if exists(select 1 from kerja_private.quiz_adjustments where application_id=ap.id and action='request' and created_at>now()-interval '1 day') then raise check_violation; end if;
 end if;
 insert into kerja_private.quiz_adjustments(application_id,actor_id,action,reason,minutes) values(ap.id,auth.uid(),p_action,p_reason,case when p_action='extend' then p_minutes else null end) returning id into adjustment;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type) values(ap.id,auth.uid(),'human','quiz_'||p_action);
 insert into public.m1_outbox(application_id,recipient_id,event_type) values(ap.id,ap.candidate_id,'quiz_'||p_action);
 return jsonb_build_object('id',adjustment,'action',p_action);
end; $$;
create function kerja_private.m4_requests() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select q.id,q.application_id,q.action,q.reason,q.minutes,q.created_at
 from kerja_private.quiz_adjustments q join public.m1_applications a on a.id=q.application_id
 where kerja_private.active_auth_session() and (a.candidate_id=auth.uid() or kerja_private.m4_staff(a.job_id)) order by q.created_at desc limit 100) t;
$$;

-- Identity guards remain composed; practice cannot appear in a quiz evidence FK.
create function kerja_private.m4_expire(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a kerja_private.quiz_real_attempts; ap public.m1_applications; app_id uuid;
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 select application_id into app_id from kerja_private.quiz_real_attempts where id=p_id;
 select * into ap from public.m1_applications where id=app_id for update;
 select * into a from kerja_private.quiz_real_attempts where id=p_id for update;
 if a.id is null or not (a.owner_id=auth.uid() or kerja_private.m4_staff(ap.job_id)) then raise insufficient_privilege; end if;
 if a.state!='active' then return kerja_private.m4_attempt('real',a.id); end if;
 if a.deadline_at>clock_timestamp() then raise check_violation; end if;
 update kerja_private.quiz_real_attempts set state='submitted',revision=revision+1,submitted_at=clock_timestamp(),
 objective_result=kerja_private.m4_grade(a.questions,a.answers) where id=a.id;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type) values(ap.id,auth.uid(),'human','quiz_timeout_finalized');
 insert into public.m1_outbox(application_id,recipient_id,event_type) values(ap.id,ap.candidate_id,'quiz_timeout_finalized');
 return kerja_private.m4_attempt('real',a.id);
end; $$;
revoke all on function kerja_private.m4_expire(uuid) from public,anon;
grant execute on function kerja_private.m4_expire(uuid) to authenticated;
create function public.m4_expire(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m4_expire(p_id); $$;
revoke all on function public.m4_expire(uuid) from public,anon;
grant execute on function public.m4_expire(uuid) to authenticated;
alter function kerja_private.m2_requirements_met(uuid,text) rename to m4_requirements_before_quiz;
create function kerja_private.m2_requirements_met(p_app uuid,p_kind text) returns boolean language sql stable security definer set search_path='' as $$
 select kerja_private.m4_requirements_before_quiz(p_app,p_kind) and (p_kind!='quiz' or exists(
 select 1 from kerja_private.pipeline_evidence e join kerja_private.quiz_real_attempts q on q.id=e.quiz_attempt_id
 where e.application_id=p_app and e.kind='quiz' and e.revoked_at is null and e.expires_at>now() and q.application_id=p_app
 and q.state='reviewed' and q.reviewer_id=e.reviewer_id
 and exists(select 1 from public.m1_applications ap join public.m1_job_assignments ja on ja.job_id=ap.job_id where ap.id=p_app and ja.user_id=e.reviewer_id)
 and not exists(select 1 from kerja_private.quiz_real_attempts newer where newer.application_id=p_app and newer.started_at>q.started_at)));
$$;
-- Internal helpers are never directly callable by browser roles.
revoke all on function kerja_private.m4_staff(uuid),kerja_private.m4_grade(jsonb,jsonb),kerja_private.m2_requirements_met(uuid,text) from public,anon,authenticated;
-- RPC facades: invoker public wrappers; private definer functions enforce verified session and ownership.

revoke all on function kerja_private.m4_publish(text,uuid,text,jsonb,jsonb,integer,integer) from public,anon;
grant execute on function kerja_private.m4_publish(text,uuid,text,jsonb,jsonb,integer,integer) to authenticated;
create function public.m4_publish(p_mode text,p_job uuid,p_title text,p_competencies jsonb,p_questions jsonb,p_minutes integer,p_count integer) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m4_publish(p_mode,p_job,p_title,p_competencies,p_questions,p_minutes,p_count); $$;
revoke all on function public.m4_publish(text,uuid,text,jsonb,jsonb,integer,integer) from public,anon;
grant execute on function public.m4_publish(text,uuid,text,jsonb,jsonb,integer,integer) to authenticated;

revoke all on function kerja_private.m4_banks(text) from public,anon;
grant execute on function kerja_private.m4_banks(text) to authenticated;
create function public.m4_banks(p_mode text) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m4_banks(p_mode); $$;
revoke all on function public.m4_banks(text) from public,anon;
grant execute on function public.m4_banks(text) to authenticated;

revoke all on function kerja_private.m4_attempt(text,uuid) from public,anon;
grant execute on function kerja_private.m4_attempt(text,uuid) to authenticated;
create function public.m4_attempt(p_mode text,p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m4_attempt(p_mode,p_id); $$;
revoke all on function public.m4_attempt(text,uuid) from public,anon;
grant execute on function public.m4_attempt(text,uuid) to authenticated;

revoke all on function kerja_private.m4_start(text,uuid,uuid,uuid) from public,anon;
grant execute on function kerja_private.m4_start(text,uuid,uuid,uuid) to authenticated;
create function public.m4_start(p_mode text,p_bank uuid,p_application uuid,p_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m4_start(p_mode,p_bank,p_application,p_key); $$;
revoke all on function public.m4_start(text,uuid,uuid,uuid) from public,anon;
grant execute on function public.m4_start(text,uuid,uuid,uuid) to authenticated;

revoke all on function kerja_private.m4_save(text,uuid,integer,jsonb,boolean) from public,anon;
grant execute on function kerja_private.m4_save(text,uuid,integer,jsonb,boolean) to authenticated;
create function public.m4_save(p_mode text,p_id uuid,p_revision integer,p_answers jsonb,p_submit boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m4_save(p_mode,p_id,p_revision,p_answers,p_submit); $$;
revoke all on function public.m4_save(text,uuid,integer,jsonb,boolean) from public,anon;
grant execute on function public.m4_save(text,uuid,integer,jsonb,boolean) to authenticated;

revoke all on function kerja_private.m4_attempts(boolean) from public,anon;
grant execute on function kerja_private.m4_attempts(boolean) to authenticated;
create function public.m4_attempts(p_staff boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m4_attempts(p_staff); $$;
revoke all on function public.m4_attempts(boolean) from public,anon;
grant execute on function public.m4_attempts(boolean) to authenticated;

revoke all on function kerja_private.m4_review(uuid,integer,text,jsonb,text,boolean) from public,anon;
grant execute on function kerja_private.m4_review(uuid,integer,text,jsonb,text,boolean) to authenticated;
create function public.m4_review(p_id uuid,p_revision integer,p_decision text,p_scores jsonb,p_reason text,p_attested boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m4_review(p_id,p_revision,p_decision,p_scores,p_reason,p_attested); $$;
revoke all on function public.m4_review(uuid,integer,text,jsonb,text,boolean) from public,anon;
grant execute on function public.m4_review(uuid,integer,text,jsonb,text,boolean) to authenticated;

revoke all on function kerja_private.m4_adjust(uuid,text,integer,text,integer) from public,anon;
grant execute on function kerja_private.m4_adjust(uuid,text,integer,text,integer) to authenticated;
create function public.m4_adjust(p_application uuid,p_action text,p_minutes integer,p_reason text,p_revision integer) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m4_adjust(p_application,p_action,p_minutes,p_reason,p_revision); $$;
revoke all on function public.m4_adjust(uuid,text,integer,text,integer) from public,anon;
grant execute on function public.m4_adjust(uuid,text,integer,text,integer) to authenticated;

revoke all on function kerja_private.m4_requests() from public,anon;
grant execute on function kerja_private.m4_requests() to authenticated;
create function public.m4_requests() returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m4_requests(); $$;
revoke all on function public.m4_requests() from public,anon;
grant execute on function public.m4_requests() to authenticated;
commit;
