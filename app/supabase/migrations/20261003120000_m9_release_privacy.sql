-- M9: candidate-scoped partial portability and human-reviewed erasure.
-- Account/business record erasure remains manual until lawful retention is approved.
begin;
create table kerja_private.privacy_requests(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),kind text not null check(kind in ('access','correction','erase_private_workspace','erase_account')),reason text not null check(length(trim(reason)) between 10 and 1000),idempotency_key uuid not null,state text not null default 'pending_review' check(state in ('pending_review','private_workspace_erased','reviewed')),created_at timestamptz not null default now(),reviewed_at timestamptz,unique(owner_id,idempotency_key));
create table kerja_private.privacy_erasure_ledger(request_id uuid primary key,owner_id uuid not null,cutoff timestamptz not null,scope text not null check(scope='private_workspace'));
create table kerja_private.document_deletion_ledger(document_id uuid primary key,object_key text not null,deleted_at timestamptz not null);
alter table kerja_private.privacy_requests enable row level security;
alter table kerja_private.privacy_erasure_ledger enable row level security;
alter table kerja_private.document_deletion_ledger enable row level security;
revoke all on kerja_private.privacy_requests,kerja_private.privacy_erasure_ledger,kerja_private.document_deletion_ledger from public,anon,authenticated;
grant all on kerja_private.privacy_requests,kerja_private.privacy_erasure_ledger,kerja_private.document_deletion_ledger to service_role;
create function kerja_private.m9_request(p_kind text,p_reason text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare r kerja_private.privacy_requests;begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,9));
 select * into r from kerja_private.privacy_requests where owner_id=auth.uid() and idempotency_key=p_key;
 if found then if r.kind is distinct from p_kind or r.reason is distinct from p_reason then raise check_violation;end if;return to_jsonb(r)-'owner_id'-'idempotency_key';end if;
 if (select count(*) from kerja_private.privacy_requests where owner_id=auth.uid() and state='pending_review')>=10 then raise check_violation;end if;
 insert into kerja_private.privacy_requests(owner_id,kind,reason,idempotency_key) values(auth.uid(),p_kind,p_reason,p_key) returning * into r;
 return to_jsonb(r)-'owner_id'-'idempotency_key';end; $$;
create function kerja_private.m9_requests() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege;end if;
 return (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select id,kind,reason,state,created_at,reviewed_at from kerja_private.privacy_requests where owner_id=auth.uid() order by created_at desc,id limit 100) t);end; $$;
create function kerja_private.m9_export(p_section text,p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare rows jsonb;begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege;end if;
 if p_offset is null or p_offset not between 0 and 100000 then raise check_violation;end if;
 case p_section
 when 'profile' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select p.id,p.display_name,p.locale,u.email from public.m1_profiles p join auth.users u on u.id=p.id where p.id=auth.uid() order by p.id limit 100 offset p_offset) t;
 when 'applications' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select a.id,a.job_id,a.stage,a.status,a.version,a.created_at,a.next_action,a.deadline_at,a.final_outcome,a.offer_accepted_at,a.submission_snapshot,a.policy_snapshot from public.m1_applications a where a.candidate_id=auth.uid() order by a.created_at,a.id limit 100 offset p_offset) t;
 when 'events' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select e.id,e.application_id,e.event_type,e.reason,e.created_at from public.m1_application_events e join public.m1_applications a on a.id=e.application_id where a.candidate_id=auth.uid() order by e.created_at,e.id limit 100 offset p_offset) t;
 when 'consents' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select id,employer_id,purpose,version,text_hash,granted_at,revoked_at from kerja_private.consents where candidate_id=auth.uid() order by granted_at,id limit 100 offset p_offset) t;
 when 'documents' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select id,application_id,purpose,state,created_at,expires_at,deleted_at from kerja_private.documents where owner_id=auth.uid() order by created_at,id limit 100 offset p_offset) t;
 when 'practice' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select id,bank_id,answers,state,started_at,deadline_at,submitted_at,objective_result from kerja_private.quiz_practice_attempts where owner_id=auth.uid() order by started_at,id limit 100 offset p_offset) t;
 when 'quiz' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select id,application_id,answers,state,started_at,deadline_at,submitted_at,objective_result from kerja_private.quiz_real_attempts where owner_id=auth.uid() order by started_at,id limit 100 offset p_offset) t;
 when 'saved' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select listing_id,saved_at from kerja_private.saved_jobs where actor_id=auth.uid() order by saved_at,listing_id limit 100 offset p_offset) t;
 when 'tracking' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select listing_id,status,note,clicked_at,updated_at from kerja_private.external_application_notes where actor_id=auth.uid() order by updated_at,listing_id limit 100 offset p_offset) t;
 when 'chat' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select id,scope,tool,requested_model,actual_model,provider,fallback_warning,created_at,expires_at from kerja_private.chat_metadata where actor_id=auth.uid() order by created_at,id limit 100 offset p_offset) t;
 when 'interviews' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select b.id,b.application_id,b.state,b.revision,b.created_at,s.starts_at,s.ends_at,s.timezone,s.mode,s.location from kerja_private.interview_bookings b join kerja_private.interview_slots s on s.id=b.slot_id join public.m1_applications a on a.id=b.application_id where a.candidate_id=auth.uid() order by b.created_at,b.id limit 100 offset p_offset) t;
 when 'identity' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select id,application_id,route,state,version from kerja_private.identity_cases where candidate_id=auth.uid() order by id limit 100 offset p_offset) t;
 when 'background' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select c.id,c.application_id,c.kind,c.provider,c.state,c.coverage,c.expires_at from kerja_private.background_cases c join public.m1_applications a on a.id=c.application_id where a.candidate_id=auth.uid() order by c.id limit 100 offset p_offset) t;
 when 'requests' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select id,kind,reason,state,created_at,reviewed_at from kerja_private.privacy_requests where owner_id=auth.uid() order by created_at,id limit 100 offset p_offset) t;
 else raise check_violation;end case;
 return jsonb_build_object('version','privacy-export-v1','section',p_section,'offset',p_offset,'rows',rows,'next_offset',case when jsonb_array_length(rows)=100 then p_offset+100 else null end,'scope','owned candidate data; confidential staff notes, question keys and raw files excluded; request manual access review for additional records');end; $$;
-- Service-only replay deliberately uses a cutoff: new private data after erasure is retained.
create function public.m9_replay_private_erasure(p_owner uuid,p_cutoff timestamptz) returns void language plpgsql security invoker set search_path='' as $$ begin
 if p_owner is null or p_cutoff is null or p_cutoff>now() then raise check_violation;end if;
 delete from kerja_private.quiz_practice_attempts where owner_id=p_owner and started_at<=p_cutoff;
 delete from kerja_private.saved_jobs where actor_id=p_owner and saved_at<=p_cutoff;
 delete from kerja_private.external_application_notes where actor_id=p_owner and updated_at<=p_cutoff;
 -- Keep unexpired external reservation counts to prevent paid/quota reset exploits.
 delete from kerja_private.chat_metadata where actor_id=p_owner and created_at<=p_cutoff and (not external_reserved or expires_at<=now());
end; $$;
create function public.m9_approve_private_erasure(p_request uuid) returns void language plpgsql security invoker set search_path='' as $$ declare r kerja_private.privacy_requests;cut timestamptz;begin
 select * into r from kerja_private.privacy_requests where id=p_request for update;
 if not found or r.kind<>'erase_private_workspace' then raise check_violation;end if;
 if r.state='private_workspace_erased' then return;end if;
 if r.state<>'pending_review' then raise check_violation;end if;
 cut=now();perform public.m9_replay_private_erasure(r.owner_id,cut);
 insert into kerja_private.privacy_erasure_ledger values(r.id,r.owner_id,cut,'private_workspace');
 update kerja_private.privacy_requests set state='private_workspace_erased',reviewed_at=cut where id=r.id;
end; $$;
-- Record all future document tombstones, including existing M1/M3/M5 workers.
create function kerja_private.m9_document_tombstone() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.deleted_at is not null and old.deleted_at is null then insert into kerja_private.document_deletion_ledger values(new.id,new.object_key,new.deleted_at) on conflict do nothing;end if;return new;end; $$;
create trigger m9_document_tombstone after update of deleted_at on kerja_private.documents for each row execute function kerja_private.m9_document_tombstone();
insert into kerja_private.document_deletion_ledger select id,object_key,deleted_at from kerja_private.documents where deleted_at is not null on conflict do nothing;
-- Expired reminders are transient; business/scorecard retention remains reviewed separately.
create function public.m9_metadata_cleanup() returns integer language plpgsql security invoker set search_path='' as $$ declare n integer;begin
 delete from kerja_private.interview_reminders where created_at<now()-interval '7 days' and (state='cancelled' or booking_id in (select b.id from kerja_private.interview_bookings b join kerja_private.interview_slots s on s.id=b.slot_id where s.ends_at<now()));get diagnostics n=row_count;return n;end; $$;
revoke all on function public.m9_replay_private_erasure(uuid,timestamptz),public.m9_approve_private_erasure(uuid),public.m9_metadata_cleanup() from public,anon,authenticated;
grant execute on function public.m9_replay_private_erasure(uuid,timestamptz),public.m9_approve_private_erasure(uuid),public.m9_metadata_cleanup() to service_role;
revoke all on function kerja_private.m9_document_tombstone() from public,anon,authenticated;
revoke all on function kerja_private.m9_request(text,text,uuid) from public,anon;
grant execute on function kerja_private.m9_request(text,text,uuid) to authenticated;
create function public.m9_request(p_kind text,p_reason text,p_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m9_request(p_kind,p_reason,p_key); $$;
revoke all on function public.m9_request(text,text,uuid) from public,anon;
grant execute on function public.m9_request(text,text,uuid) to authenticated;
revoke all on function kerja_private.m9_requests() from public,anon;
grant execute on function kerja_private.m9_requests() to authenticated;
create function public.m9_requests() returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m9_requests(); $$;
revoke all on function public.m9_requests() from public,anon;
grant execute on function public.m9_requests() to authenticated;
revoke all on function kerja_private.m9_export(text,integer) from public,anon;
grant execute on function kerja_private.m9_export(text,integer) to authenticated;
create function public.m9_export(p_section text,p_offset integer) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m9_export(p_section,p_offset); $$;
revoke all on function public.m9_export(text,integer) from public,anon;
grant execute on function public.m9_export(text,integer) to authenticated;
commit;
