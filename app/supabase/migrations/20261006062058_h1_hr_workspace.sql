-- H1 local HR baseline. Additive; requires M1/M8. Apply only through backed-up L1.
begin;
create table kerja_private.hr_grants(user_id uuid not null references auth.users(id),employer_id uuid not null references public.m1_employers(id),role text not null check(role in ('hr','payroll')),active boolean not null default true,primary key(user_id,employer_id,role));
create table kerja_private.hr_employees(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),employer_id uuid not null references public.m1_employers(id),application_id uuid not null unique references public.m1_applications(id),title text not null,department text not null default '',state text not null default 'invited' check(state in ('invited','active','ended')),start_date date not null default (now() at time zone 'Asia/Kuala_Lumpur')::date,revision integer not null default 0,joined_at timestamptz,ended_at timestamptz,unique(id,employer_id));
create unique index hr_current_employment on kerja_private.hr_employees(user_id,employer_id) where state<>'ended';
create index hr_employee_company on kerja_private.hr_employees(employer_id,state,id);
create index hr_employee_owner on kerja_private.hr_employees(user_id,state);
create table kerja_private.hr_tasks(id uuid primary key default gen_random_uuid(),employee_id uuid not null references kerja_private.hr_employees(id),title text not null check(length(title) between 2 and 120),due date,completed boolean not null default false,revision integer not null default 0);
create table kerja_private.hr_time(id uuid primary key default gen_random_uuid(),employee_id uuid not null references kerja_private.hr_employees(id),day date not null,minutes integer not null check(minutes between 1 and 1440),title text not null default '',state text not null default 'draft' check(state in ('draft','submitted','approved','rejected')),revision integer not null default 0,reason text not null default '');
create table kerja_private.hr_leave(id uuid primary key default gen_random_uuid(),employee_id uuid not null references kerja_private.hr_employees(id),day date not null,end_day date not null,kind text not null check(kind in ('annual','sick','unpaid')),reason text not null check(length(reason) between 3 and 500),state text not null default 'pending' check(state in ('pending','approved','rejected','withdrawn')),revision integer not null default 0,check(end_day>=day and end_day-day<=30));
create table kerja_private.hr_payroll(id uuid primary key default gen_random_uuid(),employee_id uuid not null references kerja_private.hr_employees(id),period text not null check(period~'^\d{4}-(0[1-9]|1[0-2])$'),base_cents integer not null check(base_cents between 0 and 99999999),allowance_cents integer not null check(allowance_cents between 0 and 99999999),deduction_cents integer not null check(deduction_cents between 0 and 99999999),net_cents integer generated always as (base_cents+allowance_cents-deduction_cents) stored check(net_cents>=0),state text not null default 'draft' check(state in ('draft','approved','issued')),created_by uuid not null references auth.users(id),approved_by uuid references auth.users(id),revision integer not null default 0,unique(employee_id,period));
create table kerja_private.hr_events(id uuid primary key default gen_random_uuid(),employee_id uuid not null references kerja_private.hr_employees(id),title text not null check(length(title) between 2 and 120),starts_at timestamptz not null,ends_at timestamptz not null,check(ends_at>starts_at and ends_at<=starts_at+interval '4 hours'));
create table kerja_private.hr_audit(id bigint generated always as identity primary key,employee_id uuid not null references kerja_private.hr_employees(id),actor_id uuid not null references auth.users(id),action text not null,record_id uuid,reason text not null default '' check(length(reason)<=500),created_at timestamptz not null default now());
create index hr_tasks_employee on kerja_private.hr_tasks(employee_id);
create index hr_time_employee_day on kerja_private.hr_time(employee_id,day desc);
create index hr_leave_employee_day on kerja_private.hr_leave(employee_id,day);
create index hr_events_employee_start on kerja_private.hr_events(employee_id,starts_at);
create index hr_audit_employee on kerja_private.hr_audit(employee_id,created_at desc);

-- HR/payroll grants are operator-owned, independent of recruitment membership.
create function kerja_private.h1_admin(p_company uuid,p_role text) returns boolean language sql stable security definer set search_path='' as $$
 select kerja_private.active_auth_session() and auth.jwt()->>'aal'='aal2' and exists(select 1 from kerja_private.hr_grants g where g.user_id=auth.uid() and g.employer_id=p_company and g.role=p_role and g.active)
$$;
create function kerja_private.h1_owns(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
 select kerja_private.active_auth_session() and exists(select 1 from kerja_private.hr_employees e where e.id=p_employee and e.user_id=auth.uid() and e.state in ('active','invited'))
$$;

-- Only the canonical accepted human hire can create a company invitation.
create function kerja_private.h1_hire() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if new.status='hired' and new.final_outcome='hired' and new.offer_accepted_at is not null and (old.status is distinct from new.status or old.final_outcome is distinct from new.final_outcome) then
 insert into kerja_private.hr_employees(user_id,employer_id,application_id,title,department)
 select new.candidate_id,new.employer_id,new.id,j.title,j.department from public.m1_jobs j where j.id=new.job_id
 on conflict do nothing;
 end if;return new;end $$;
create trigger h1_after_human_hire after update of status,final_outcome on public.m1_applications for each row execute function kerja_private.h1_hire();
-- Conservative backfill: accepted, finalised hires only, never inferred shortlist.
insert into kerja_private.hr_employees(user_id,employer_id,application_id,title,department)
 select a.candidate_id,a.employer_id,a.id,j.title,j.department from public.m1_applications a join public.m1_jobs j on j.id=a.job_id where a.status='hired' and a.final_outcome='hired' and a.offer_accepted_at is not null on conflict do nothing;

-- No direct client table access; private checked RPCs are the sole boundary.
alter table kerja_private.hr_grants enable row level security;
alter table kerja_private.hr_employees enable row level security;
alter table kerja_private.hr_tasks enable row level security;
alter table kerja_private.hr_time enable row level security;
alter table kerja_private.hr_leave enable row level security;
alter table kerja_private.hr_payroll enable row level security;
alter table kerja_private.hr_events enable row level security;
alter table kerja_private.hr_audit enable row level security;
revoke all on kerja_private.hr_grants,kerja_private.hr_employees,kerja_private.hr_tasks,kerja_private.hr_time,kerja_private.hr_leave,kerja_private.hr_payroll,kerja_private.hr_events,kerja_private.hr_audit from public,anon,authenticated;

create function kerja_private.h1_context(p_company uuid,p_month text) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare c uuid;em jsonb;me jsonb;tasks jsonb;times jsonb;leaves jsonb;pay jsonb;events jsonb;companies jsonb;hr boolean;pr boolean;begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege;end if;
 if p_month<>'' and p_month!~'^\d{4}-(0[1-9]|1[0-2])$' then raise check_violation;end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into companies from (select distinct c.id,c.name from public.m1_employers c where exists(select 1 from kerja_private.hr_employees e where e.user_id=auth.uid() and e.employer_id=c.id and e.state<>'ended') or kerja_private.h1_admin(c.id,'hr') or kerja_private.h1_admin(c.id,'payroll') order by c.name limit 50)x;
 c:=coalesce(p_company,(companies->0->>'id')::uuid);
 if c is null then return jsonb_build_object('companies',companies,'employees','[]'::jsonb,'mine','[]'::jsonb,'tasks','[]'::jsonb,'times','[]'::jsonb,'leaves','[]'::jsonb,'payroll','[]'::jsonb,'events','[]'::jsonb,'hr',false,'payroll_admin',false);end if;
 hr:=kerja_private.h1_admin(c,'hr');pr:=kerja_private.h1_admin(c,'payroll');
 if not hr and not pr and not exists(select 1 from kerja_private.hr_employees where user_id=auth.uid() and employer_id=c and state<>'ended') then raise insufficient_privilege;end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into em from (select e.*,coalesce(nullif(p.display_name,''),'Employee') name from kerja_private.hr_employees e left join public.m1_profiles p on p.id=e.user_id where e.employer_id=c and (hr or pr or e.user_id=auth.uid()) order by e.id limit 100)x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into me from (select e.* from kerja_private.hr_employees e where e.employer_id=c and e.user_id=auth.uid() and e.state<>'ended' order by e.id)x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into tasks from (select t.* from kerja_private.hr_tasks t join kerja_private.hr_employees e on e.id=t.employee_id where e.employer_id=c and (hr or e.user_id=auth.uid() and e.state<>'ended') order by t.due,t.id limit 200)x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into times from (select t.* from kerja_private.hr_time t join kerja_private.hr_employees e on e.id=t.employee_id where e.employer_id=c and (hr or pr and t.state='approved' or e.user_id=auth.uid() and e.state='active') and (p_month='' and t.day>=current_date-31 or to_char(t.day,'YYYY-MM')=p_month) order by t.day desc,t.id limit 200)x;
 select coalesce(jsonb_agg(to_jsonb(x)-'reason'),'[]') into leaves from (select t.* from kerja_private.hr_leave t join kerja_private.hr_employees e on e.id=t.employee_id where e.employer_id=c and (hr or pr and t.state='approved' or e.user_id=auth.uid() and e.state='active') order by t.day desc,t.id limit 200)x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into pay from (select t.* from kerja_private.hr_payroll t join kerja_private.hr_employees e on e.id=t.employee_id where e.employer_id=c and (pr or e.user_id=auth.uid() and e.state='active' and t.state='issued') and (p_month='' or t.period=p_month) order by t.period desc,t.id limit 100)x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into events from (select t.* from kerja_private.hr_events t join kerja_private.hr_employees e on e.id=t.employee_id where e.employer_id=c and (hr or e.user_id=auth.uid() and e.state<>'ended') and t.starts_at>=now()-interval '31 days' and t.starts_at<now()+interval '90 days' order by t.starts_at limit 100)x;
 return jsonb_build_object('company_id',c,'companies',companies,'employees',em,'mine',me,'tasks',tasks,'times',times,'leaves',leaves,'payroll',pay,'events',events,'hr',hr,'payroll_admin',pr);
 end $$;

create function kerja_private.h1_command(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare u uuid:=auth.uid();e kerja_private.hr_employees;a text:=p_data->>'action';rid uuid:=(p_data->>'id')::uuid;k uuid:=(p_data->>'idempotency_key')::uuid;rev integer:=(p_data->>'expected_revision')::integer;hr boolean;pr boolean;own boolean;r jsonb;prior kerja_private.operation_keys;t kerja_private.hr_time;l kerja_private.hr_leave;p kerja_private.hr_payroll;d date;ed date;n integer;b integer;al integer;ded integer;begin
 if not kerja_private.active_auth_session() or k is null or rev is null or rev<0 or jsonb_typeof(p_data)<>'object' then raise insufficient_privilege;end if;
 if octet_length(p_data::text)>4000 or length(coalesce(p_data->>'title',''))>120 or length(coalesce(p_data->>'reason',''))>500 or (coalesce(p_data->>'title','')||coalesce(p_data->>'reason',''))~'[[:cntrl:]]' then raise check_violation;end if;
 if exists(select 1 from jsonb_object_keys(p_data) v where v not in ('action','employee_id','id','expected_revision','idempotency_key','title','reason','day','end_day','minutes','leave_kind','period','base_cents','allowance_cents','deduction_cents','completed','starts_at','ends_at')) then raise check_violation;end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||k::text,0));
 select * into e from kerja_private.hr_employees where id=(p_data->>'employee_id')::uuid for update;
 if not found then raise insufficient_privilege;end if;
 hr:=kerja_private.h1_admin(e.employer_id,'hr');pr:=kerja_private.h1_admin(e.employer_id,'payroll');own:=e.user_id=u;
 if not hr and not pr and not own then raise insufficient_privilege;end if;
 if e.state='ended' then raise check_violation;end if;
 -- Replays also require current privileges; cached payroll is not a bypass.
 if a in ('payroll_save','payroll_approve','payroll_issue') and not pr
 or a in ('employment_end','task_create','event_create','time_approve','time_reject','leave_approve','leave_reject') and not hr
 or a in ('join','time_create','time_submit','leave_create','leave_withdraw') and not own then raise insufficient_privilege;end if;
 select * into prior from kerja_private.operation_keys where actor_id=u and key=k;
 if found then if prior.operation<>'h1' or prior.request<>p_data then raise check_violation;end if;return prior.result;end if;
 if a='join' then
 if not own or e.state<>'invited' or e.revision<>rev or not exists(select 1 from public.m1_applications x where x.id=e.application_id and x.candidate_id=u and x.status='hired' and x.final_outcome='hired' and x.offer_accepted_at is not null) then raise insufficient_privilege;end if;
 update kerja_private.hr_employees set state='active',joined_at=now(),revision=revision+1 where id=e.id returning to_jsonb(hr_employees) into r;
 insert into kerja_private.hr_tasks(employee_id,title) values(e.id,'Complete your employee profile'),(e.id,'Review your company handbook'),(e.id,'Confirm equipment handover'),(e.id,'Meet your team');rid:=e.id;
 elsif a='employment_end' then
 if not hr or own or e.revision<>rev or length(trim(coalesce(p_data->>'reason','')))<5 then raise insufficient_privilege;end if;
 update kerja_private.hr_employees set state='ended',ended_at=now(),revision=revision+1 where id=e.id returning to_jsonb(hr_employees) into r;rid:=e.id;
 elsif a='task_create' then
 if not hr or length(trim(coalesce(p_data->>'title',''))) not between 2 and 120 then raise insufficient_privilege;end if;
 insert into kerja_private.hr_tasks(employee_id,title,due) values(e.id,p_data->>'title',(p_data->>'day')::date) returning id,to_jsonb(hr_tasks) into rid,r;
 elsif a='task_complete' then
 if not own and not hr then raise insufficient_privilege;end if;
 update kerja_private.hr_tasks set completed=(p_data->>'completed')::boolean,revision=revision+1 where id=rid and employee_id=e.id and revision=rev returning to_jsonb(hr_tasks) into r;
 if r is null then raise serialization_failure;end if;
 elsif a='time_create' then
 d:=(p_data->>'day')::date;n:=(p_data->>'minutes')::integer;
 if not own or e.state<>'active' or d is null or d>(now() at time zone 'Asia/Kuala_Lumpur')::date or d<e.start_date or n is null or n not between 1 and 1440 or coalesce((select sum(minutes) from kerja_private.hr_time where employee_id=e.id and day=d and state<>'rejected'),0)+n>1440 then raise check_violation;end if;
 insert into kerja_private.hr_time(employee_id,day,minutes,title) values(e.id,d,n,left(coalesce(p_data->>'title',''),120)) returning id,to_jsonb(hr_time) into rid,r;
 elsif a in ('time_submit','time_approve','time_reject') then
 select * into t from kerja_private.hr_time where id=rid and employee_id=e.id for update;
 if not found or t.revision<>rev or e.state<>'active' then raise serialization_failure;end if;
 if a='time_submit' and (not own or t.state not in ('draft','rejected')) or a<>'time_submit' and (not hr or own or t.state<>'submitted') then raise insufficient_privilege;end if;
 update kerja_private.hr_time set state=case a when 'time_submit' then 'submitted' when 'time_approve' then 'approved' else 'rejected' end,revision=revision+1,reason=left(coalesce(p_data->>'reason',''),500) where id=rid returning to_jsonb(hr_time) into r;
 elsif a='leave_create' then
 d:=(p_data->>'day')::date;ed:=(p_data->>'end_day')::date;
 if not own or e.state<>'active' or d is null or ed is null or d<e.start_date or ed<d or ed-d>30 or length(trim(coalesce(p_data->>'reason',''))) not between 3 and 500 or p_data->>'leave_kind' not in ('annual','sick','unpaid') or exists(select 1 from kerja_private.hr_leave where employee_id=e.id and state in ('pending','approved') and day<=ed and end_day>=d) then raise check_violation;end if;
 insert into kerja_private.hr_leave(employee_id,day,end_day,kind,reason) values(e.id,d,ed,p_data->>'leave_kind',p_data->>'reason') returning id,to_jsonb(hr_leave) into rid,r;
 elsif a in ('leave_approve','leave_reject','leave_withdraw') then
 select * into l from kerja_private.hr_leave where id=rid and employee_id=e.id for update;
 if not found or l.revision<>rev or l.state<>'pending' or e.state<>'active' then raise serialization_failure;end if;
 if a='leave_withdraw' and not own or a<>'leave_withdraw' and (not hr or own) then raise insufficient_privilege;end if;
 update kerja_private.hr_leave set state=case a when 'leave_withdraw' then 'withdrawn' when 'leave_approve' then 'approved' else 'rejected' end,revision=revision+1 where id=rid returning to_jsonb(hr_leave) into r;
 elsif a='payroll_save' then
 b:=(p_data->>'base_cents')::integer;al:=(p_data->>'allowance_cents')::integer;ded:=(p_data->>'deduction_cents')::integer;
 if not pr or e.state<>'active' or b is null or al is null or ded is null or b not between 0 and 99999999 or al not between 0 and 99999999 or ded not between 0 and 99999999 or ded>b+al or coalesce(p_data->>'period','')!~'^\d{4}-(0[1-9]|1[0-2])$' then raise insufficient_privilege;end if;
 if rid is null then insert into kerja_private.hr_payroll(employee_id,period,base_cents,allowance_cents,deduction_cents,created_by) values(e.id,p_data->>'period',b,al,ded,u) returning id,to_jsonb(hr_payroll) into rid,r;
 else update kerja_private.hr_payroll set base_cents=b,allowance_cents=al,deduction_cents=ded,revision=revision+1 where id=rid and employee_id=e.id and period=p_data->>'period' and state='draft' and revision=rev returning to_jsonb(hr_payroll) into r;if r is null then raise serialization_failure;end if;end if;
 elsif a in ('payroll_approve','payroll_issue') then
 select * into p from kerja_private.hr_payroll where id=rid and employee_id=e.id for update;
 if not found or p.revision<>rev or e.state<>'active' then raise serialization_failure;end if;
 if not pr or own or a='payroll_approve' and p.state<>'draft' or a='payroll_issue' and p.state<>'approved' then raise insufficient_privilege;end if;
 update kerja_private.hr_payroll set state=case a when 'payroll_approve' then 'approved' else 'issued' end,approved_by=case a when 'payroll_approve' then u else approved_by end,revision=revision+1 where id=rid returning to_jsonb(hr_payroll) into r;
 elsif a='event_create' then
 if not hr or length(trim(coalesce(p_data->>'title',''))) not between 2 and 120 or coalesce(p_data->>'starts_at','')!~'(Z|[+-]\d{2}:\d{2})$' or coalesce(p_data->>'ends_at','')!~'(Z|[+-]\d{2}:\d{2})$' then raise insufficient_privilege;end if;
 insert into kerja_private.hr_events(employee_id,title,starts_at,ends_at) values(e.id,p_data->>'title',(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz) returning id,to_jsonb(hr_events) into rid,r;
 else raise check_violation;end if;
 insert into kerja_private.hr_audit(employee_id,actor_id,action,record_id,reason) values(e.id,u,a,rid,case when a='employment_end' then left(p_data->>'reason',500) else '' end);
 insert into kerja_private.operation_keys values(u,k,'h1',p_data,r);
 return r;end $$;

revoke all on function kerja_private.h1_admin(uuid,text),kerja_private.h1_owns(uuid),kerja_private.h1_hire(),kerja_private.h1_context(uuid,text),kerja_private.h1_command(jsonb) from public,anon,authenticated;
grant execute on function kerja_private.h1_context(uuid,text),kerja_private.h1_command(jsonb) to authenticated;
create function public.h1_context(p_company uuid default null,p_month text default '') returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.h1_context(p_company,p_month) $$;
create function public.h1_command(p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.h1_command(p_data) $$;
revoke all on function public.h1_context(uuid,text),public.h1_command(jsonb) from public,anon;
grant execute on function public.h1_context(uuid,text),public.h1_command(jsonb) to authenticated;
commit;
