-- M11 descriptive read-only analytics; observations start here, no invented backfill.
begin;
create table kerja_private.analytics_observations(
 id bigint generated always as identity primary key, application_id uuid not null references public.m1_applications(id),
 stage text not null, status text not null, stage_changed boolean not null, observed_at timestamptz not null default now());
create index analytics_observation_app on kerja_private.analytics_observations(application_id,observed_at desc);
alter table kerja_private.analytics_observations enable row level security;
revoke all on kerja_private.analytics_observations from public,anon,authenticated;
grant select on kerja_private.analytics_observations to service_role;
create function kerja_private.m11_observe() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if TG_OP='INSERT' then
 insert into kerja_private.analytics_observations(application_id,stage,status,stage_changed) values(new.id,new.stage,new.status,true);
 elsif new.stage is distinct from old.stage or new.status is distinct from old.status then
 insert into kerja_private.analytics_observations(application_id,stage,status,stage_changed) values(new.id,new.stage,new.status,new.stage is distinct from old.stage);
 end if;return new;end; $$;
revoke all on function kerja_private.m11_observe() from public,anon,authenticated;
create trigger m11_observe after insert or update on public.m1_applications for each row execute function kerja_private.m11_observe();
create function kerja_private.m11_report(p_scope text,p_from date,p_to date,p_timezone text,p_company text,p_origin text,p_job uuid,p_archive boolean,p_source text default '') returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare result jsonb;begin
 perform kerja_private.m10_require();
 if p_scope is null or p_scope not in ('candidate','staff') or p_from is null or p_to is null or p_from>p_to or p_to-p_from>365 or p_from<'1900-01-01' or p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone and (name='UTC' or name like '%/%')) or p_company is null or length(p_company)>120 or p_origin is null or p_origin not in ('all','internal','manual','discovery') or p_archive is null or p_source is null or length(p_source)>120 then raise check_violation;end if;
 if p_scope='staff' and (auth.jwt()->>'aal' is distinct from 'aal2' or not exists(select 1 from public.m1_jobs where kerja_private.can_review(id)) or (p_job is not null and not kerja_private.can_review(p_job)) or p_origin not in ('all','internal')) then raise insufficient_privilege;end if;
 if p_scope='candidate' and p_job is not null then raise check_violation;end if;
 with base as materialized (
 select a.id,'internal'::text origin,e.name company,'KerjaOS'::text source,a.status,a.stage,(a.created_at at time zone p_timezone)::date applied_on,
 (select o.observed_at from kerja_private.analytics_observations o where o.application_id=a.id and o.stage_changed and o.stage=a.stage order by o.observed_at desc,o.id desc limit 1) stage_entered,
 exists(select 1 from kerja_private.interview_bookings b where b.application_id=a.id and b.state in ('confirmed','completed')) interview_confirmed,a.final_outcome in ('offer','hired') offer_recorded
 from public.m1_applications a join public.m1_employers e on e.id=a.employer_id
 where (p_scope='candidate' and a.candidate_id=auth.uid()) or (p_scope='staff' and kerja_private.can_review(a.job_id) and (p_job is null or a.job_id=p_job))
 union all select m.id,'manual',c.name,'Manual',m.status,null,m.applied_on,null,false,m.status in ('offer','hired') from kerja_private.manual_applications m join kerja_private.tracker_companies c on c.id=m.company_id where p_scope='candidate' and m.owner_id=auth.uid() and (p_archive or not m.archived)
 union all select l.id,'discovery',l.company,s.name,coalesce(n.status,'saved'),null,null,null,false,n.status='offer' from kerja_private.discovery_listings l join kerja_private.job_sources s on s.id=l.source_id left join kerja_private.saved_jobs b on b.listing_id=l.id and b.actor_id=auth.uid() left join kerja_private.external_application_notes n on n.listing_id=l.id and n.actor_id=auth.uid() where p_scope='candidate' and (b.actor_id=auth.uid() or n.actor_id=auth.uid())
 ), filtered as materialized(select * from base where (p_origin='all' or origin=p_origin) and (p_company='' or position(lower(p_company) in lower(company))>0) and (p_source='' or position(lower(p_source) in lower(source))>0) limit 10001),
 cohort as materialized(select * from filtered where applied_on between p_from and p_to),
 raw_observations as materialized(select o.application_id,o.stage from kerja_private.analytics_observations o join cohort c on c.id=o.application_id and c.origin='internal' where o.stage_changed and (o.observed_at at time zone p_timezone)::date between p_from and p_to limit 20001),
 observations as materialized(select distinct application_id,stage from raw_observations)
 select jsonb_build_object('scope',p_scope,'from_date',p_from,'to_date',p_to,'timezone',p_timezone,'generated_at',now(),
 'total',(select count(*) from cohort),'unknown_dates',(select count(*) from filtered where applied_on is null),
 'statuses',coalesce((select jsonb_agg(to_jsonb(t) order by origin,status) from (select origin,status,count(*) count from cohort group by origin,status)t),'[]'),
 'stages',coalesce((select jsonb_agg(to_jsonb(t) order by stage) from (select stage,count(*) count,count(stage_entered) known_age_count,round(avg(extract(epoch from now()-stage_entered)/86400)::numeric,2) mean_age_days from cohort where origin='internal' group by stage)t),'[]'),
 'activity',coalesce((select jsonb_agg(to_jsonb(t) order by "day",origin) from (select applied_on as "day",origin,count(*) count from cohort group by applied_on,origin)t),'[]'),
 'companies',coalesce((select jsonb_agg(to_jsonb(t) order by count desc,company,origin) from (select company,origin,count(*) count from cohort group by company,origin order by count desc,company,origin limit 50)t),'[]'),
 'company_groups',(select count(*) from (select company,origin from cohort group by company,origin)t),
 'sources',coalesce((select jsonb_agg(to_jsonb(t) order by source,origin) from (select source,origin,count(*) count from cohort group by source,origin)t),'[]'),
 'outcomes',coalesce((select jsonb_agg(to_jsonb(t) order by origin) from (select origin,count(*) denominator,count(*) filter(where interview_confirmed or (origin<>'internal' and status='interview')) interviews,count(*) filter(where offer_recorded) offers,count(*) filter(where status='hired') hires,count(*) filter(where status='rejected') rejections,count(*) filter(where status='withdrawn') withdrawals,count(*) filter(where status='job_closed') closures from cohort group by origin)t),'[]'),
 'observed_funnel',coalesce((select jsonb_agg(to_jsonb(t) order by stage) from (select stage,count(*) applications,(select count(*) from cohort where origin='internal') denominator from observations group by stage)t),'[]'),
 'budget_exceeded',(select count(*)>10000 from filtered) or (select count(*)>20000 from raw_observations)) into result;
 if (result->>'budget_exceeded')::boolean then raise program_limit_exceeded using message='Narrow analytics cohort; budget exceeded';end if;
 return result-'budget_exceeded';end; $$;
revoke all on function kerja_private.m11_report(text,date,date,text,text,text,uuid,boolean,text) from public,anon;
grant execute on function kerja_private.m11_report(text,date,date,text,text,text,uuid,boolean,text) to authenticated;
create function public.m11_report(p_scope text,p_from date,p_to date,p_timezone text,p_company text,p_origin text,p_job uuid,p_archive boolean,p_source text default '') returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m11_report(p_scope,p_from,p_to,p_timezone,p_company,p_origin,p_job,p_archive,p_source); $$;
revoke all on function public.m11_report(text,date,date,text,text,text,uuid,boolean,text) from public,anon;
grant execute on function public.m11_report(text,date,date,text,text,text,uuid,boolean,text) to authenticated;
-- New owned observations participate in existing portability; business retention unchanged.
alter function kerja_private.m9_export(text,integer) rename to m9_export_m10;
create function kerja_private.m9_export(p_section text,p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare rows jsonb;begin
 perform kerja_private.m10_require();
 if p_section<>'analytics_observations' then return kerja_private.m9_export_m10(p_section,p_offset);end if;
 if p_offset is null or p_offset not between 0 and 100000 then raise check_violation;end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select o.application_id,o.stage,o.status,o.stage_changed,o.observed_at from kerja_private.analytics_observations o join public.m1_applications a on a.id=o.application_id where a.candidate_id=auth.uid() order by o.observed_at,o.id limit 100 offset p_offset)t;
 return jsonb_build_object('version','privacy-export-v2','section',p_section,'offset',p_offset,'rows',rows,'next_offset',case when jsonb_array_length(rows)=100 then p_offset+100 else null end);end; $$;
revoke all on function kerja_private.m9_export(text,integer) from public,anon;grant execute on function kerja_private.m9_export(text,integer) to authenticated;
create or replace function public.m9_export(p_section text,p_offset integer) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m9_export(p_section,p_offset); $$;
commit;
