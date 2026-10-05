-- M6: read-only business tools. No raw chat/prompt storage or model decisions.
begin;
create table kerja_private.chat_policy(id boolean primary key default true check(id),external_enabled boolean not null default false,privacy_approved boolean not null default false,daily_external_limit integer not null default 20 check(daily_external_limit between 0 and 20));
insert into kerja_private.chat_policy(id) values(true);
create table kerja_private.chat_metadata(
 id uuid primary key default gen_random_uuid(),actor_id uuid not null references auth.users(id),
 scope text not null check(scope in ('candidate','staff')),tool text check(tool in ('candidate_applications','candidate_progress','staff_jobs','staff_summary','faq','unsupported','denied')),
 external_reserved boolean not null default false,requested_model text not null default 'rules',actual_model text not null default 'rules',provider text not null default 'local',
 fallback_warning text check(fallback_warning in ('external_disabled','not_configured','privacy_unapproved','quota_exhausted','circuit_open','route_unavailable','nonzero_price','timeout','rate_limited','provider_outage','invalid_response','unapproved_model','unsupported_request','data_unavailable','access_denied')),
 created_at timestamptz not null default now(),completed_at timestamptz,expires_at timestamptz not null default now()+interval '7 days'
);
create index chat_metadata_daily on kerja_private.chat_metadata(created_at,actor_id);
alter table kerja_private.chat_policy enable row level security;
alter table kerja_private.chat_metadata enable row level security;
revoke all on kerja_private.chat_policy,kerja_private.chat_metadata from public,anon,authenticated;
grant all on kerja_private.chat_policy,kerja_private.chat_metadata to service_role;
create function kerja_private.m6_candidate_applications() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select a.id,a.job_id,a.submission_snapshot->>'job_title' as title,a.stage,a.status,a.next_action,a.deadline_at,
 greatest(a.created_at,coalesce((select max(e.created_at) from public.m1_application_events e where e.application_id=a.id),a.created_at)) as updated_at
 from public.m1_applications a where a.candidate_id=auth.uid() and kerja_private.active_auth_session() order by a.created_at desc limit 100) t;
$$;
create function kerja_private.m6_candidate_progress(p_application uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 select to_jsonb(t) into result from (select a.id,a.job_id,a.submission_snapshot->>'job_title' as title,a.stage,a.status,a.next_action,a.deadline_at,
 greatest(a.created_at,coalesce((select max(e.created_at) from public.m1_application_events e where e.application_id=a.id),a.created_at)) as updated_at
 from public.m1_applications a where a.id=p_application and a.candidate_id=auth.uid()) t;
 if result is null then raise insufficient_privilege; end if;
 return result;
end; $$;
create function kerja_private.m6_staff_jobs() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not kerja_private.active_auth_session() or auth.jwt()->>'aal' is distinct from 'aal2' then raise insufficient_privilege; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select j.id,j.title from public.m1_jobs j where kerja_private.m4_staff(j.id) order by j.title limit 50) t;
 return result;
end; $$;
create function kerja_private.m6_staff_summary(p_job uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare counts jsonb;
begin
 if not kerja_private.m4_staff(p_job) then raise insufficient_privilege; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into counts from (select a.stage,a.status,count(*) as count from public.m1_applications a where a.job_id=p_job group by a.stage,a.status order by a.stage,a.status) t;
 return jsonb_build_object('job_id',p_job,'counts',counts,'updated_at',clock_timestamp());
end; $$;
create function kerja_private.m6_begin(p_scope text,p_external boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare policy kerja_private.chat_policy; event uuid; reserved boolean:=false; warning text;
begin
 if not kerja_private.active_auth_session() or p_scope is null or p_scope not in ('candidate','staff') or p_external is null then raise insufficient_privilege; end if;
 if p_scope='staff' and (auth.jwt()->>'aal' is distinct from 'aal2' or not exists(select 1 from public.m1_memberships where user_id=auth.uid() and active and role in ('hm','admin'))) then raise insufficient_privilege; end if;
 select * into policy from kerja_private.chat_policy where id=true for update;
 delete from kerja_private.chat_metadata where expires_at<=now();
 if (select count(*) from kerja_private.chat_metadata where actor_id=auth.uid() and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=100 then raise check_violation; end if;
 if p_external then
  if not policy.external_enabled then warning:='external_disabled';
  elsif not policy.privacy_approved then warning:='privacy_unapproved';
  elsif (select count(*) from kerja_private.chat_metadata where external_reserved and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=policy.daily_external_limit then warning:='quota_exhausted';
  else reserved:=true; end if;
 end if;
 insert into kerja_private.chat_metadata(actor_id,scope,external_reserved,requested_model,fallback_warning) values(auth.uid(),p_scope,reserved,case when p_external then 'typesafe/jev-router' else 'rules' end,warning) returning id into event;
 return jsonb_build_object('id',event,'external_reserved',reserved,'fallback_warning',warning);
end; $$;
create function kerja_private.m6_complete(p_event uuid,p_tool text,p_warning text,p_actual text,p_provider text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 if p_actual is null or p_actual !~ '^[A-Za-z0-9_./:-]{1,120}$'
 or p_provider is null or p_provider !~ '^[A-Za-z0-9_/-]{1,80}$' then raise check_violation; end if;
 update kerja_private.chat_metadata set tool=p_tool,fallback_warning=coalesce(p_warning,fallback_warning),actual_model=p_actual,provider=p_provider,completed_at=now()
 where id=p_event and actor_id=auth.uid() and completed_at is null and created_at>now()-interval '2 minutes';
 if not found then raise insufficient_privilege; end if;
end; $$;
-- Public invoker facades generated below; no user access to traces/table rows.

revoke all on function kerja_private.m6_candidate_applications() from public,anon;
grant execute on function kerja_private.m6_candidate_applications() to authenticated;
create function public.m6_candidate_applications() returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m6_candidate_applications(); $$;
revoke all on function public.m6_candidate_applications() from public,anon;
grant execute on function public.m6_candidate_applications() to authenticated;

revoke all on function kerja_private.m6_candidate_progress(uuid) from public,anon;
grant execute on function kerja_private.m6_candidate_progress(uuid) to authenticated;
create function public.m6_candidate_progress(p_application uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m6_candidate_progress(p_application); $$;
revoke all on function public.m6_candidate_progress(uuid) from public,anon;
grant execute on function public.m6_candidate_progress(uuid) to authenticated;

revoke all on function kerja_private.m6_staff_jobs() from public,anon;
grant execute on function kerja_private.m6_staff_jobs() to authenticated;
create function public.m6_staff_jobs() returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m6_staff_jobs(); $$;
revoke all on function public.m6_staff_jobs() from public,anon;
grant execute on function public.m6_staff_jobs() to authenticated;

revoke all on function kerja_private.m6_staff_summary(uuid) from public,anon;
grant execute on function kerja_private.m6_staff_summary(uuid) to authenticated;
create function public.m6_staff_summary(p_job uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m6_staff_summary(p_job); $$;
revoke all on function public.m6_staff_summary(uuid) from public,anon;
grant execute on function public.m6_staff_summary(uuid) to authenticated;

revoke all on function kerja_private.m6_begin(text,boolean) from public,anon;
grant execute on function kerja_private.m6_begin(text,boolean) to authenticated;
create function public.m6_begin(p_scope text,p_external boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m6_begin(p_scope,p_external); $$;
revoke all on function public.m6_begin(text,boolean) from public,anon;
grant execute on function public.m6_begin(text,boolean) to authenticated;

revoke all on function kerja_private.m6_complete(uuid,text,text,text,text) from public,anon;
grant execute on function kerja_private.m6_complete(uuid,text,text,text,text) to authenticated;
create function public.m6_complete(p_event uuid,p_tool text,p_warning text,p_actual text,p_provider text) returns void language sql security invoker set search_path='' as $$ select kerja_private.m6_complete(p_event,p_tool,p_warning,p_actual,p_provider); $$;
revoke all on function public.m6_complete(uuid,text,text,text,text) from public,anon;
grant execute on function public.m6_complete(uuid,text,text,text,text) to authenticated;
commit;
