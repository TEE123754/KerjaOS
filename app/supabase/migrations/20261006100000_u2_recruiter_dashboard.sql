-- U2 read-only overview. No score defaults, no new hiring side effects.
begin;
create function kerja_private.m15_dashboard(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform kerja_private.m14_recruiter_context();
 if p_offset is null or p_offset not between 0 and 10000 then raise check_violation; end if;
 return jsonb_build_object('total',(select count(*) from public.m1_applications a where kerja_private.m14_job_staff(a.job_id)),
 'applications',coalesce((select jsonb_agg(to_jsonb(t)) from (
 select a.id,a.job_id,p.display_name as name,a.stage,a.status,a.version,a.created_at,
 exists(select 1 from kerja_private.pipeline_evidence e where e.application_id=a.id and e.kind='quiz' and e.outcome='satisfied' and e.revoked_at is null and e.expires_at>now()) as screening_completed,
 a.final_outcome
 from public.m1_applications a join public.m1_profiles p on p.id=a.candidate_id
 where kerja_private.m14_job_staff(a.job_id) order by a.created_at desc,a.id limit 50 offset p_offset
 ) t),'[]'::jsonb));
end; $$;
-- final_outcome is introduced by M8, before this ordered additive migration.
create function kerja_private.m15_resume_context(p_app uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform kerja_private.m14_recruiter_context();
 return (select jsonb_build_object('document_id',d.id,'object_key',d.object_key,'title',j.title,'department',j.department,'description',j.description)
 from public.m1_applications a join public.m1_jobs j on j.id=a.job_id join kerja_private.documents d on d.application_id=a.id
 where a.id=p_app and kerja_private.m14_job_staff(a.job_id) and d.owner_id=a.candidate_id and d.purpose='resume' and d.state in ('quarantined','ready') and d.deleted_at is null and d.expires_at>now()
 and (a.resume_snapshot_id is null or a.resume_snapshot_id=d.id)
 order by d.created_at desc,d.id limit 1);
end; $$;
revoke all on function kerja_private.m15_dashboard(integer),kerja_private.m15_resume_context(uuid) from public,anon;
grant execute on function kerja_private.m15_dashboard(integer),kerja_private.m15_resume_context(uuid) to authenticated;
create function public.m15_dashboard(p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m15_dashboard(p_offset); $$;
create function public.m15_resume_context(p_app uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m15_resume_context(p_app); $$;
revoke all on function public.m15_dashboard(integer),public.m15_resume_context(uuid) from public,anon;
grant execute on function public.m15_dashboard(integer),public.m15_resume_context(uuid) to authenticated;
commit;
