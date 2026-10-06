-- Scoped recruiter desktop parity. Additive; requires M1-M12. No auth bypass.
begin;
alter table public.m1_jobs add column description text not null default '', add column requirements jsonb not null default '[]', add column opens_at timestamptz, add column closes_at timestamptz, add column revision integer not null default 0;
alter table public.m1_jobs add constraint m14_window check(opens_at is null or closes_at is null or closes_at>opens_at);
grant select(description,requirements,opens_at,closes_at,revision) on public.m1_jobs to anon,authenticated;
create function kerja_private.m14_job_staff(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select kerja_private.active_auth_session() and auth.jwt()->>'aal'='aal2' and exists(select 1 from public.m1_jobs j join public.m1_memberships m on m.employer_id=j.employer_id where j.id=p_job and m.user_id=auth.uid() and m.active and m.role in ('hm','admin','recruiter') and (m.role='admin' or exists(select 1 from public.m1_job_assignments a where a.job_id=j.id and a.user_id=auth.uid())));
$$;
revoke all on function kerja_private.m14_job_staff(uuid) from public,anon;
grant execute on function kerja_private.m14_job_staff(uuid) to authenticated;
create function kerja_private.m14_recruiter_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not kerja_private.active_auth_session() or auth.jwt()->>'aal' is distinct from 'aal2' or not exists(select 1 from public.m1_memberships m where m.user_id=auth.uid() and m.active and m.role in ('hm','admin','recruiter')) then raise insufficient_privilege; end if;
 return jsonb_build_object('jobs',coalesce((select jsonb_agg(to_jsonb(j)) from public.m1_jobs j where kerja_private.m14_job_staff(j.id)),'[]'::jsonb),'employers',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name)) from public.m1_employers e join public.m1_memberships m on m.employer_id=e.id where m.user_id=auth.uid() and m.active and m.role in ('hm','admin','recruiter')),'[]'::jsonb));
end; $$;
create function kerja_private.m14_job_save(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare employer uuid:=(p_data->>'employer_id')::uuid; target uuid:=(p_data->>'job_id')::uuid; op uuid:=(p_data->>'idempotency_key')::uuid; old public.m1_jobs; result jsonb; prior kerja_private.operation_keys;
begin
 perform kerja_private.m14_recruiter_context();
 if employer is null or op is null or p_data->>'title' is null or length(trim(p_data->>'title')) not between 2 and 120 or jsonb_typeof(p_data->'requirements') is distinct from 'array' or jsonb_array_length(p_data->'requirements')>20 or length(coalesce(p_data->>'description',''))>6000 or length(coalesce(p_data->>'department',''))>120 or exists(select 1 from jsonb_array_elements_text(p_data->'requirements') r where length(r)>500) then raise check_violation; end if;
 if not exists(select 1 from public.m1_memberships m where m.employer_id=employer and m.user_id=auth.uid() and m.active and m.role in ('hm','admin','recruiter')) then raise insufficient_privilege; end if;
 -- Serialize per-employer job edits and retry keys without global locking.
 perform 1 from public.m1_employers where id=employer for update;
 select * into prior from kerja_private.operation_keys where actor_id=auth.uid() and key=op;
 if found then if prior.operation!='m14_job_save' or prior.request!=p_data then raise serialization_failure; end if; return prior.result; end if;
 if target is not null then
  if not kerja_private.m14_job_staff(target) then raise insufficient_privilege; end if;
  select * into old from public.m1_jobs where id=target for update;
  if old.employer_id!=employer or old.closed_at is not null or old.revision is distinct from (p_data->>'expected_revision')::integer then raise serialization_failure; end if;
  update public.m1_jobs set title=p_data->>'title',department=coalesce(p_data->>'department',''),description=coalesce(p_data->>'description',''),requirements=p_data->'requirements',published=(p_data->>'published')::boolean,opens_at=(p_data->>'opens_at')::timestamptz,closes_at=(p_data->>'closes_at')::timestamptz,revision=revision+1 where id=target;
 else
  insert into public.m1_jobs(employer_id,title,department,description,requirements,published,opens_at,closes_at) values(employer,p_data->>'title',coalesce(p_data->>'department',''),coalesce(p_data->>'description',''),p_data->'requirements',coalesce((p_data->>'published')::boolean,false),(p_data->>'opens_at')::timestamptz,(p_data->>'closes_at')::timestamptz) returning id into target;
  insert into public.m1_job_assignments(user_id,job_id) values(auth.uid(),target);
 end if;
 select to_jsonb(j) into result from public.m1_jobs j where id=target;
 insert into kerja_private.operation_keys values(auth.uid(),op,'m14_job_save',p_data,result);
 return result;
end; $$;
create function kerja_private.m14_candidate_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform kerja_private.m14_recruiter_context();
 return coalesce((select jsonb_agg(to_jsonb(t)) from (select a.candidate_id,p.display_name,count(*) application_count,bool_and(u.email_confirmed_at is not null) email_verified from public.m1_applications a join public.m1_profiles p on p.id=a.candidate_id join auth.users u on u.id=a.candidate_id where kerja_private.m14_job_staff(a.job_id) group by a.candidate_id,p.display_name order by p.display_name limit 100) t),'[]'::jsonb);
end; $$;
create function kerja_private.m14_public_jobs() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select id,title,department,employer_id,description,requirements,opens_at,closes_at from public.m1_jobs where published and closed_at is null and (opens_at is null or opens_at<=now()) and (closes_at is null or closes_at>now()) order by title limit 100) t;
$$;
create function kerja_private.m14_intake_window() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.m1_jobs where id=new.job_id and published and closed_at is null and (opens_at is null or opens_at<=now()) and (closes_at is null or closes_at>now())) then raise check_violation; end if;
 return new;
end; $$;
revoke all on function kerja_private.m14_intake_window() from public,anon,authenticated;
create trigger m14_application_window before insert on public.m1_applications for each row execute function kerja_private.m14_intake_window();
revoke all on function kerja_private.m14_recruiter_context() from public,anon;
grant execute on function kerja_private.m14_recruiter_context() to authenticated;
create function public.m14_recruiter_context() returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m14_recruiter_context(); $$;
revoke all on function public.m14_recruiter_context() from public,anon;
grant execute on function public.m14_recruiter_context() to authenticated;
revoke all on function kerja_private.m14_candidate_accounts() from public,anon;
grant execute on function kerja_private.m14_candidate_accounts() to authenticated;
create function public.m14_candidate_accounts() returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m14_candidate_accounts(); $$;
revoke all on function public.m14_candidate_accounts() from public,anon;
grant execute on function public.m14_candidate_accounts() to authenticated;
revoke all on function kerja_private.m14_job_save(jsonb) from public,anon;
grant execute on function kerja_private.m14_job_save(jsonb) to authenticated;
create function public.m14_job_save(p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m14_job_save(p_data); $$;
revoke all on function public.m14_job_save(jsonb) from public,anon;
grant execute on function public.m14_job_save(jsonb) to authenticated;
revoke all on function kerja_private.m14_public_jobs() from public,anon;
grant execute on function kerja_private.m14_public_jobs() to anon,authenticated;
create function public.m14_public_jobs() returns jsonb language sql security definer set search_path='' as $$ select kerja_private.m14_public_jobs(); $$;
revoke all on function public.m14_public_jobs() from public,anon;
grant execute on function public.m14_public_jobs() to anon,authenticated;
create table kerja_private.recruiter_sources(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.m1_jobs(id),actor_id uuid not null references auth.users(id),encrypted_profile text not null check(length(encrypted_profile) between 1 and 12000),state text not null default 'staged' check(state='staged'),expires_at timestamptz not null default now()+interval '7 days');
alter table kerja_private.recruiter_sources enable row level security;
revoke all on kerja_private.recruiter_sources from public,anon,authenticated;
grant all on kerja_private.recruiter_sources to service_role;
create function kerja_private.m14_source_stage(p_job uuid,p_encrypted text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not kerja_private.m14_job_staff(p_job) then raise insufficient_privilege; end if;
 if length(p_encrypted) not between 1 and 12000 then raise check_violation; end if;
 perform 1 from public.m1_jobs where id=p_job for update;
 if (select count(*) from kerja_private.recruiter_sources where job_id=p_job and expires_at>now())>=100 then raise check_violation; end if;
 insert into kerja_private.recruiter_sources(job_id,actor_id,encrypted_profile) values(p_job,auth.uid(),p_encrypted) returning jsonb_build_object('id',id,'state',state,'expires_at',expires_at) into result;
 return result;
end; $$;
create function kerja_private.m14_sources() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select id,job_id,encrypted_profile,state,expires_at from kerja_private.recruiter_sources where expires_at>now() and kerja_private.m14_job_staff(job_id) order by expires_at desc limit 100) t;
$$;
revoke all on function kerja_private.m14_source_stage(uuid,text) from public,anon;
grant execute on function kerja_private.m14_source_stage(uuid,text) to authenticated;
create function public.m14_source_stage(p_job uuid,p_encrypted text) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m14_source_stage(p_job,p_encrypted); $$;
revoke all on function public.m14_source_stage(uuid,text) from public,anon;
grant execute on function public.m14_source_stage(uuid,text) to authenticated;
revoke all on function kerja_private.m14_sources() from public,anon;
grant execute on function kerja_private.m14_sources() to authenticated;
create function public.m14_sources() returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m14_sources(); $$;
revoke all on function public.m14_sources() from public,anon;
grant execute on function public.m14_sources() to authenticated;
create function public.m14_source_cleanup() returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin delete from kerja_private.recruiter_sources where expires_at<=now();get diagnostics n=row_count;return n;end; $$;
revoke all on function public.m14_source_cleanup() from public,anon,authenticated;
grant execute on function public.m14_source_cleanup() to service_role;
commit;
