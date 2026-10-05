-- M7 additive discovery. External tracking never writes internal applications.
begin;
create table kerja_private.discovery_policy(id boolean primary key default true check(id),enabled boolean not null default false);
insert into kerja_private.discovery_policy values(true,false);
create table kerja_private.job_sources(
 id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 100),
 adapter text not null check(adapter in ('greenhouse','lever','scrapling')),board text check(board ~ '^[A-Za-z0-9_-]{1,80}$'),
 endpoint text not null check(endpoint ~ '^https://[^ /]+/[^ ]*$'),allowed_hosts text[] not null,
 enabled boolean not null default false,synthetic boolean not null default false,
 tos_reviewed boolean not null default false,robots_ok boolean not null default false,redistribution_approved boolean not null default false,
 evidence text not null default '',reviewed_at timestamptz,review_expires_at timestamptz,
 next_run_at timestamptz not null default now(),last_run_at timestamptz,last_error_code text,
 check(not enabled or (tos_reviewed and robots_ok and redistribution_approved and length(evidence)>10 and reviewed_at is not null and review_expires_at is not null)),
 check(cardinality(allowed_hosts) between 1 and 5)
);
-- Reviewed discovery candidates only: public access does not imply redistribution approval.
insert into kerja_private.job_sources(name,adapter,board,endpoint,allowed_hosts,evidence) values
 ('Greenhouse documentation example (not market coverage)','greenhouse','vaulttec','https://boards-api.greenhouse.io/v1/boards/vaulttec/jobs',array['boards-api.greenhouse.io','boards.greenhouse.io','job-boards.greenhouse.io'],'2026-10-02: public GET API documented at https://docs.greenhouse.io/job-board.html; example board only; employer redistribution/terms approval outstanding.'),
 ('Lever official demo (not market coverage)','lever','leverdemo','https://api.lever.co/v0/postings/leverdemo?mode=json&limit=50',array['api.lever.co','jobs.lever.co'],'2026-10-02: official demonstration API documented at https://github.com/lever/postings-api; demo only; redistribution/terms approval outstanding.');
create table kerja_private.discovery_runs(work_id uuid primary key references kerja_private.work_items(id),queued_at timestamptz not null default now());
alter table kerja_private.discovery_runs enable row level security;
revoke all on kerja_private.discovery_runs from public,anon,authenticated;
grant all on kerja_private.discovery_runs to service_role;
create table kerja_private.discovery_listings(
 id uuid primary key default gen_random_uuid(),source_id uuid not null references kerja_private.job_sources(id),provider_id text not null check(length(provider_id) between 1 and 160),
 canonical_url text not null unique,title text not null check(length(title) between 1 and 200),company text not null check(length(company) between 1 and 100),location text not null check(length(location)<=200),
 category text not null check(category in ('technology','business','other')),seniority text not null check(seniority in ('junior','senior','unspecified')),
 region text not null check(region in ('malaysia','remote','unknown','other')),classification text not null check(classification in ('unverified','flagged')),
 fetched_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '3 days',
 state text not null default 'active' check(state in ('active','removed','expired')),unique(source_id,provider_id)
);
create index discovery_freshness on kerja_private.discovery_listings(source_id,state,expires_at);
create table kerja_private.saved_jobs(actor_id uuid not null references auth.users(id),listing_id uuid not null references kerja_private.discovery_listings(id),saved_at timestamptz not null default now(),primary key(actor_id,listing_id));
create table kerja_private.external_application_notes(actor_id uuid not null references auth.users(id),listing_id uuid not null references kerja_private.discovery_listings(id),
 status text not null default 'considering' check(status in ('considering','applied','interview','offer','rejected','withdrawn')),note text not null default '' check(length(note)<=500),
 clicked_at timestamptz,updated_at timestamptz not null default now(),primary key(actor_id,listing_id));
alter table kerja_private.discovery_policy enable row level security;
alter table kerja_private.job_sources enable row level security;
alter table kerja_private.discovery_listings enable row level security;
alter table kerja_private.saved_jobs enable row level security;
alter table kerja_private.external_application_notes enable row level security;
revoke all on kerja_private.discovery_policy,kerja_private.job_sources,kerja_private.discovery_listings,kerja_private.saved_jobs,kerja_private.external_application_notes from public,anon,authenticated;
grant all on kerja_private.discovery_policy,kerja_private.job_sources,kerja_private.discovery_listings,kerja_private.saved_jobs,kerja_private.external_application_notes to service_role;
create function kerja_private.m7_source_allowed(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from kerja_private.job_sources s,kerja_private.discovery_policy p where s.id=p_id and p.id and p.enabled and s.enabled and s.tos_reviewed and s.robots_ok and s.redistribution_approved and s.review_expires_at>now()); $$;
revoke all on function kerja_private.m7_source_allowed(uuid) from public,anon,authenticated;
create function kerja_private.m7_list(p_query text,p_region text,p_category text,p_saved boolean,p_stale boolean,p_synthetic boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 if p_query is null or length(p_query)>120 or p_region is null or p_category is null or p_region not in ('all','malaysia','remote','unknown','other') or p_category not in ('all','technology','business','other') or p_saved is null or p_stale is null or p_synthetic is null then raise check_violation; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
 select l.id,l.title,l.company,l.location,l.category,l.seniority,l.region,l.classification,l.canonical_url as url,l.fetched_at,l.expires_at,
 case when not kerja_private.m7_source_allowed(s.id) then 'source_paused' when l.expires_at<=now() then 'expired' else l.state end as state,
 s.name as source,s.synthetic, b.listing_id is not null as saved,n.status as external_status,n.note,n.clicked_at,n.updated_at as note_updated_at,
 (case when lower(l.title)=lower(p_query) and p_query<>'' then 3 when p_query<>'' and position(lower(p_query) in lower(l.title))>0 then 2 else 1 end) as search_rank
 from kerja_private.discovery_listings l join kerja_private.job_sources s on s.id=l.source_id
 left join kerja_private.saved_jobs b on b.listing_id=l.id and b.actor_id=auth.uid()
 left join kerja_private.external_application_notes n on n.listing_id=l.id and n.actor_id=auth.uid()
 where s.synthetic=p_synthetic and (not p_saved or b.listing_id is not null or n.listing_id is not null)
 and (p_saved or p_stale or (kerja_private.m7_source_allowed(s.id) and l.state='active' and l.expires_at>now()))
 and (p_region='all' or l.region=p_region) and (p_category='all' or l.category=p_category)
 and (p_query='' or position(lower(p_query) in lower(l.title||' '||l.company||' '||l.location))>0)
 order by search_rank desc,l.fetched_at desc,l.id limit (case when p_saved then 200 else 100 end)) t;
 return result;
end; $$;
create function kerja_private.m7_save(p_listing uuid,p_saved boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 perform 1 from auth.users where id=auth.uid() for update;
 if p_saved is null or not exists(select 1 from kerja_private.discovery_listings where id=p_listing) then raise check_violation; end if;
 if p_saved then
  if not exists(select 1 from kerja_private.saved_jobs where actor_id=auth.uid() and listing_id=p_listing) and (select count(*) from kerja_private.saved_jobs where actor_id=auth.uid())>=100 then raise check_violation; end if;
  insert into kerja_private.saved_jobs(actor_id,listing_id) values(auth.uid(),p_listing) on conflict do nothing;
 else delete from kerja_private.saved_jobs where actor_id=auth.uid() and listing_id=p_listing; end if;
end; $$;
create function kerja_private.m7_track(p_listing uuid,p_status text,p_note text,p_click boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 perform 1 from auth.users where id=auth.uid() for update;
 if p_click is null or p_note is null or length(p_note)>500 or p_status is null or p_status not in ('considering','applied','interview','offer','rejected','withdrawn') or not exists(select 1 from kerja_private.discovery_listings where id=p_listing) then raise check_violation; end if;
 if not exists(select 1 from kerja_private.external_application_notes where actor_id=auth.uid() and listing_id=p_listing) and (select count(*) from kerja_private.external_application_notes where actor_id=auth.uid())>=100 then raise check_violation; end if;
 if p_click then
  insert into kerja_private.external_application_notes(actor_id,listing_id,clicked_at) values(auth.uid(),p_listing,now())
  on conflict(actor_id,listing_id) do update set clicked_at=now(),updated_at=now();
 else
  insert into kerja_private.external_application_notes(actor_id,listing_id,status,note) values(auth.uid(),p_listing,p_status,p_note)
  on conflict(actor_id,listing_id) do update set status=excluded.status,note=excluded.note,updated_at=now();
 end if;
end; $$;
create function kerja_private.m7_forget(p_listing uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 delete from kerja_private.external_application_notes where actor_id=auth.uid() and listing_id=p_listing;
 delete from kerja_private.saved_jobs where actor_id=auth.uid() and listing_id=p_listing;
end; $$;
create function kerja_private.m7_progress() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege; end if;
 return (select jsonb_build_object('enabled',p.enabled,'sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'synthetic',s.synthetic,'enabled',kerja_private.m7_source_allowed(s.id),'last_run_at',s.last_run_at,'next_run_at',s.next_run_at,'warning',s.last_error_code)) from kerja_private.job_sources s),'[]'::jsonb)) from kerja_private.discovery_policy p where p.id);
end; $$;
create function kerja_private.m7_enqueue() returns integer language plpgsql security definer set search_path='' as $$
declare s kerja_private.job_sources;n integer:=0;remaining integer;wid uuid;
begin
 -- Serialize scheduling; no browser-accessible enqueue or arbitrary endpoint.
 perform 1 from kerja_private.discovery_policy where id for update;
 delete from kerja_private.discovery_runs where queued_at<now()-interval '7 days';
 select greatest(0,5-count(*))::integer into remaining from kerja_private.discovery_runs where queued_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 for s in select * from kerja_private.job_sources where kerja_private.m7_source_allowed(id) and next_run_at<=now() order by next_run_at,id limit remaining for update loop
  if exists(select 1 from kerja_private.work_items where kind='job_discovery' and reference_id=s.id and state in ('pending','leased')) then continue; end if;
  insert into kerja_private.work_items(kind,reference_id,idempotency_key) values('job_discovery',s.id,'m7:'||s.id::text||':'||gen_random_uuid()::text) returning id into wid;
  insert into kerja_private.discovery_runs(work_id) values(wid);
  update kerja_private.job_sources set next_run_at=now()+interval '1 day' where id=s.id;n:=n+1;
 end loop;
 update kerja_private.discovery_listings set state='expired' where state='active' and expires_at<=now();
 return n;
end; $$;
create function kerja_private.m7_claim(p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w kerja_private.work_items;s kerja_private.job_sources;
begin
 if p_lease is null then raise check_violation; end if;
 perform 1 from kerja_private.discovery_policy where id for update;
 update kerja_private.work_items set state='cancelled',lease_until=null where kind='job_discovery' and state in ('pending','leased') and not kerja_private.m7_source_allowed(reference_id);
 update kerja_private.work_items set state='dead',last_error_code='retry_exhausted',lease_until=null where kind='job_discovery' and state in ('pending','leased') and attempts>=3 and (lease_until is null or lease_until<=now());
 if exists(select 1 from kerja_private.work_items where kind='job_discovery' and state='leased' and lease_until>now()) then return null; end if;
 select * into w from kerja_private.work_items where kind='job_discovery' and attempts<3 and due_at<=now() and (state='pending' or (state='leased' and lease_until<=now())) and kerja_private.m7_source_allowed(reference_id) order by due_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 select * into s from kerja_private.job_sources where id=w.reference_id;
 update kerja_private.work_items set state='leased',lease_token=p_lease,lease_until=now()+interval '2 minutes',attempts=attempts+1 where id=w.id;
 return to_jsonb(s)||jsonb_build_object('work_id',w.id,'lease',p_lease);
end; $$;
create function kerja_private.m7_finish(p_work uuid,p_lease uuid,p_listings jsonb,p_complete boolean,p_code text,p_retry integer) returns integer language plpgsql security definer set search_path='' as $$
declare w kerja_private.work_items;s kerja_private.job_sources;j jsonb;n integer:=0;seen text[]:='{}';
begin
 select * into w from kerja_private.work_items where id=p_work and kind='job_discovery' for update;
 if not found or w.state<>'leased' or w.lease_token is distinct from p_lease or w.lease_until<=now() then raise insufficient_privilege; end if;
 select * into s from kerja_private.job_sources where id=w.reference_id for update;
 if not kerja_private.m7_source_allowed(s.id) then
  update kerja_private.work_items set state='cancelled',lease_until=null where id=w.id;return 0;
 end if;
 if p_complete is null or p_retry is null or p_retry not between 60 and 86400 or p_listings is null or jsonb_typeof(p_listings)<>'array' or jsonb_array_length(p_listings)>50 or (p_code is not null and p_code not in ('blocked','rate_limited','timeout','unavailable','unsafe_target','robots_denied','invalid_feed','optional_unavailable')) then raise check_violation; end if;
 if p_code is not null then
  update kerja_private.job_sources set last_error_code=p_code,next_run_at=greatest(next_run_at,now()+make_interval(secs=>p_retry)),enabled=case when p_code in ('blocked','robots_denied','unsafe_target') then false else enabled end where id=s.id;
  update kerja_private.work_items set state=case when p_code in ('blocked','robots_denied','unsafe_target') then 'cancelled' when attempts>=3 then 'dead' else 'pending' end,due_at=now()+make_interval(secs=>p_retry),last_error_code=p_code,lease_until=null where id=w.id;
  return 0;
 end if;
 for j in select value from jsonb_array_elements(p_listings) loop
  if j->>'url' is null or j->>'url' !~ '^https://[a-zA-Z0-9.-]+/' or not exists(select 1 from unnest(s.allowed_hosts) host where split_part(split_part(j->>'url','/',3),':',1)=host) or j->>'url' ~ '[@[:space:]\\]' then raise check_violation; end if;
  seen:=array_append(seen,j->>'provider_id');
  -- Identical links across sources are stored once, without changing provenance.
  if exists(select 1 from kerja_private.discovery_listings where canonical_url=j->>'url' and (source_id<>s.id or provider_id<>j->>'provider_id')) then continue; end if;
  insert into kerja_private.discovery_listings(source_id,provider_id,canonical_url,title,company,location,category,seniority,region,classification)
  values(s.id,j->>'provider_id',j->>'url',j->>'title',j->>'company',j->>'location',j->>'category',j->>'seniority',j->>'region',j->>'classification')
  on conflict(source_id,provider_id) do update set canonical_url=excluded.canonical_url,title=excluded.title,company=excluded.company,location=excluded.location,category=excluded.category,seniority=excluded.seniority,region=excluded.region,classification=excluded.classification,fetched_at=now(),expires_at=now()+interval '3 days',state='active';n:=n+1;
 end loop;
 if p_complete then update kerja_private.discovery_listings set state='removed' where source_id=s.id and provider_id<>all(seen) and state='active'; end if;
 update kerja_private.job_sources set last_run_at=now(),last_error_code=null where id=s.id;
 update kerja_private.work_items set state='done',lease_until=null,last_error_code=null where id=w.id;
 return n;
end; $$;
revoke all on function kerja_private.m7_list(text,text,text,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function kerja_private.m7_list(text,text,text,boolean,boolean,boolean) to authenticated;
create function public.m7_list(p_query text,p_region text,p_category text,p_saved boolean,p_stale boolean,p_synthetic boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m7_list(p_query,p_region,p_category,p_saved,p_stale,p_synthetic); $$;
revoke all on function public.m7_list(text,text,text,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.m7_list(text,text,text,boolean,boolean,boolean) to authenticated;
revoke all on function kerja_private.m7_save(uuid,boolean) from public,anon,authenticated;
grant execute on function kerja_private.m7_save(uuid,boolean) to authenticated;
create function public.m7_save(p_listing uuid,p_saved boolean) returns void language sql security invoker set search_path='' as $$ select kerja_private.m7_save(p_listing,p_saved); $$;
revoke all on function public.m7_save(uuid,boolean) from public,anon,authenticated;
grant execute on function public.m7_save(uuid,boolean) to authenticated;
revoke all on function kerja_private.m7_track(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function kerja_private.m7_track(uuid,text,text,boolean) to authenticated;
create function public.m7_track(p_listing uuid,p_status text,p_note text,p_click boolean) returns void language sql security invoker set search_path='' as $$ select kerja_private.m7_track(p_listing,p_status,p_note,p_click); $$;
revoke all on function public.m7_track(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.m7_track(uuid,text,text,boolean) to authenticated;
revoke all on function kerja_private.m7_forget(uuid) from public,anon,authenticated;
grant execute on function kerja_private.m7_forget(uuid) to authenticated;
create function public.m7_forget(p_listing uuid) returns void language sql security invoker set search_path='' as $$ select kerja_private.m7_forget(p_listing); $$;
revoke all on function public.m7_forget(uuid) from public,anon,authenticated;
grant execute on function public.m7_forget(uuid) to authenticated;
revoke all on function kerja_private.m7_progress() from public,anon,authenticated;
grant execute on function kerja_private.m7_progress() to authenticated;
create function public.m7_progress() returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m7_progress(); $$;
revoke all on function public.m7_progress() from public,anon,authenticated;
grant execute on function public.m7_progress() to authenticated;
revoke all on function kerja_private.m7_enqueue() from public,anon,authenticated;
grant execute on function kerja_private.m7_enqueue() to service_role;
create function public.m7_enqueue() returns integer language sql security invoker set search_path='' as $$ select kerja_private.m7_enqueue(); $$;
revoke all on function public.m7_enqueue() from public,anon,authenticated;
grant execute on function public.m7_enqueue() to service_role;
revoke all on function kerja_private.m7_claim(uuid) from public,anon,authenticated;
grant execute on function kerja_private.m7_claim(uuid) to service_role;
create function public.m7_claim(p_lease uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m7_claim(p_lease); $$;
revoke all on function public.m7_claim(uuid) from public,anon,authenticated;
grant execute on function public.m7_claim(uuid) to service_role;
revoke all on function kerja_private.m7_finish(uuid,uuid,jsonb,boolean,text,integer) from public,anon,authenticated;
grant execute on function kerja_private.m7_finish(uuid,uuid,jsonb,boolean,text,integer) to service_role;
create function public.m7_finish(p_work uuid,p_lease uuid,p_listings jsonb,p_complete boolean,p_code text,p_retry integer) returns integer language sql security invoker set search_path='' as $$ select kerja_private.m7_finish(p_work,p_lease,p_listings,p_complete,p_code,p_retry); $$;
revoke all on function public.m7_finish(uuid,uuid,jsonb,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.m7_finish(uuid,uuid,jsonb,boolean,text,integer) to service_role;
commit;
