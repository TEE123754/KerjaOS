-- M10 owned tracker, companies and immutable encrypted resume library. Additive only.
begin;
create table kerja_private.tracker_companies(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),name text not null check(length(trim(name)) between 1 and 120),domain text not null default '' check(length(domain)<=253),employer_id uuid references public.m1_employers(id),note text not null default '' check(length(note)<=1000),revision integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,domain,name));
create table kerja_private.resume_versions(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),label text not null check(length(trim(label)) between 1 and 120),object_key text not null unique,sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),state text not null default 'upload_pending' check(state in ('upload_pending','ready','deleted')),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '90 days',deleted_at timestamptz,deletion_lease uuid,deletion_lease_until timestamptz);
create table kerja_private.manual_applications(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),company_id uuid not null references kerja_private.tracker_companies(id),title text not null check(length(trim(title)) between 1 and 200),url text not null default '' check(length(url)<=2000 and (url='' or url ~ '^https://[^ /@]+/[^ ]*$')),status text not null check(status in ('considering','applied','interview','offer','rejected','withdrawn','hired')),applied_on date, note text not null default '' check(length(note)<=1000),resume_version_id uuid references kerja_private.resume_versions(id),archived boolean not null default false,revision integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index manual_unique_url on kerja_private.manual_applications(owner_id,url) where url<>'';
create table kerja_private.manual_history(id uuid primary key default gen_random_uuid(),application_id uuid not null references kerja_private.manual_applications(id) on delete cascade,status text not null,reason text not null,snapshot jsonb not null,created_at timestamptz not null default now());
create table kerja_private.resume_submission_links(document_id uuid primary key references kerja_private.documents(id),application_id uuid not null references public.m1_applications(id),version_id uuid not null references kerja_private.resume_versions(id),operation_key uuid not null,application_version integer not null,created_at timestamptz not null default now(),unique(application_id,operation_key));
create table kerja_private.tracker_deletion_ledger(kind text not null check(kind in ('manual','company','resume_library')),record_id uuid not null,owner_id uuid not null,deleted_at timestamptz not null,primary key(kind,record_id));
create index tracker_manual_owner on kerja_private.manual_applications(owner_id,created_at,id);
create index tracker_company_owner on kerja_private.tracker_companies(owner_id,created_at,id);
create index resume_version_owner on kerja_private.resume_versions(owner_id,created_at,id);
do $$ declare n text;begin foreach n in array array['tracker_companies','resume_versions','manual_applications','manual_history','resume_submission_links','tracker_deletion_ledger'] loop execute format('alter table kerja_private.%I enable row level security',n);execute format('revoke all on kerja_private.%I from public,anon,authenticated',n);execute format('grant all on kerja_private.%I to service_role',n);end loop;end $$;
create function kerja_private.m10_require() returns void language plpgsql stable security definer set search_path='' as $$ begin if not kerja_private.active_auth_session() then raise insufficient_privilege;end if;end; $$;
create function kerja_private.m10_company(p_id uuid,p_revision integer,p_name text,p_domain text,p_employer uuid,p_note text) returns jsonb language plpgsql security definer set search_path='' as $$ declare c kerja_private.tracker_companies;begin
 perform kerja_private.m10_require();perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,10));
 if p_domain is null or (p_domain<>'' and (p_domain<>lower(p_domain) or p_domain !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$' or position('..' in p_domain)>0)) then raise check_violation;end if;
 if p_employer is not null and not exists(select 1 from public.m1_jobs where employer_id=p_employer and published) then raise insufficient_privilege;end if;
 if p_id is null then
  if (select count(*) from kerja_private.tracker_companies where owner_id=auth.uid())>=100 then raise check_violation;end if;
  insert into kerja_private.tracker_companies(owner_id,name,domain,employer_id,note) values(auth.uid(),p_name,p_domain,p_employer,p_note) returning * into c;
 else
  update kerja_private.tracker_companies set name=p_name,domain=p_domain,employer_id=p_employer,note=p_note,revision=revision+1,updated_at=now() where id=p_id and owner_id=auth.uid() and revision=p_revision returning * into c;
  if not found then raise insufficient_privilege;end if;
 end if;return to_jsonb(c)-'owner_id';end; $$;
create function kerja_private.m10_companies(p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin perform kerja_private.m10_require();if p_offset is null or p_offset not between 0 and 10000 then raise check_violation;end if;return (select coalesce(jsonb_agg(to_jsonb(c)-'owner_id'),'[]') from (select * from kerja_private.tracker_companies where owner_id=auth.uid() order by created_at desc,id limit 50 offset p_offset) c);end; $$;
create function kerja_private.m10_manual(p_id uuid,p_revision integer,p_company uuid,p_title text,p_url text,p_status text,p_applied date,p_note text,p_resume uuid,p_archive boolean) returns jsonb language plpgsql security definer set search_path='' as $$ declare r kerja_private.manual_applications;begin
 perform kerja_private.m10_require();perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,10));
 if not exists(select 1 from kerja_private.tracker_companies where id=p_company and owner_id=auth.uid()) then raise insufficient_privilege;end if;
 if p_resume is not null and not exists(select 1 from kerja_private.resume_versions where id=p_resume and owner_id=auth.uid() and ((state='ready' and deleted_at is null and expires_at>now()) or exists(select 1 from kerja_private.manual_applications where id=p_id and owner_id=auth.uid() and resume_version_id=p_resume))) then raise insufficient_privilege;end if;
 if p_applied>(now() at time zone 'Asia/Kuala_Lumpur')::date or p_applied<date '1900-01-01' or p_archive is null then raise check_violation;end if;
 if p_id is null then
  if (select count(*) from kerja_private.manual_applications where owner_id=auth.uid())>=200 then raise check_violation;end if;
  insert into kerja_private.manual_applications(owner_id,company_id,title,url,status,applied_on,note,resume_version_id,archived) values(auth.uid(),p_company,p_title,p_url,p_status,p_applied,p_note,p_resume,p_archive) returning * into r;
 else
  update kerja_private.manual_applications set company_id=p_company,title=p_title,url=p_url,status=p_status,applied_on=p_applied,note=p_note,resume_version_id=p_resume,archived=p_archive,revision=revision+1,updated_at=now() where id=p_id and owner_id=auth.uid() and revision=p_revision returning * into r;
  if not found then raise insufficient_privilege;end if;
 end if;
 insert into kerja_private.manual_history(application_id,status,reason,snapshot) values(r.id,r.status,case when r.archived then 'Self-reported record archived' else 'Candidate updated self-reported record: '||r.note end,to_jsonb(r)-'owner_id');return to_jsonb(r)-'owner_id';end; $$;
create function kerja_private.m10_forget(p_kind text,p_id uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$ begin
 perform kerja_private.m10_require();perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,10));
 if p_kind='manual' then delete from kerja_private.manual_applications where id=p_id and owner_id=auth.uid() and revision=p_revision;
 elsif p_kind='company' then delete from kerja_private.tracker_companies where id=p_id and owner_id=auth.uid() and revision=p_revision and not exists(select 1 from kerja_private.manual_applications where company_id=p_id);
 else raise check_violation;end if;if not found then raise insufficient_privilege;end if;end; $$;
create function kerja_private.m10_history(p_origin text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare r jsonb;begin
 perform kerja_private.m10_require();
 if p_origin='manual' and exists(select 1 from kerja_private.manual_applications where id=p_id and owner_id=auth.uid()) then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into r from (select id,status,reason,snapshot,created_at from kerja_private.manual_history where application_id=p_id order by created_at desc,id limit 100) t;
 elsif p_origin='internal' and exists(select 1 from public.m1_applications where id=p_id and candidate_id=auth.uid()) then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into r from (select id,event_type as status,reason,created_at from public.m1_application_events where application_id=p_id order by created_at desc,id limit 100) t;
 elsif p_origin='discovery' and exists(select 1 from kerja_private.external_application_notes where listing_id=p_id and actor_id=auth.uid()) then select jsonb_build_array(jsonb_build_object('status',status,'reason',note,'created_at',updated_at)) into r from kerja_private.external_application_notes where listing_id=p_id and actor_id=auth.uid();
 else raise insufficient_privilege;end if;return r;end; $$;
create function kerja_private.m10_list(p_query text,p_origin text,p_status text,p_company text,p_from date,p_to date,p_archive boolean,p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare result jsonb;begin
 perform kerja_private.m10_require();if p_query is null or length(p_query)>120 or p_company is null or length(p_company)>120 or p_origin not in ('all','internal','manual','discovery') or p_status is null or length(p_status)>40 or p_offset is null or p_offset not between 0 and 10000 or p_archive is null or p_from>p_to then raise check_violation;end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
 select * from (
 select a.id,'internal'::text as origin,j.title,coalesce(e.name,'Employer') as company,a.employer_id as company_id,a.status,a.stage,a.created_at,a.created_at::date as applied_on,false as archived,''::text as url,''::text as note,a.version as revision,a.resume_snapshot_id as document_id,(select version_id from kerja_private.resume_submission_links where document_id=a.resume_snapshot_id) as resume_version_id
 from public.m1_applications a join public.m1_jobs j on j.id=a.job_id left join public.m1_employers e on e.id=a.employer_id where a.candidate_id=auth.uid()
 union all select m.id,'manual',m.title,c.name,c.id,m.status,null,m.created_at,m.applied_on,m.archived,m.url,m.note,m.revision,null,m.resume_version_id from kerja_private.manual_applications m join kerja_private.tracker_companies c on c.id=m.company_id where m.owner_id=auth.uid()
 union all select l.id,'discovery',l.title,l.company,null,coalesce(n.status,'saved'),null,coalesce(n.updated_at,b.saved_at),null,false,l.canonical_url,coalesce(n.note,''),null,null,null from kerja_private.discovery_listings l left join kerja_private.external_application_notes n on n.listing_id=l.id and n.actor_id=auth.uid() left join kerja_private.saved_jobs b on b.listing_id=l.id and b.actor_id=auth.uid() where n.actor_id=auth.uid() or b.actor_id=auth.uid()
 ) x where (p_origin='all' or origin=p_origin) and (p_status='' or status=p_status) and (p_company='' or position(lower(p_company) in lower(company))>0) and (p_query='' or position(lower(p_query) in lower(title||' '||company))>0) and (p_archive or not archived) and (p_from is null or applied_on>=p_from) and (p_to is null or applied_on<=p_to) order by created_at desc,id,origin limit 50 offset p_offset
 ) t;return result;end; $$;
create function kerja_private.m10_resumes(p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform kerja_private.m10_require();if p_offset is null or p_offset not between 0 and 10000 then raise check_violation;end if;
 return (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select v.id,v.label,v.state,v.created_at,v.expires_at,v.deleted_at,(select count(*) from kerja_private.resume_submission_links where version_id=v.id) as application_copies from kerja_private.resume_versions v where owner_id=auth.uid() order by created_at desc,id limit 50 offset p_offset) t);end; $$;
create function kerja_private.m10_resume_register(p_label text,p_sha text) returns jsonb language plpgsql security definer set search_path='' as $$ declare v uuid:=gen_random_uuid();k text;begin
 perform kerja_private.m10_require();perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,10));
 if (select count(*) from kerja_private.resume_versions where owner_id=auth.uid() and deleted_at is null)>=50 then raise check_violation;end if;
 k=auth.uid()::text||'/library/'||v::text||'.enc';insert into kerja_private.resume_versions(id,owner_id,label,object_key,sha256) values(v,auth.uid(),p_label,k,p_sha);
 return jsonb_build_object('id',v,'object_key',k);end; $$;
create function kerja_private.m10_resume_read(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare v kerja_private.resume_versions;begin
 perform kerja_private.m10_require();select * into v from kerja_private.resume_versions where id=p_id and owner_id=auth.uid() and state='ready' and deleted_at is null and expires_at>now();if not found then raise insufficient_privilege;end if;return to_jsonb(v);end; $$;
create function kerja_private.m10_resume_retire(p_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform kerja_private.m10_require();update kerja_private.resume_versions set expires_at=least(expires_at,now()),label='[removed]' where id=p_id and owner_id=auth.uid() and deleted_at is null;if not found then raise insufficient_privilege;end if;end; $$;
create function public.m10_resume_ready(p_id uuid) returns void language sql security invoker set search_path='' as $$ update kerja_private.resume_versions set state='ready' where id=p_id and state='upload_pending' and expires_at>now(); $$;
create function kerja_private.m10_clone(p_version uuid,p_application uuid,p_expected integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare a public.m1_applications;v kerja_private.resume_versions;d kerja_private.documents;begin
 perform kerja_private.m10_require();perform 1 from public.m1_jobs where id=(select job_id from public.m1_applications where id=p_application) for update;select * into a from public.m1_applications where id=p_application and candidate_id=auth.uid() for update;
 if not found or a.stage not in ('P0','P1') or a.status in ('withdrawn','rejected','hired','job_closed') or a.resume_snapshot_id is not null then raise insufficient_privilege;end if;
 select * into d from kerja_private.documents where id=(select document_id from kerja_private.resume_submission_links where application_id=a.id and operation_key=p_key and version_id=p_version);
 if found then return jsonb_build_object('id',d.id,'object_key',d.object_key,'state',d.state);end if;
 if a.version is distinct from p_expected or p_key is null then raise check_violation;end if;
 select * into v from kerja_private.resume_versions where id=p_version and owner_id=auth.uid() and state='ready' and deleted_at is null and expires_at>now() for update;
 if not found then raise insufficient_privilege;end if;
 if exists(select 1 from kerja_private.resume_submission_links where application_id=a.id and operation_key=p_key) then raise check_violation;end if;
 if (select count(*) from kerja_private.documents where application_id=a.id and purpose='resume' and deleted_at is null)>=10 then raise check_violation;end if;
 d.id=gen_random_uuid();d.object_key=auth.uid()::text||'/'||d.id::text||'.enc';
 insert into kerja_private.documents(id,owner_id,application_id,object_key,expires_at) values(d.id,auth.uid(),a.id,d.object_key,now()+interval '90 days');
 insert into kerja_private.resume_submission_links values(d.id,a.id,v.id,p_key,a.version,now());return jsonb_build_object('id',d.id,'object_key',d.object_key,'state','upload_pending');end; $$;
create function public.m10_clone_ready(p_document uuid) returns boolean language plpgsql security invoker set search_path='' as $$ declare a public.m1_applications;l kerja_private.resume_submission_links;begin
 select * into l from kerja_private.resume_submission_links where document_id=p_document;perform 1 from public.m1_jobs where id=(select job_id from public.m1_applications where id=l.application_id) for update;select * into a from public.m1_applications where id=l.application_id for update;
 if a.version is distinct from l.application_version or a.stage not in ('P0','P1') or a.resume_snapshot_id is not null or a.status in ('withdrawn','rejected','hired','job_closed') then update kerja_private.documents set expires_at=now() where id=p_document;return false;end if;
 update kerja_private.documents set state='quarantined' where id=p_document and state='upload_pending' and expires_at>now();return found;end; $$;
create function kerja_private.m10_links() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin perform kerja_private.m10_require();return (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select l.document_id,l.application_id,l.version_id,l.created_at,a.resume_snapshot_id=l.document_id as submitted_snapshot from kerja_private.resume_submission_links l join public.m1_applications a on a.id=l.application_id where a.candidate_id=auth.uid() order by l.created_at desc limit 100) t);end; $$;
-- Independent library objects share deletion tombstones; application copies are retained separately.
create function kerja_private.m10_library_tombstone() returns trigger language plpgsql security definer set search_path='' as $$ begin if new.deleted_at is not null and old.deleted_at is null then insert into kerja_private.document_deletion_ledger values(new.id,new.object_key,new.deleted_at) on conflict do nothing;end if;return new;end; $$;
create trigger m10_library_tombstone after update of deleted_at on kerja_private.resume_versions for each row execute function kerja_private.m10_library_tombstone();
create function public.m10_cleanup_claim(p_lease uuid) returns jsonb language plpgsql security invoker set search_path='' as $$ declare v kerja_private.resume_versions;begin
 select * into v from kerja_private.resume_versions where deleted_at is null and (expires_at<=now() or (state='upload_pending' and created_at<now()-interval '1 hour')) and (deletion_lease_until is null or deletion_lease_until<now()) order by expires_at for update skip locked limit 1;if not found then return null;end if;
 update kerja_private.resume_versions set deletion_lease=p_lease,deletion_lease_until=now()+interval '2 minutes' where id=v.id;return jsonb_build_object('id',v.id,'object_key',v.object_key);end; $$;
create function public.m10_cleanup_complete(p_id uuid,p_lease uuid) returns boolean language plpgsql security invoker set search_path='' as $$ begin
 update kerja_private.resume_versions set state='deleted',deleted_at=now(),deletion_lease=null,deletion_lease_until=null where id=p_id and deleted_at is null and deletion_lease=p_lease and deletion_lease_until>now();return found;end; $$;
revoke all on function kerja_private.m10_company(uuid,integer,text,text,uuid,text) from public,anon;grant execute on function kerja_private.m10_company(uuid,integer,text,text,uuid,text) to authenticated;
create function public.m10_company(p_id uuid,p_revision integer,p_name text,p_domain text,p_employer uuid,p_note text) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m10_company(p_id,p_revision,p_name,p_domain,p_employer,p_note); $$;revoke all on function public.m10_company(uuid,integer,text,text,uuid,text) from public,anon;grant execute on function public.m10_company(uuid,integer,text,text,uuid,text) to authenticated;
revoke all on function kerja_private.m10_companies(integer) from public,anon;grant execute on function kerja_private.m10_companies(integer) to authenticated;
create function public.m10_companies(p_offset integer) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m10_companies(p_offset); $$;revoke all on function public.m10_companies(integer) from public,anon;grant execute on function public.m10_companies(integer) to authenticated;
revoke all on function kerja_private.m10_manual(uuid,integer,uuid,text,text,text,date,text,uuid,boolean) from public,anon;grant execute on function kerja_private.m10_manual(uuid,integer,uuid,text,text,text,date,text,uuid,boolean) to authenticated;
create function public.m10_manual(p_id uuid,p_revision integer,p_company uuid,p_title text,p_url text,p_status text,p_applied date,p_note text,p_resume uuid,p_archive boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m10_manual(p_id,p_revision,p_company,p_title,p_url,p_status,p_applied,p_note,p_resume,p_archive); $$;revoke all on function public.m10_manual(uuid,integer,uuid,text,text,text,date,text,uuid,boolean) from public,anon;grant execute on function public.m10_manual(uuid,integer,uuid,text,text,text,date,text,uuid,boolean) to authenticated;
revoke all on function kerja_private.m10_forget(text,uuid,integer) from public,anon;grant execute on function kerja_private.m10_forget(text,uuid,integer) to authenticated;
create function public.m10_forget(p_kind text,p_id uuid,p_revision integer) returns void language sql security invoker set search_path='' as $$ select kerja_private.m10_forget(p_kind,p_id,p_revision); $$;revoke all on function public.m10_forget(text,uuid,integer) from public,anon;grant execute on function public.m10_forget(text,uuid,integer) to authenticated;
revoke all on function kerja_private.m10_history(text,uuid) from public,anon;grant execute on function kerja_private.m10_history(text,uuid) to authenticated;
create function public.m10_history(p_origin text,p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m10_history(p_origin,p_id); $$;revoke all on function public.m10_history(text,uuid) from public,anon;grant execute on function public.m10_history(text,uuid) to authenticated;
revoke all on function kerja_private.m10_list(text,text,text,text,date,date,boolean,integer) from public,anon;grant execute on function kerja_private.m10_list(text,text,text,text,date,date,boolean,integer) to authenticated;
create function public.m10_list(p_query text,p_origin text,p_status text,p_company text,p_from date,p_to date,p_archive boolean,p_offset integer) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m10_list(p_query,p_origin,p_status,p_company,p_from,p_to,p_archive,p_offset); $$;revoke all on function public.m10_list(text,text,text,text,date,date,boolean,integer) from public,anon;grant execute on function public.m10_list(text,text,text,text,date,date,boolean,integer) to authenticated;
revoke all on function kerja_private.m10_resumes(integer) from public,anon;grant execute on function kerja_private.m10_resumes(integer) to authenticated;
create function public.m10_resumes(p_offset integer) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m10_resumes(p_offset); $$;revoke all on function public.m10_resumes(integer) from public,anon;grant execute on function public.m10_resumes(integer) to authenticated;
revoke all on function kerja_private.m10_resume_register(text,text) from public,anon;grant execute on function kerja_private.m10_resume_register(text,text) to authenticated;
create function public.m10_resume_register(p_label text,p_sha text) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m10_resume_register(p_label,p_sha); $$;revoke all on function public.m10_resume_register(text,text) from public,anon;grant execute on function public.m10_resume_register(text,text) to authenticated;
revoke all on function kerja_private.m10_resume_read(uuid) from public,anon;grant execute on function kerja_private.m10_resume_read(uuid) to authenticated;
create function public.m10_resume_read(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m10_resume_read(p_id); $$;revoke all on function public.m10_resume_read(uuid) from public,anon;grant execute on function public.m10_resume_read(uuid) to authenticated;
revoke all on function kerja_private.m10_resume_retire(uuid) from public,anon;grant execute on function kerja_private.m10_resume_retire(uuid) to authenticated;
create function public.m10_resume_retire(p_id uuid) returns void language sql security invoker set search_path='' as $$ select kerja_private.m10_resume_retire(p_id); $$;revoke all on function public.m10_resume_retire(uuid) from public,anon;grant execute on function public.m10_resume_retire(uuid) to authenticated;
revoke all on function kerja_private.m10_clone(uuid,uuid,integer,uuid) from public,anon;grant execute on function kerja_private.m10_clone(uuid,uuid,integer,uuid) to authenticated;
create function public.m10_clone(p_version uuid,p_application uuid,p_expected integer,p_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m10_clone(p_version,p_application,p_expected,p_key); $$;revoke all on function public.m10_clone(uuid,uuid,integer,uuid) from public,anon;grant execute on function public.m10_clone(uuid,uuid,integer,uuid) to authenticated;
revoke all on function kerja_private.m10_links() from public,anon;grant execute on function kerja_private.m10_links() to authenticated;
create function public.m10_links() returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m10_links(); $$;revoke all on function public.m10_links() from public,anon;grant execute on function public.m10_links() to authenticated;
revoke all on function kerja_private.m10_require(),kerja_private.m10_library_tombstone() from public,anon,authenticated;
revoke all on function public.m10_resume_ready(uuid),public.m10_clone_ready(uuid),public.m10_cleanup_claim(uuid),public.m10_cleanup_complete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.m10_resume_ready(uuid),public.m10_clone_ready(uuid),public.m10_cleanup_claim(uuid),public.m10_cleanup_complete(uuid,uuid) to service_role;
create function kerja_private.m10_forget_tombstone() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into kerja_private.tracker_deletion_ledger values(case when tg_table_name='manual_applications' then 'manual' else 'company' end,old.id,old.owner_id,now()) on conflict do nothing;return old;end; $$;
create trigger m10_manual_tombstone after delete on kerja_private.manual_applications for each row execute function kerja_private.m10_forget_tombstone();
create trigger m10_company_tombstone after delete on kerja_private.tracker_companies for each row execute function kerja_private.m10_forget_tombstone();
create function kerja_private.m10_retire_tombstone() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.expires_at<=now() and old.expires_at>now() then insert into kerja_private.tracker_deletion_ledger values('resume_library',new.id,new.owner_id,now()) on conflict do nothing;end if;return new;end; $$;
create trigger m10_retire_tombstone after update of expires_at on kerja_private.resume_versions for each row execute function kerja_private.m10_retire_tombstone();
create function public.m10_replay_forget(p_kind text,p_id uuid,p_owner uuid) returns void language plpgsql security invoker set search_path='' as $$ begin
 if p_kind='manual' then delete from kerja_private.manual_applications where id=p_id and owner_id=p_owner;
 elsif p_kind='company' then
  if exists(select 1 from kerja_private.manual_applications where company_id=p_id) then raise check_violation;end if;
  delete from kerja_private.tracker_companies where id=p_id and owner_id=p_owner;
 elsif p_kind='resume_library' then update kerja_private.resume_versions set expires_at=least(expires_at,now()),label='[removed]' where id=p_id and owner_id=p_owner;
 else raise check_violation;end if;
end; $$;
revoke all on function kerja_private.m10_forget_tombstone(),kerja_private.m10_retire_tombstone() from public,anon,authenticated;
revoke all on function public.m10_replay_forget(text,uuid,uuid) from public,anon,authenticated;grant execute on function public.m10_replay_forget(text,uuid,uuid) to service_role;
-- Keep the established M9 sections/erasure behavior and add candidate-owned extensions.
alter function kerja_private.m9_export(text,integer) rename to m9_export_base;
create function kerja_private.m9_export(p_section text,p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare rows jsonb;begin
 perform kerja_private.m10_require();if p_offset is null or p_offset not between 0 and 100000 then raise check_violation;end if;
 case p_section
 when 'companies' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select id,name,domain,employer_id,note,revision,created_at,updated_at from kerja_private.tracker_companies where owner_id=auth.uid() order by created_at,id limit 100 offset p_offset) t;
 when 'manual_tracker' then select coalesce(jsonb_agg(to_jsonb(t)-'owner_id'),'[]') into rows from (select * from kerja_private.manual_applications where owner_id=auth.uid() order by created_at,id limit 100 offset p_offset) t;
 when 'manual_history' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select h.* from kerja_private.manual_history h join kerja_private.manual_applications m on m.id=h.application_id where m.owner_id=auth.uid() order by h.created_at,h.id limit 100 offset p_offset) t;
 when 'resume_library' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select id,label,state,created_at,expires_at,deleted_at from kerja_private.resume_versions where owner_id=auth.uid() order by created_at,id limit 100 offset p_offset) t;
 when 'resume_links' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select l.* from kerja_private.resume_submission_links l join public.m1_applications a on a.id=l.application_id where a.candidate_id=auth.uid() order by l.created_at,l.document_id limit 100 offset p_offset) t;
 else return kerja_private.m9_export_base(p_section,p_offset);end case;
 return jsonb_build_object('version','privacy-export-v2','section',p_section,'offset',p_offset,'rows',rows,'next_offset',case when jsonb_array_length(rows)=100 then p_offset+100 else null end);end; $$;
revoke all on function kerja_private.m9_export(text,integer) from public,anon;grant execute on function kerja_private.m9_export(text,integer) to authenticated;
-- SQL facade must be rebound because its parsed dependency points to the renamed function.
create or replace function public.m9_export(p_section text,p_offset integer) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m9_export(p_section,p_offset); $$;
alter function public.m9_replay_private_erasure(uuid,timestamptz) rename to m9_replay_private_erasure_base;
create function public.m9_replay_private_erasure(p_owner uuid,p_cutoff timestamptz) returns void language plpgsql security invoker set search_path='' as $$ begin
 perform public.m9_replay_private_erasure_base(p_owner,p_cutoff);
 delete from kerja_private.manual_applications where owner_id=p_owner and updated_at<=p_cutoff;
 delete from kerja_private.tracker_companies c where owner_id=p_owner and updated_at<=p_cutoff and not exists(select 1 from kerja_private.manual_applications where company_id=c.id);
 update kerja_private.tracker_companies set note='' where owner_id=p_owner and updated_at<=p_cutoff;
 update kerja_private.resume_versions set expires_at=least(expires_at,now()),label='[removed]' where owner_id=p_owner and created_at<=p_cutoff and deleted_at is null;
end; $$;
revoke all on function public.m9_replay_private_erasure(uuid,timestamptz) from public,anon,authenticated;grant execute on function public.m9_replay_private_erasure(uuid,timestamptz) to service_role;
commit;
