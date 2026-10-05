-- Additive M1 shadow schema. No destructive changes to legacy rows.
-- Run only after an encrypted DB/object backup and a reconciliation dry run.
begin;
create extension if not exists pgcrypto;
create schema if not exists kerja_private;
revoke all on schema kerja_private from public, anon;
grant usage on schema kerja_private to authenticated, service_role;

create table public.m1_profiles (
 id uuid primary key references auth.users(id), display_name text not null default '',
 locale text not null default 'en' check(locale in ('en','ms')), created_at timestamptz not null default now()
);
create table public.m1_employers (id uuid primary key default gen_random_uuid(), name text not null);
create table public.m1_memberships (
 user_id uuid references auth.users(id), employer_id uuid references public.m1_employers(id),
 role text not null check(role in ('hm','recruiter','admin','reviewer','auditor')), active boolean not null default true,
 primary key(user_id,employer_id)
);
create table public.m1_jobs (
 id uuid primary key default gen_random_uuid(), legacy_position_id bigint unique,
 employer_id uuid not null references public.m1_employers(id), title text not null,
 department text not null default '', published boolean not null default false,
 cycle integer not null default 1, unique(id,employer_id)
);
create table public.m1_job_assignments (
 user_id uuid references auth.users(id), job_id uuid references public.m1_jobs(id),
 primary key(user_id,job_id)
);
create table public.m1_applications (
 id uuid primary key default gen_random_uuid(), candidate_id uuid not null references auth.users(id),
 job_id uuid not null, employer_id uuid not null, cycle integer not null default 1,
 stage text not null default 'P0', status text not null default 'applied', version integer not null default 0,
 submission_snapshot jsonb not null default '{}', created_at timestamptz not null default now(),
 foreign key(job_id,employer_id) references public.m1_jobs(id,employer_id),
 unique(candidate_id,job_id,cycle)
);
create table public.m1_application_events (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.m1_applications(id),
 actor_id uuid references auth.users(id), actor_type text not null,
 event_type text not null, reason text not null default '', created_at timestamptz not null default now()
);
create table public.m1_outbox (
 id uuid primary key default gen_random_uuid(), application_id uuid references public.m1_applications(id),
 recipient_id uuid not null references auth.users(id), event_type text not null,
 state text not null default 'pending', created_at timestamptz not null default now()
);
create table kerja_private.operation_keys (
 actor_id uuid not null, key uuid not null, operation text not null, request jsonb not null, result jsonb not null,
 primary key(actor_id,key)
);
create table kerja_private.sessions (
 hash text primary key, user_id uuid not null references auth.users(id), csrf text not null,
 encrypted_tokens text not null, token_expires_at timestamptz not null, expires_at timestamptz not null,
 revoked_at timestamptz, refresh_until timestamptz, recovery_until timestamptz
);
create table kerja_private.documents (
 id uuid primary key, owner_id uuid not null references auth.users(id),
 application_id uuid not null references public.m1_applications(id), object_key text unique not null,
 purpose text not null default 'resume', state text not null default 'upload_pending',
 expires_at timestamptz not null, created_at timestamptz not null default now(), deleted_at timestamptz
);
create table kerja_private.work_items (
 id uuid primary key default gen_random_uuid(), kind text not null, reference_id uuid,
 idempotency_key text unique not null, state text not null default 'pending',
 due_at timestamptz not null default now(), lease_until timestamptz, lease_token uuid, attempts integer not null default 0,
 last_error_code text
);
create table kerja_private.consents (
 id uuid primary key default gen_random_uuid(), candidate_id uuid not null references auth.users(id),
 employer_id uuid references public.m1_employers(id), purpose text not null,
 version text not null, text_hash text not null, granted_at timestamptz not null default now(), revoked_at timestamptz
);
create table kerja_private.legacy_mapping (
 source_fingerprint text primary key, application_id uuid not null references public.m1_applications(id),
 imported_at timestamptz not null default now()
);
create index m1_apps_owner on public.m1_applications(candidate_id,created_at desc);
create index m1_apps_job on public.m1_applications(job_id,status);
create index m1_events_app on public.m1_application_events(application_id,created_at);
create index m1_document_expiry on kerja_private.documents(expires_at) where deleted_at is null;
create index m1_work_due on kerja_private.work_items(state,due_at);

-- The only privileged helpers callable by authenticated users check auth.uid()
-- internally, use an explicit search_path and live server-controlled memberships.
create function kerja_private.active_auth_session() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.sessions
 where id::text=auth.jwt()->>'session_id' and user_id=auth.uid());
$$;
revoke all on function kerja_private.active_auth_session() from public,anon;
grant execute on function kerja_private.active_auth_session() to authenticated;
create function kerja_private.can_review(p_job uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select kerja_private.active_auth_session() and auth.jwt()->>'aal' = 'aal2' and exists (
   select 1 from public.m1_job_assignments a join public.m1_jobs j on j.id=a.job_id
   join public.m1_memberships m on m.user_id=a.user_id and m.employer_id=j.employer_id
   where a.user_id=auth.uid() and a.job_id=p_job and m.active and m.role in ('hm','admin','recruiter')
 );
$$;
revoke all on function kerja_private.can_review(uuid) from public,anon;
grant execute on function kerja_private.can_review(uuid) to authenticated;

alter table public.m1_profiles enable row level security;
alter table public.m1_employers enable row level security;
alter table public.m1_memberships enable row level security;
alter table public.m1_jobs enable row level security;
alter table public.m1_job_assignments enable row level security;
alter table public.m1_applications enable row level security;
alter table public.m1_application_events enable row level security;
alter table public.m1_outbox enable row level security;
alter table kerja_private.sessions enable row level security;
alter table kerja_private.documents enable row level security;
alter table kerja_private.work_items enable row level security;
alter table kerja_private.consents enable row level security;
alter table kerja_private.operation_keys enable row level security;
alter table kerja_private.legacy_mapping enable row level security;

create policy own_profile_read on public.m1_profiles for select to authenticated using(id=auth.uid() and kerja_private.active_auth_session());
create policy own_profile_insert on public.m1_profiles for insert to authenticated with check(id=auth.uid() and kerja_private.active_auth_session());
create policy own_profile_update on public.m1_profiles for update to authenticated using(id=auth.uid() and kerja_private.active_auth_session()) with check(id=auth.uid() and kerja_private.active_auth_session());
create policy own_membership_read on public.m1_memberships for select to authenticated using(user_id=auth.uid() and kerja_private.active_auth_session());
create policy own_assignment_read on public.m1_job_assignments for select to authenticated using(user_id=auth.uid() and kerja_private.active_auth_session());
create policy published_jobs_read on public.m1_jobs for select to anon,authenticated using(published);
create policy assigned_jobs_read on public.m1_jobs for select to authenticated using(kerja_private.can_review(id));
create policy scoped_apps_read on public.m1_applications for select to authenticated
 using(kerja_private.active_auth_session() and (candidate_id=auth.uid() or kerja_private.can_review(job_id)));
create policy scoped_events_read on public.m1_application_events for select to authenticated using(exists(
 select 1 from public.m1_applications a where a.id=application_id and (a.candidate_id=auth.uid() or kerja_private.can_review(a.job_id))
));
create policy own_notifications_read on public.m1_outbox for select to authenticated using(recipient_id=auth.uid() and kerja_private.active_auth_session());

-- Explicit grants override broad Supabase defaults; business writes go via RPC.
revoke all on public.m1_profiles,public.m1_employers,public.m1_memberships,public.m1_jobs,
 public.m1_job_assignments,public.m1_applications,public.m1_application_events,public.m1_outbox from anon,authenticated;
grant select on public.m1_profiles,public.m1_memberships,public.m1_job_assignments,
 public.m1_applications,public.m1_application_events,public.m1_outbox to authenticated;
grant select(id,title,department,employer_id,published) on public.m1_jobs to anon,authenticated;
grant insert(id),update(display_name,locale) on public.m1_profiles to authenticated;
grant all on all tables in schema kerja_private to service_role;
grant all on public.m1_profiles,public.m1_employers,public.m1_memberships,public.m1_jobs,
 public.m1_job_assignments,public.m1_applications,public.m1_application_events,public.m1_outbox to service_role;

create function public.m1_bootstrap_profile() returns void language sql security invoker set search_path='' as $$
 insert into public.m1_profiles(id) values(auth.uid()) on conflict(id) do nothing;
$$;
revoke all on function public.m1_bootstrap_profile() from public,anon;
grant execute on function public.m1_bootstrap_profile() to authenticated;

create function public.m1_auth_session_active() returns boolean language sql security invoker set search_path='' as $$
 select kerja_private.active_auth_session();
$$;
revoke all on function public.m1_auth_session_active() from public,anon;
grant execute on function public.m1_auth_session_active() to authenticated;

create function kerja_private.submit_application(p_job uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.m1_jobs; a public.m1_applications; prior kerja_private.operation_keys; result jsonb;
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_key::text,0));
 select * into prior from kerja_private.operation_keys where actor_id=auth.uid() and key=p_key;
 if found then
   if prior.operation!='apply' or prior.request!=jsonb_build_object('job',p_job) then raise unique_violation; end if;
   return prior.result;
 end if;
 select * into j from public.m1_jobs where id=p_job and published;
 if not found then raise no_data_found; end if;
 if not exists(select 1 from public.m1_profiles where id=auth.uid()) then raise insufficient_privilege; end if;
 insert into public.m1_applications(candidate_id,job_id,employer_id,cycle,submission_snapshot)
 values(auth.uid(),j.id,j.employer_id,j.cycle,
   (select jsonb_build_object('display_name',display_name,'locale',locale) from public.m1_profiles where id=auth.uid())) returning * into a;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type)
 values(a.id,auth.uid(),'human','applied');
 insert into public.m1_outbox(application_id,recipient_id,event_type) values(a.id,auth.uid(),'applied');
 result:=jsonb_build_object('id',a.id,'job_id',a.job_id,'status',a.status,'stage',a.stage,'version',a.version);
 insert into kerja_private.operation_keys values(auth.uid(),p_key,'apply',jsonb_build_object('job',p_job),result);
 return result;
end; $$;
revoke all on function kerja_private.submit_application(uuid,uuid) from public,anon;
grant execute on function kerja_private.submit_application(uuid,uuid) to authenticated;
create function public.m1_submit_application(p_job uuid,p_key uuid) returns jsonb language sql security invoker set search_path='' as $$
 select kerja_private.submit_application(p_job,p_key);
$$;
revoke all on function public.m1_submit_application(uuid,uuid) from public,anon;
grant execute on function public.m1_submit_application(uuid,uuid) to authenticated;

create function kerja_private.human_decision(p_application uuid,p_decision text,p_reason text,p_version integer,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.m1_applications; prior kerja_private.operation_keys; result jsonb; request jsonb;
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 request:=jsonb_build_object('application',p_application,'decision',p_decision,'reason',p_reason,'version',p_version);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_key::text,0));
 select * into a from public.m1_applications where id=p_application for update;
 if not found then raise no_data_found; end if;
 if not kerja_private.can_review(a.job_id) or not exists(select 1 from public.m1_memberships
   where user_id=auth.uid() and employer_id=a.employer_id and active and role in ('hm','admin')) then raise insufficient_privilege; end if;
 select * into prior from kerja_private.operation_keys where actor_id=auth.uid() and key=p_key;
 if found then
   if prior.operation!='decision' or prior.request!=request then raise unique_violation; end if;
   return prior.result;
 end if;
 if a.version!=p_version or a.status in ('rejected','withdrawn','hired','job_closed') then raise serialization_failure; end if;
 if p_decision!='rejected' or length(trim(p_reason))<5 or length(p_reason)>1000 then raise insufficient_privilege; end if;
 update public.m1_applications set status=p_decision,version=version+1 where id=a.id returning * into a;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type,reason)
 values(a.id,auth.uid(),'human',p_decision,p_reason);
 insert into public.m1_outbox(application_id,recipient_id,event_type) values(a.id,a.candidate_id,p_decision);
 update kerja_private.documents set expires_at=least(expires_at,now()+interval '24 hours') where application_id=a.id and deleted_at is null;
 result:=jsonb_build_object('id',a.id,'status',a.status,'version',a.version);
 insert into kerja_private.operation_keys values(auth.uid(),p_key,'decision',request,result);
 return result;
end; $$;
revoke all on function kerja_private.human_decision(uuid,text,text,integer,uuid) from public,anon;
grant execute on function kerja_private.human_decision(uuid,text,text,integer,uuid) to authenticated;
create function public.m1_human_decision(p_application uuid,p_decision text,p_reason text,p_version integer,p_key uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select kerja_private.human_decision(p_application,p_decision,p_reason,p_version,p_key);
$$;
revoke all on function public.m1_human_decision(uuid,text,text,integer,uuid) from public,anon;
grant execute on function public.m1_human_decision(uuid,text,text,integer,uuid) to authenticated;

-- Service-only facade for private opaque sessions. No private schema in Data API.
create function public.m1_session_read(p_hash text) returns setof kerja_private.sessions language sql security invoker set search_path='' as $$
 select * from kerja_private.sessions where hash=p_hash and revoked_at is null and expires_at>now();
$$;
create function public.m1_session_write(p_hash text,p_data jsonb) returns void language sql security invoker set search_path='' as $$
 insert into kerja_private.sessions(hash,user_id,csrf,encrypted_tokens,token_expires_at,expires_at,recovery_until)
 values(p_hash,(p_data->>'user_id')::uuid,p_data->>'csrf',p_data->>'encrypted_tokens',(p_data->>'token_expires_at')::timestamptz,(p_data->>'expires_at')::timestamptz,(p_data->>'recovery_until')::timestamptz)
 on conflict(hash) do update set encrypted_tokens=excluded.encrypted_tokens,token_expires_at=excluded.token_expires_at;
$$;
create function public.m1_session_revoke(p_hash text) returns void language sql security invoker set search_path='' as $$
 update kerja_private.sessions set revoked_at=now() where hash=p_hash;
$$;
create function public.m1_session_refresh_claim(p_hash text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update kerja_private.sessions set refresh_until=now()+interval '30 seconds'
 where hash=p_hash and revoked_at is null and expires_at>now() and (refresh_until is null or refresh_until<now());
 return found;
end; $$;
create function public.m1_session_refresh_release(p_hash text) returns void language sql security invoker set search_path='' as $$
 update kerja_private.sessions set refresh_until=null where hash=p_hash;
$$;
create function public.m1_sessions_revoke_user(p_user uuid) returns void language sql security invoker set search_path='' as $$
 update kerja_private.sessions set revoked_at=now() where user_id=p_user;
$$;
revoke all on function public.m1_sessions_revoke_user(uuid) from public,anon,authenticated;
grant execute on function public.m1_sessions_revoke_user(uuid) to service_role;
create function public.m1_document_register(p_id uuid,p_user uuid,p_application uuid,p_key text,p_expiry timestamptz) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.m1_applications where id=p_application and candidate_id=p_user and status not in ('rejected','withdrawn','hired','job_closed')) then raise insufficient_privilege; end if;
 if p_key!=p_user::text || '/' || p_id::text || '.enc' then raise insufficient_privilege; end if;
 insert into kerja_private.documents(id,owner_id,application_id,object_key,expires_at) values(p_id,p_user,p_application,p_key,least(p_expiry,now()+interval '90 days'));
end; $$;
create function public.m1_document_ready(p_id uuid) returns void language sql security invoker set search_path='' as $$
 update kerja_private.documents set state='quarantined' where id=p_id and state='upload_pending';
$$;
create function public.m1_document_for_owner(p_id uuid,p_user uuid) returns setof kerja_private.documents language sql security invoker set search_path='' as $$
 select * from kerja_private.documents where id=p_id and owner_id=p_user and purpose='resume'
 and state in ('quarantined','ready') and deleted_at is null and expires_at>now();
$$;

-- Legacy API tables remain preserved but are no longer directly reachable by clients.
do $$ declare t text; begin
 foreach t in array array['positions','candidates','applications','settings','agent_events','agent_actions','email_events','email_drafts','agent_checkpoints','pending_email_verifications','institution_ranking_cache'] loop
   if to_regclass('public.'||t) is not null then execute format('revoke all on public.%I from anon, authenticated',t); end if;
 end loop;
end $$;
-- Every service facade is inaccessible to anon/authenticated; PUBLIC default
-- function privileges must not accidentally expose tokens or evidence.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'm1_session_%' or
       n.nspname='public' and p.proname like 'm1_document_%' loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('kerja-private','kerja-private',false,15000000,array['application/octet-stream'])
 on conflict(id) do update set public=false,file_size_limit=15000000,allowed_mime_types=array['application/octet-stream'];
-- No browser Storage policy: only server-generated, encrypted object access.
commit;

