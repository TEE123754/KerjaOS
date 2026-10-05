-- M12 private owner reminders; no employer messages; delivery disabled by default.
begin;
create table kerja_private.reminder_policy(id boolean primary key default true check(id),enabled boolean not null default false,mode text not null default 'disabled' check(mode in ('disabled','fixture','smtp')),global_daily integer not null default 30 check(global_daily between 1 and 100),owner_daily integer not null default 3 check(owner_daily between 1 and 10));
insert into kerja_private.reminder_policy(id) values(true);
create table kerja_private.reminder_preferences(owner_id uuid primary key references auth.users(id),email_opt_in boolean not null default false,revision integer not null default 0,updated_at timestamptz not null default now());
create table kerja_private.reminders(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),origin text not null check(origin in ('internal','manual','discovery','personal')),reference_id uuid,kind text not null check(kind in ('follow_up','preparation','personal')),title text not null check(length(trim(title)) between 1 and 120 and title !~ '[[:cntrl:]]'),due_at timestamptz not null,timezone text not null,state text not null default 'active' check(state in ('active','completed','cancelled')),revision integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),finished_at timestamptz,check((origin='personal')=(reference_id is null)));
create index reminders_owner_due on kerja_private.reminders(owner_id,state,due_at);
create table kerja_private.reminder_history(id bigint generated always as identity primary key,reminder_id uuid not null references kerja_private.reminders(id) on delete cascade,event text not null,revision integer not null,due_at timestamptz not null,created_at timestamptz not null default now());
create table kerja_private.reminder_deliveries(id uuid primary key default gen_random_uuid(),reminder_id uuid not null references kerja_private.reminders(id) on delete cascade,owner_id uuid not null references auth.users(id),revision integer not null,state text not null default 'queued' check(state in ('queued','leased','sending','sent','fixture','failed','disabled','unknown','cancelled','dead_letter')),attempts integer not null default 0,lease_token uuid,lease_until timestamptz,next_attempt timestamptz not null default now(),dispatched_at timestamptz,finished_at timestamptz,receipt text check(length(receipt)<=120),failure_code text check(length(failure_code)<=40),created_at timestamptz not null default now(),unique(reminder_id,revision));
create index reminders_delivery_queue on kerja_private.reminder_deliveries(state,next_attempt,created_at);
create table kerja_private.reminder_dispatch_ledger(delivery_id uuid primary key,reminder_id uuid not null,owner_id uuid not null,revision integer not null,dispatched_at timestamptz not null,outcome text not null check(outcome in ('sending','sent','fixture','failed','unknown','disabled')),unique(reminder_id,revision));
create index reminder_dispatch_day on kerja_private.reminder_dispatch_ledger(dispatched_at);
create index reminder_dispatch_owner_day on kerja_private.reminder_dispatch_ledger(owner_id,dispatched_at);
create table kerja_private.reminder_deletion_ledger(reminder_id uuid primary key,owner_id uuid not null,deleted_at timestamptz not null default now());
create table kerja_private.reminder_optout_ledger(owner_id uuid primary key,revoked_at timestamptz not null default now());
do $$ declare n text;begin foreach n in array array['reminder_policy','reminder_preferences','reminders','reminder_history','reminder_deliveries','reminder_dispatch_ledger','reminder_deletion_ledger','reminder_optout_ledger'] loop execute format('alter table kerja_private.%I enable row level security',n);execute format('revoke all on kerja_private.%I from public,anon,authenticated',n);execute format('grant all on kerja_private.%I to service_role',n);end loop;end $$;
create function kerja_private.m12_link(p_owner uuid,p_origin text,p_ref uuid) returns boolean language plpgsql stable security definer set search_path='' as $$ begin
 return case p_origin when 'personal' then p_ref is null when 'internal' then exists(select 1 from public.m1_applications where id=p_ref and candidate_id=p_owner) when 'manual' then exists(select 1 from kerja_private.manual_applications where id=p_ref and owner_id=p_owner) when 'discovery' then exists(select 1 from kerja_private.saved_jobs where listing_id=p_ref and actor_id=p_owner) or exists(select 1 from kerja_private.external_application_notes where listing_id=p_ref and actor_id=p_owner) else false end;end; $$;
create function kerja_private.m12_closed(p_origin text,p_ref uuid) returns boolean language plpgsql stable security definer set search_path='' as $$ begin
 return case p_origin when 'internal' then exists(select 1 from public.m1_applications where id=p_ref and status in ('withdrawn','rejected','hired','job_closed')) when 'manual' then exists(select 1 from kerja_private.manual_applications where id=p_ref and status in ('withdrawn','rejected','hired')) when 'discovery' then false else false end;end; $$;
create function kerja_private.m12_cancel_deliveries(p_id uuid) returns void language sql security definer set search_path='' as $$ update kerja_private.reminder_deliveries set state='cancelled',failure_code='superseded',finished_at=now(),lease_until=null where reminder_id=p_id and state in ('queued','leased','failed'); $$;
create function kerja_private.m12_change_log() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into kerja_private.reminder_history(reminder_id,event,revision,due_at) values(new.id,case when TG_OP='INSERT' then 'created' when new.state='completed' then 'completed' when new.state='cancelled' then 'cancelled' else 'snoozed' end,new.revision,new.due_at);
 if TG_OP='UPDATE' then perform kerja_private.m12_cancel_deliveries(new.id);end if;return new;end; $$;
create trigger m12_log after insert or update on kerja_private.reminders for each row execute function kerja_private.m12_change_log();
create function kerja_private.m12_tombstone() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into kerja_private.reminder_deletion_ledger(reminder_id,owner_id) values(old.id,old.owner_id) on conflict do nothing;update kerja_private.operation_keys set request='["forgotten"]'::jsonb,result='{"forgotten":true}'::jsonb where actor_id=old.owner_id and operation='reminder' and result->>'id'=old.id::text;return old;end; $$;
create trigger m12_delete before delete on kerja_private.reminders for each row execute function kerja_private.m12_tombstone();
-- Shared owner lock orders edits/preferences/enqueue/dispatch before reminder/outbox locks.
create function kerja_private.m12_edit(p_id uuid,p_revision integer,p_key uuid,p_action text,p_origin text,p_ref uuid,p_kind text,p_title text,p_due timestamptz,p_timezone text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r kerja_private.reminders; prior kerja_private.operation_keys;request jsonb;result jsonb;begin
 perform kerja_private.m10_require();perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,12));
 request=jsonb_build_array(p_id,p_revision,p_action,p_origin,p_ref,p_kind,p_title,p_due,p_timezone);
 select * into prior from kerja_private.operation_keys where actor_id=auth.uid() and key=p_key;
 if found then if prior.operation<>'reminder' or prior.request<>request then raise check_violation;end if;return prior.result;end if;
 if p_key is null or p_action is null or p_action not in ('create','snooze','complete','cancel','forget') then raise check_violation;end if;
 if p_action in ('create','snooze') and (p_due is null or p_due<now()-interval '1 minute' or p_due>now()+interval '366 days' or p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone and (name='UTC' or name like '%/%'))) then raise check_violation;end if;
 if p_action='create' then
 if p_id is not null or p_revision is distinct from 0 or p_origin is null or p_kind is null or not kerja_private.m12_link(auth.uid(),p_origin,p_ref) or (p_kind<>'personal' and (kerja_private.m12_closed(p_origin,p_ref) or (p_origin='discovery' and exists(select 1 from kerja_private.external_application_notes where listing_id=p_ref and actor_id=auth.uid() and status in ('withdrawn','rejected'))))) then raise insufficient_privilege;end if;
 if (select count(*) from kerja_private.reminders where owner_id=auth.uid())>=200 then raise program_limit_exceeded;end if;
 if p_origin='internal' and p_kind='preparation' and exists(select 1 from kerja_private.interview_bookings where application_id=p_ref and state in ('confirmed','completed')) then raise check_violation using message='Use existing confirmed interview notice';end if;
 insert into kerja_private.reminders(owner_id,origin,reference_id,kind,title,due_at,timezone) values(auth.uid(),p_origin,p_ref,p_kind,p_title,p_due,p_timezone) returning * into r;
 else
 select * into r from kerja_private.reminders where id=p_id and owner_id=auth.uid() for update;
 if r.id is null or p_revision is distinct from r.revision then raise serialization_failure;end if;
 if p_action='forget' then delete from kerja_private.reminders where id=r.id;result=jsonb_build_object('forgotten',true);
 else
 if r.state<>'active' then raise check_violation;end if;
 update kerja_private.reminders set due_at=case when p_action='snooze' then p_due else due_at end,timezone=case when p_action='snooze' then p_timezone else timezone end,state=case p_action when 'complete' then 'completed' when 'cancel' then 'cancelled' else state end,revision=revision+1,updated_at=now(),finished_at=case when p_action='snooze' then null else now() end where id=r.id returning * into r;
 end if;end if;
 result=coalesce(result,to_jsonb(r)-'owner_id');
 insert into kerja_private.operation_keys values(auth.uid(),p_key,'reminder',request,result);return result;end; $$;
create function kerja_private.m12_preference(p_opt_in boolean,p_revision integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare p kerja_private.reminder_preferences;prior kerja_private.operation_keys;request jsonb:=jsonb_build_array(p_opt_in,p_revision);result jsonb;begin
 perform kerja_private.m10_require();perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,12));
 select * into prior from kerja_private.operation_keys where actor_id=auth.uid() and key=p_key;if found then if prior.operation<>'reminder_pref' or prior.request<>request then raise check_violation;end if;return prior.result;end if;
 if p_opt_in is null or p_key is null then raise check_violation;end if;
 insert into kerja_private.reminder_preferences(owner_id) values(auth.uid()) on conflict do nothing;
 select * into p from kerja_private.reminder_preferences where owner_id=auth.uid() for update;
 if p_revision is distinct from p.revision then raise serialization_failure;end if;
 if p_opt_in and not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise insufficient_privilege;end if;
 update kerja_private.reminder_preferences set email_opt_in=p_opt_in,revision=revision+1,updated_at=now() where owner_id=auth.uid() returning * into p;
 if not p_opt_in then
 update kerja_private.reminder_deliveries set state='cancelled',finished_at=now(),failure_code='opted_out',lease_until=null where owner_id=auth.uid() and state in ('queued','leased','failed');
 insert into kerja_private.reminder_optout_ledger(owner_id) values(auth.uid()) on conflict(owner_id) do update set revoked_at=excluded.revoked_at;
 end if;
 result=to_jsonb(p)-'owner_id';insert into kerja_private.operation_keys values(auth.uid(),p_key,'reminder_pref',request,result);return result;end; $$;
create function kerja_private.m12_context(p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare result jsonb;begin perform kerja_private.m10_require();if p_offset is null or p_offset not between 0 and 10000 then raise check_violation;end if;
 select jsonb_build_object('now',now(),'policy',(select jsonb_build_object('enabled',enabled,'mode',mode) from kerja_private.reminder_policy where id),'preference',coalesce((select to_jsonb(p)-'owner_id' from kerja_private.reminder_preferences p where owner_id=auth.uid()),jsonb_build_object('email_opt_in',false,'revision',0)),
 'reminders',coalesce((select jsonb_agg(to_jsonb(t)) from (select r.id,r.origin,r.reference_id,r.kind,r.title,r.due_at,r.timezone,r.state,r.revision,r.updated_at,r.due_at<=now() and r.state='active' as due,coalesce((select d.state from kerja_private.reminder_deliveries d where d.reminder_id=r.id and d.revision=r.revision),(select outcome from kerja_private.reminder_dispatch_ledger where reminder_id=r.id and revision=r.revision),case when r.due_at<now()-interval '7 days' then 'expired_window' else 'not_queued' end) delivery from kerja_private.reminders r where r.owner_id=auth.uid() order by (state='active') desc,due_at,id limit 50 offset p_offset)t),'[]')) into result;return result;end; $$;
create function kerja_private.m12_history(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin perform kerja_private.m10_require();if not exists(select 1 from kerja_private.reminders where id=p_id and owner_id=auth.uid()) then raise insufficient_privilege;end if;return (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select event,revision,due_at,created_at from kerja_private.reminder_history where reminder_id=p_id order by created_at desc,id desc limit 100)t);end; $$;
-- Canonical status changes cancel rule-linked reminders; personal tasks remain explicit.
create function kerja_private.m12_terminal() returns trigger language plpgsql security definer set search_path='' as $$ declare origin_name text;ref uuid;actor uuid;begin
 if TG_TABLE_NAME='external_application_notes' then origin_name='discovery';ref=new.listing_id;actor=new.actor_id;
 elsif TG_TABLE_NAME='manual_applications' then origin_name='manual';ref=new.id;actor=new.owner_id;
 else origin_name='internal';ref=new.id;actor=new.candidate_id;end if;
 if new.status in ('withdrawn','rejected','hired','job_closed') then update kerja_private.reminders set state='cancelled',revision=revision+1,updated_at=now(),finished_at=now() where origin=origin_name and reference_id=ref and owner_id=actor and kind<>'personal' and state='active';end if;return new;end; $$;
create trigger m12_internal_terminal after update of status on public.m1_applications for each row execute function kerja_private.m12_terminal();
create trigger m12_manual_terminal after update of status on kerja_private.manual_applications for each row execute function kerja_private.m12_terminal();
create trigger m12_discovery_terminal after insert or update on kerja_private.external_application_notes for each row execute function kerja_private.m12_terminal();
create function kerja_private.m12_booking_notice() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.state in ('confirmed','completed') then update kerja_private.reminders set state='cancelled',revision=revision+1,updated_at=now(),finished_at=now() where origin='internal' and reference_id=new.application_id and kind='preparation' and state='active';end if;return new;end; $$;
create trigger m12_booking_dedupe after insert or update on kerja_private.interview_bookings for each row execute function kerja_private.m12_booking_notice();
-- Forget removes scoped linked reminders, with tombstones/history/outbox cascade.
create function kerja_private.m12_source_forget() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if TG_TABLE_NAME='manual_applications' then delete from kerja_private.reminders where origin='manual' and reference_id=old.id and owner_id=old.owner_id;
 else delete from kerja_private.reminders where origin='discovery' and reference_id=old.listing_id and owner_id=old.actor_id;end if;return old;end; $$;
create trigger m12_manual_forget before delete on kerja_private.manual_applications for each row execute function kerja_private.m12_source_forget();
create trigger m12_saved_forget before delete on kerja_private.saved_jobs for each row execute function kerja_private.m12_source_forget();
create trigger m12_notes_forget before delete on kerja_private.external_application_notes for each row execute function kerja_private.m12_source_forget();
-- Bounded service queue. No automatic retries after a dispatch boundary.
create function public.m12_enqueue() returns integer language plpgsql security definer set search_path='' as $$ declare n integer;begin
 insert into kerja_private.reminder_deliveries(reminder_id,owner_id,revision,state)
 select r.id,r.owner_id,r.revision,case when p.enabled and p.mode<>'disabled' then 'queued' else 'disabled' end from kerja_private.reminders r join kerja_private.reminder_preferences f on f.owner_id=r.owner_id cross join kerja_private.reminder_policy p where p.id and f.email_opt_in and r.state='active' and r.due_at<=now() and r.due_at>now()-interval '7 days' and not exists(select 1 from kerja_private.reminder_deliveries where reminder_id=r.id and revision=r.revision) and not exists(select 1 from kerja_private.reminder_dispatch_ledger where reminder_id=r.id and revision=r.revision) order by r.due_at,r.id limit 50 on conflict do nothing;
 get diagnostics n=ROW_COUNT;return n;end; $$;
create function public.m12_claim(p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare d kerja_private.reminder_deliveries;begin
 if p_lease is null then raise check_violation;end if;
 update kerja_private.reminder_deliveries set state='unknown',failure_code='expired_dispatch',finished_at=now() where state='sending' and lease_until<now();
 update kerja_private.reminder_dispatch_ledger set outcome='unknown' where outcome='sending' and dispatched_at<now()-interval '2 minutes';
 if not exists(select 1 from kerja_private.reminder_policy where id and enabled and mode<>'disabled') then return null;end if;
 select * into d from kerja_private.reminder_deliveries where ((state in ('queued','failed') and next_attempt<=now()) or (state='leased' and lease_until<now())) order by next_attempt,created_at,id for update skip locked limit 1;
 if not found then return null;end if;
 if d.attempts>=3 then update kerja_private.reminder_deliveries set state='dead_letter',failure_code='retry_exhausted',finished_at=now() where id=d.id;return null;end if;
 update kerja_private.reminder_deliveries set state='leased',attempts=attempts+1,lease_token=p_lease,lease_until=now()+interval '2 minutes' where id=d.id returning * into d;
 return jsonb_build_object('id',d.id,'lease',p_lease);end; $$;
create function public.m12_dispatch(p_id uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare d kerja_private.reminder_deliveries;r kerja_private.reminders;p kerja_private.reminder_policy;recipient text;begin
 -- Global lock serializes quota authorization, then owner lock follows user-edit ordering.
 perform pg_advisory_xact_lock(121212);select * into d from kerja_private.reminder_deliveries where id=p_id;
 if d.id is null then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended(d.owner_id::text,12));
 select * into r from kerja_private.reminders where id=d.reminder_id for update;
 select * into d from kerja_private.reminder_deliveries where id=p_id for update;select * into p from kerja_private.reminder_policy where id for share;
 if d.state<>'leased' or d.lease_token is distinct from p_lease or d.lease_until<=now() then return null;end if;
 if not p.enabled or p.mode='disabled' then update kerja_private.reminder_deliveries set state='disabled',finished_at=now() where id=d.id;return null;end if;
 select email into recipient from auth.users where id=d.owner_id and email_confirmed_at is not null;
 if recipient is null or r.id is null or r.state<>'active' or r.revision<>d.revision or r.due_at>now() or r.due_at<now()-interval '7 days' or not exists(select 1 from kerja_private.reminder_preferences where owner_id=d.owner_id and email_opt_in) or not kerja_private.m12_link(d.owner_id,r.origin,r.reference_id) or (r.kind<>'personal' and (kerja_private.m12_closed(r.origin,r.reference_id) or (r.origin='discovery' and exists(select 1 from kerja_private.external_application_notes where listing_id=r.reference_id and actor_id=d.owner_id and status in ('withdrawn','rejected'))))) then update kerja_private.reminder_deliveries set state='cancelled',failure_code='stale_or_revoked',finished_at=now() where id=d.id;return null;end if;
 if exists(select 1 from kerja_private.reminder_dispatch_ledger where reminder_id=d.reminder_id and revision=d.revision) then update kerja_private.reminder_deliveries set state='unknown',failure_code='already_dispatched',finished_at=now() where id=d.id;return null;end if;
 if (select count(*) from kerja_private.reminder_dispatch_ledger where dispatched_at>=(now() at time zone 'UTC')::date at time zone 'UTC')>=p.global_daily or (select count(*) from kerja_private.reminder_dispatch_ledger where owner_id=d.owner_id and dispatched_at>=(now() at time zone 'UTC')::date at time zone 'UTC')>=p.owner_daily then update kerja_private.reminder_deliveries set state='failed',failure_code='quota',next_attempt=(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')+interval '1 day',lease_until=null where id=d.id;return null;end if;
 insert into kerja_private.reminder_dispatch_ledger values(d.id,d.reminder_id,d.owner_id,d.revision,now(),'sending');
 update kerja_private.reminder_deliveries set state='sending',dispatched_at=now() where id=d.id;
 return jsonb_build_object('id',d.id,'recipient',recipient,'mode',p.mode,'message_id','<reminder-'||d.id::text||'@kerjaos.local>');end; $$;
create function public.m12_finish(p_id uuid,p_lease uuid,p_outcome text,p_receipt text) returns boolean language plpgsql security definer set search_path='' as $$ declare changed boolean;begin
 if p_outcome is null or p_outcome not in ('sent','fixture','unknown','disabled','failed') or length(coalesce(p_receipt,''))>120 then raise check_violation;end if;
 update kerja_private.reminder_deliveries set state=case when p_outcome='failed' then 'dead_letter' else p_outcome end,finished_at=now(),receipt=case when p_outcome in ('sent','fixture') then p_receipt else null end,failure_code=case when p_outcome in ('unknown','failed','disabled') then p_outcome else null end,lease_until=null where id=p_id and state='sending' and lease_token=p_lease;
 changed=found;
 if changed then update kerja_private.reminder_dispatch_ledger set outcome=p_outcome where delivery_id=p_id;end if;return changed;end; $$;
create function public.m12_retry_before_dispatch(p_id uuid,p_lease uuid) returns boolean language plpgsql security definer set search_path='' as $$ begin update kerja_private.reminder_deliveries set state=case when attempts>=3 then 'dead_letter' else 'failed' end,failure_code='preflight_unavailable',next_attempt=now()+interval '15 minutes',lease_until=null where id=p_id and state='leased' and lease_token=p_lease;return found;end; $$;
create function public.m12_cleanup() returns integer language plpgsql security definer set search_path='' as $$ declare n integer;begin
 delete from kerja_private.reminder_history where id in(select id from kerja_private.reminder_history where created_at<now()-interval '90 days' order by created_at limit 100);
 delete from kerja_private.reminder_deliveries where id in(select id from kerja_private.reminder_deliveries where finished_at<now()-interval '90 days' and state not in ('queued','leased','sending') order by finished_at limit 100);
 delete from kerja_private.reminders where id in(select id from kerja_private.reminders where finished_at<now()-interval '90 days' order by finished_at limit 100);get diagnostics n=ROW_COUNT;return n;end; $$;
-- Private workspace erasure + owned portability; account disposition remains reviewed.
alter function kerja_private.m9_export(text,integer) rename to m9_export_m11;
create function kerja_private.m9_export(p_section text,p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare rows jsonb;begin
 perform kerja_private.m10_require();if p_offset is null or p_offset not between 0 and 100000 then raise check_violation;end if;
 case p_section
 when 'reminders' then select coalesce(jsonb_agg(to_jsonb(t)-'owner_id'),'[]') into rows from (select * from kerja_private.reminders where owner_id=auth.uid() order by created_at,id limit 100 offset p_offset)t;
 when 'reminder_history' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select h.* from kerja_private.reminder_history h join kerja_private.reminders r on r.id=h.reminder_id where r.owner_id=auth.uid() order by h.created_at,h.id limit 100 offset p_offset)t;
 when 'reminder_deliveries' then select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (select id,reminder_id,revision,state,attempts,dispatched_at,finished_at,failure_code,created_at from kerja_private.reminder_deliveries where owner_id=auth.uid() order by created_at,id limit 100 offset p_offset)t;
 when 'reminder_preferences' then select coalesce(jsonb_agg(to_jsonb(p)-'owner_id'),'[]') into rows from kerja_private.reminder_preferences p where owner_id=auth.uid();
 else return kerja_private.m9_export_m11(p_section,p_offset);end case;
 return jsonb_build_object('version','privacy-export-v2','section',p_section,'offset',p_offset,'rows',rows,'next_offset',case when jsonb_array_length(rows)=100 then p_offset+100 else null end);end; $$;
create or replace function public.m9_export(p_section text,p_offset integer) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m9_export(p_section,p_offset); $$;
alter function public.m9_replay_private_erasure(uuid,timestamptz) rename to m9_replay_private_erasure_m11;
create function public.m9_replay_private_erasure(p_owner uuid,p_cutoff timestamptz) returns void language plpgsql security invoker set search_path='' as $$ begin
 perform public.m9_replay_private_erasure_m11(p_owner,p_cutoff);
 delete from kerja_private.reminders where owner_id=p_owner and updated_at<=p_cutoff;
 update kerja_private.reminder_preferences set email_opt_in=false,revision=revision+1,updated_at=now() where owner_id=p_owner and updated_at<=p_cutoff;
 insert into kerja_private.reminder_optout_ledger(owner_id,revoked_at) values(p_owner,p_cutoff) on conflict(owner_id) do update set revoked_at=greatest(kerja_private.reminder_optout_ledger.revoked_at,excluded.revoked_at);
 update kerja_private.reminder_deliveries set state='cancelled',finished_at=now(),failure_code='erased',lease_until=null where owner_id=p_owner and state in ('queued','leased','failed') and created_at<=p_cutoff;
end; $$;
create function public.m12_replay_forget(p_owner uuid,p_id uuid) returns void language sql security invoker set search_path='' as $$ delete from kerja_private.reminders where id=p_id and owner_id=p_owner; $$;
create function public.m12_replay_optout(p_owner uuid,p_cutoff timestamptz) returns void language plpgsql security invoker set search_path='' as $$ begin
 update kerja_private.reminder_preferences set email_opt_in=false,revision=revision+1,updated_at=p_cutoff where owner_id=p_owner and updated_at<=p_cutoff;
 update kerja_private.reminder_deliveries set state='cancelled',failure_code='opted_out',finished_at=now(),lease_until=null where owner_id=p_owner and created_at<=p_cutoff and state in ('queued','leased','failed');end; $$;
-- Narrow user JWT facades; no service queue functions available to browser.
do $$ declare f text;signature text;begin
 foreach signature in array array['m12_edit(uuid,integer,uuid,text,text,uuid,text,text,timestamptz,text)','m12_preference(boolean,integer,uuid)','m12_context(integer)','m12_history(uuid)','m9_export(text,integer)'] loop execute 'revoke all on function kerja_private.'||signature||' from public,anon';execute 'grant execute on function kerja_private.'||signature||' to authenticated';end loop;
 foreach signature in array array['m12_link(uuid,text,uuid)','m12_closed(text,uuid)','m12_cancel_deliveries(uuid)','m12_change_log()','m12_tombstone()','m12_terminal()','m12_source_forget()','m12_booking_notice()'] loop execute 'revoke all on function kerja_private.'||signature||' from public,anon,authenticated';end loop;
 foreach signature in array array['m12_enqueue()','m12_claim(uuid)','m12_dispatch(uuid,uuid)','m12_finish(uuid,uuid,text,text)','m12_retry_before_dispatch(uuid,uuid)','m12_cleanup()','m12_replay_forget(uuid,uuid)','m12_replay_optout(uuid,timestamptz)','m9_replay_private_erasure(uuid,timestamptz)'] loop execute 'revoke all on function public.'||signature||' from public,anon,authenticated';execute 'grant execute on function public.'||signature||' to service_role';end loop;
end; $$;
create function public.m12_edit(p_id uuid,p_revision integer,p_key uuid,p_action text,p_origin text,p_ref uuid,p_kind text,p_title text,p_due timestamptz,p_timezone text) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m12_edit(p_id,p_revision,p_key,p_action,p_origin,p_ref,p_kind,p_title,p_due,p_timezone); $$;
create function public.m12_preference(p_opt_in boolean,p_revision integer,p_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m12_preference(p_opt_in,p_revision,p_key); $$;
create function public.m12_context(p_offset integer) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m12_context(p_offset); $$;
create function public.m12_history(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m12_history(p_id); $$;
revoke all on function public.m12_edit(uuid,integer,uuid,text,text,uuid,text,text,timestamptz,text),public.m12_preference(boolean,integer,uuid),public.m12_context(integer),public.m12_history(uuid) from public,anon;
grant execute on function public.m12_edit(uuid,integer,uuid,text,text,uuid,text,text,timestamptz,text),public.m12_preference(boolean,integer,uuid),public.m12_context(integer),public.m12_history(uuid) to authenticated;
commit;
