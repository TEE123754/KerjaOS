begin;
alter table public.m1_applications add column final_outcome text not null default 'pending' check(final_outcome in ('pending','offer','hired','not_selected'));
alter table public.m1_applications add column offer_accepted_at timestamptz;
create table kerja_private.interview_calendar_lock(id boolean primary key default true check(id));insert into kerja_private.interview_calendar_lock values(true);
create table kerja_private.interview_slots(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.m1_jobs(id),interviewer_id uuid not null references auth.users(id),starts_at timestamptz not null,ends_at timestamptz not null,timezone text not null,mode text not null check(mode in ('online','physical')),location text not null check(length(location) between 1 and 500),cancelled boolean not null default false,created_by uuid not null references auth.users(id),check(ends_at>starts_at and ends_at<=starts_at+interval '4 hours'));
create table kerja_private.interview_bookings(id uuid primary key default gen_random_uuid(),application_id uuid not null references public.m1_applications(id),slot_id uuid not null references kerja_private.interview_slots(id),state text not null default 'proposed' check(state in ('proposed','confirmed','completed','cancelled')),revision integer not null default 0,reason text not null check(length(trim(reason)) between 5 and 1000),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index m8_one_slot on kerja_private.interview_bookings(slot_id) where state<>'cancelled';
create unique index m8_one_app on kerja_private.interview_bookings(application_id) where state<>'cancelled';
create table kerja_private.interview_scorecards(booking_id uuid primary key references kerja_private.interview_bookings(id),interviewer_id uuid not null references auth.users(id),scores jsonb not null,notes text not null check(length(notes) between 10 and 2000),submitted_at timestamptz not null default now());
create table kerja_private.interview_reminders(booking_id uuid references kerja_private.interview_bookings(id),revision integer not null,recipient_id uuid references auth.users(id),state text not null default 'due' check(state in ('due','seen','cancelled')),created_at timestamptz not null default now(),primary key(booking_id,revision,recipient_id));
do $$ declare n text;begin foreach n in array array['interview_calendar_lock','interview_slots','interview_bookings','interview_scorecards','interview_reminders'] loop execute format('alter table kerja_private.%I enable row level security',n);execute format('revoke all on kerja_private.%I from public,anon,authenticated',n);execute format('grant all on kerja_private.%I to service_role',n);end loop;end $$;
create function kerja_private.m8_interviewer(p_job uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.m1_jobs j join public.m1_memberships m on m.employer_id=j.employer_id join public.m1_job_assignments a on a.job_id=j.id and a.user_id=m.user_id where j.id=p_job and m.user_id=p_user and m.active and m.role in ('hm','admin','reviewer','recruiter')); $$;
create function kerja_private.m8_requirements(p_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $$ declare a public.m1_applications;k text;begin select * into a from public.m1_applications where id=p_id;
 if a.stage<>'P6' or a.status<>'interview_ready' or exists(select 1 from public.m1_jobs where id=a.job_id and closed_at is not null) then return false;end if;
 if coalesce((a.policy_snapshot->>'required_identity')::boolean,true) and not kerja_private.m2_requirements_met(a.id,'identity') then return false;end if;
 if coalesce((a.policy_snapshot->>'required_quiz')::boolean,true) and not kerja_private.m2_requirements_met(a.id,'quiz') then return false;end if;
 for k in select jsonb_array_elements_text(coalesce(a.policy_snapshot->'background_checks','[]')) union select case when c->>'kind'='criminal' then 'criminal' else 'credit' end from jsonb_array_elements(coalesce(a.policy_snapshot->'background_policy'->'checks','[]')) c loop if not kerja_private.m2_requirements_met(a.id,k) then return false;end if;end loop;
 return a.id is not null and not exists(select 1 from kerja_private.background_cases where application_id=a.id and state='on_hold');end; $$;
create function kerja_private.m8_slot_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 perform 1 from kerja_private.interview_calendar_lock where id for update;
 if not exists(select 1 from pg_timezone_names where name=new.timezone) or (not new.cancelled and not kerja_private.m8_interviewer(new.job_id,new.interviewer_id)) then raise check_violation;end if;
 if not new.cancelled and exists(select 1 from kerja_private.interview_slots where interviewer_id=new.interviewer_id and not cancelled and id<>new.id and starts_at<new.ends_at and ends_at>new.starts_at) then raise exclusion_violation;end if;
 return new;end; $$;
create trigger m8_slot_overlap before insert or update on kerja_private.interview_slots for each row execute function kerja_private.m8_slot_guard();
create function kerja_private.m8_slot(p_job uuid,p_interviewer uuid,p_start timestamptz,p_end timestamptz,p_timezone text,p_mode text,p_location text) returns uuid language plpgsql security definer set search_path='' as $$ declare result uuid;begin
 perform 1 from public.m1_jobs where id=p_job for update;
 if not kerja_private.m4_staff(p_job) or p_start is null or p_start<=now() or p_start>now()+interval '90 days' or p_end is null or p_timezone is null or p_mode is null or p_location is null then raise insufficient_privilege;end if;
 if (select count(*) from kerja_private.interview_slots where job_id=p_job and starts_at>now() and not cancelled)>=50 then raise check_violation;end if;
 if p_mode='online' and (p_location !~ '^https://[a-zA-Z0-9.-]+/[^[:space:]]*$' or p_location ~ '[@\\[:space:]]') then raise check_violation;end if;
 insert into kerja_private.interview_slots(job_id,interviewer_id,starts_at,ends_at,timezone,mode,location,created_by) values(p_job,p_interviewer,p_start,p_end,p_timezone,p_mode,p_location,auth.uid()) returning id into result;return result;end; $$;
create function kerja_private.m8_notify(p_app uuid,p_event text) returns void language sql security definer set search_path='' as $$ insert into public.m1_outbox(application_id,recipient_id,event_type) select id,candidate_id,p_event from public.m1_applications where id=p_app; $$;
create function kerja_private.m8_book(p_app uuid,p_slot uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$ declare a public.m1_applications;s kerja_private.interview_slots;b uuid;begin
 perform 1 from public.m1_jobs where id=(select job_id from public.m1_applications where id=p_app) for update;select * into a from public.m1_applications where id=p_app for update;
 if not kerja_private.m4_staff(a.job_id) or not kerja_private.m8_requirements(a.id) or length(trim(coalesce(p_reason,'')))<5 then raise insufficient_privilege;end if;
 perform 1 from kerja_private.interview_calendar_lock where id for update;select * into s from kerja_private.interview_slots where id=p_slot;
 if s.id is null or s.job_id<>a.job_id or s.cancelled or s.starts_at<=now() or not kerja_private.m8_interviewer(s.job_id,s.interviewer_id) then raise check_violation;end if;
 if exists(select 1 from kerja_private.interview_bookings b join kerja_private.interview_slots x on x.id=b.slot_id join public.m1_applications c on c.id=b.application_id where c.candidate_id=a.candidate_id and b.state<>'cancelled' and x.starts_at<s.ends_at and x.ends_at>s.starts_at) then raise exclusion_violation;end if;
 insert into kerja_private.interview_bookings(application_id,slot_id,reason) values(a.id,s.id,p_reason) returning id into b;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type,reason) values(a.id,auth.uid(),'human','interview_proposed',p_reason);perform kerja_private.m8_notify(a.id,'interview_proposed');return jsonb_build_object('id',b,'revision',0);end; $$;
create function kerja_private.m8_change(p_booking uuid,p_version integer,p_action text,p_slot uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$ declare a public.m1_applications;b kerja_private.interview_bookings;s kerja_private.interview_slots;owner boolean;begin
 select application_row.* into a from public.m1_applications application_row join kerja_private.interview_bookings x on x.application_id=application_row.id where x.id=p_booking;
 perform 1 from public.m1_jobs where id=a.job_id for update;select * into a from public.m1_applications where id=a.id for update;
 owner:=a.candidate_id=auth.uid() and kerja_private.active_auth_session();
 if not coalesce(owner,false) and not kerja_private.m4_staff(a.job_id) then raise insufficient_privilege;end if;
 perform 1 from kerja_private.interview_calendar_lock where id for update;select * into b from kerja_private.interview_bookings where id=p_booking for update;
 if b.id is null or p_version is null or b.revision<>p_version or b.state not in ('proposed','confirmed') or length(trim(coalesce(p_reason,'')))<5 then raise serialization_failure;end if;
 if p_action not in ('confirm','reschedule','cancel') or p_action is null then raise check_violation;end if;
 if p_action<>'cancel' and not kerja_private.m8_requirements(a.id) then raise check_violation;end if;
 if p_action='confirm' and not owner then raise insufficient_privilege;end if;
 select * into s from kerja_private.interview_slots where id=case when p_action='reschedule' then p_slot else b.slot_id end;
 if p_action<>'cancel' then
  if s.id is null or s.job_id<>a.job_id or s.cancelled or s.starts_at<=now() or not kerja_private.m8_interviewer(s.job_id,s.interviewer_id) then raise check_violation;end if;
  if exists(select 1 from kerja_private.interview_bookings x join kerja_private.interview_slots t on t.id=x.slot_id join public.m1_applications c on c.id=x.application_id where x.id<>b.id and x.state<>'cancelled' and (x.slot_id=s.id or (c.candidate_id=a.candidate_id and t.starts_at<s.ends_at and t.ends_at>s.starts_at))) then raise exclusion_violation;end if;
 end if;
 update kerja_private.interview_bookings set slot_id=case when p_action='reschedule' then s.id else slot_id end,state=case p_action when 'cancel' then 'cancelled' when 'confirm' then 'confirmed' else 'proposed' end,revision=revision+1,reason=p_reason,updated_at=now() where id=b.id returning * into b;
 update kerja_private.interview_reminders set state='cancelled' where booking_id=b.id;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type,reason) values(a.id,auth.uid(),case when owner then 'candidate' else 'human' end,'interview_'||p_action,p_reason);perform kerja_private.m8_notify(a.id,'interview_'||p_action);return to_jsonb(b);end; $$;
create function kerja_private.m8_cancel_application() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.status is distinct from old.status and new.status not in ('interview_ready','shortlisted') then
  perform 1 from kerja_private.interview_calendar_lock where id for update;
  update kerja_private.interview_bookings set state='cancelled',revision=revision+1,updated_at=now() where application_id=new.id and state in ('proposed','confirmed');
  update kerja_private.interview_reminders set state='cancelled' where booking_id in(select id from kerja_private.interview_bookings where application_id=new.id);
 end if;return new;end; $$;
create trigger m8_cancel_on_application after update of status on public.m1_applications for each row execute function kerja_private.m8_cancel_application();
create function kerja_private.m8_score(p_booking uuid,p_version integer,p_scores jsonb,p_notes text) returns void language plpgsql security definer set search_path='' as $$ declare b kerja_private.interview_bookings;s kerja_private.interview_slots;a public.m1_applications;begin
 select application_row.* into a from public.m1_applications application_row join kerja_private.interview_bookings x on x.application_id=application_row.id where x.id=p_booking;
 perform 1 from public.m1_jobs where id=a.job_id for update;select * into a from public.m1_applications where id=a.id for update;perform 1 from kerja_private.interview_calendar_lock where id for update;
 select * into b from kerja_private.interview_bookings where id=p_booking for update;select * into s from kerja_private.interview_slots where id=b.slot_id;
 if not kerja_private.active_auth_session() or auth.jwt()->>'aal' is distinct from 'aal2' or auth.uid() is distinct from s.interviewer_id or not kerja_private.m8_interviewer(s.job_id,auth.uid()) then raise insufficient_privilege;end if;
 if b.state<>'confirmed' or b.revision is distinct from p_version or s.ends_at>now() or not kerja_private.m8_requirements(a.id) then raise check_violation;end if;
 if length(trim(coalesce(p_notes,'')))<10 then raise check_violation;end if;
 if p_scores is null or jsonb_typeof(p_scores)<>'object' or (select count(*) from jsonb_object_keys(p_scores))<>3 or not p_scores ?& array['skills','communication','reasoning'] or exists(select 1 from jsonb_each(p_scores) x where jsonb_typeof(x.value)<>'number' or x.value::text !~ '^[0-5]$') then raise check_violation;end if;
 insert into kerja_private.interview_scorecards values(b.id,auth.uid(),p_scores,p_notes,now());update kerja_private.interview_bookings set state='completed',revision=revision+1,updated_at=now() where id=b.id;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type,reason) values(a.id,auth.uid(),'human','interview_scorecard','Human interviewer submitted a scorecard');end; $$;
create function kerja_private.m8_outcome(p_app uuid,p_version integer,p_outcome text,p_reason text,p_attested boolean) returns jsonb language plpgsql security definer set search_path='' as $$ declare a public.m1_applications;begin
 perform 1 from public.m1_jobs where id=(select job_id from public.m1_applications where id=p_app) for update;select * into a from public.m1_applications where id=p_app for update;
 if not kerja_private.m4_staff(a.job_id) or p_attested is distinct from true then raise insufficient_privilege;end if;
 if a.version is distinct from p_version or not kerja_private.m8_requirements(a.id) or not exists(select 1 from kerja_private.interview_bookings b join kerja_private.interview_scorecards c on c.booking_id=b.id where b.application_id=a.id and b.state='completed') or length(trim(coalesce(p_reason,''))) not between 15 and 1000 or p_outcome is null or p_outcome not in ('offer','hired','not_selected') then raise check_violation;end if;
 if a.final_outcome in ('hired','not_selected') or (p_outcome='hired' and (a.final_outcome<>'offer' or a.offer_accepted_at is null)) or (p_outcome='offer' and a.final_outcome<>'pending') then raise check_violation;end if;
 update public.m1_applications set final_outcome=p_outcome,status=case p_outcome when 'hired' then 'hired' when 'not_selected' then 'rejected' else status end,version=version+1,next_action=case when p_outcome='offer' then 'review_human_offer' else 'none' end where id=a.id;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type,reason) values(a.id,auth.uid(),'human','final_'||p_outcome,p_reason);perform kerja_private.m8_notify(a.id,'final_'||p_outcome);return jsonb_build_object('outcome',p_outcome,'version',a.version+1);end; $$;
create function kerja_private.m8_accept_offer(p_app uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$ declare a public.m1_applications;begin
 perform 1 from public.m1_jobs where id=(select job_id from public.m1_applications where id=p_app) for update;select * into a from public.m1_applications where id=p_app for update;
 if not kerja_private.active_auth_session() or a.candidate_id is distinct from auth.uid() then raise insufficient_privilege;end if;
 if a.version is distinct from p_version or a.final_outcome<>'offer' or a.offer_accepted_at is not null or not kerja_private.m8_requirements(a.id) then raise check_violation;end if;
 update public.m1_applications set offer_accepted_at=now(),version=version+1,next_action='await_human_hire' where id=a.id;
 insert into public.m1_application_events(application_id,actor_id,actor_type,event_type,reason) values(a.id,auth.uid(),'candidate','offer_accepted','Candidate accepted the human offer');end; $$;

alter table kerja_private.chat_metadata drop constraint chat_metadata_tool_check;
alter table kerja_private.chat_metadata add constraint chat_metadata_tool_check check(tool in ('candidate_applications','candidate_progress','staff_jobs','staff_summary','faq','unsupported','denied','my_interviews'));
create function kerja_private.m8_can_view(p_booking uuid) returns boolean language sql stable security definer set search_path='' as $$ select kerja_private.active_auth_session() and exists(select 1 from kerja_private.interview_bookings b join kerja_private.interview_slots s on s.id=b.slot_id join public.m1_applications a on a.id=b.application_id where b.id=p_booking and (a.candidate_id=auth.uid() or kerja_private.m4_staff(a.job_id) or (auth.jwt()->>'aal'='aal2' and s.interviewer_id=auth.uid() and kerja_private.m8_interviewer(s.job_id,auth.uid())))); $$;
create function kerja_private.m8_booking(p_booking uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare result jsonb;begin
 if not kerja_private.m8_can_view(p_booking) then raise insufficient_privilege;end if;
 select to_jsonb(b)||jsonb_build_object('slot',to_jsonb(s),'title',j.title,'candidate_id',a.candidate_id,'interviewer_name',coalesce(nullif(p.display_name,''),'Assigned interviewer'),'scorecard_submitted',c.booking_id is not null,'gates_current',kerja_private.m8_requirements(a.id),'scorecard',case when a.candidate_id<>auth.uid() then to_jsonb(c) else null end) into result from kerja_private.interview_bookings b join kerja_private.interview_slots s on s.id=b.slot_id join public.m1_applications a on a.id=b.application_id join public.m1_jobs j on j.id=a.job_id left join public.m1_profiles p on p.id=s.interviewer_id left join kerja_private.interview_scorecards c on c.booking_id=b.id where b.id=p_booking;
 return result;end; $$;
create function kerja_private.m8_context(p_staff boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare apps jsonb;slots jsonb;bookings jsonb;people jsonb;begin
 if not kerja_private.active_auth_session() or p_staff is null then raise insufficient_privilege;end if;
 if p_staff and auth.jwt()->>'aal' is distinct from 'aal2' then raise insufficient_privilege;end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into apps from (select a.id,a.job_id,j.title,a.status,a.stage,a.version,a.final_outcome,a.offer_accepted_at from public.m1_applications a join public.m1_jobs j on j.id=a.job_id where a.stage='P6' and case when p_staff then kerja_private.m4_staff(a.job_id) else a.candidate_id=auth.uid() end order by a.created_at desc limit 50) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into slots from (select s.*,j.title from kerja_private.interview_slots s join public.m1_jobs j on j.id=s.job_id where s.starts_at>now() and not s.cancelled and kerja_private.m8_interviewer(s.job_id,s.interviewer_id) and (case when p_staff then kerja_private.m4_staff(s.job_id) else exists(select 1 from public.m1_applications a where a.candidate_id=auth.uid() and a.job_id=s.job_id and kerja_private.m8_requirements(a.id)) end) and not exists(select 1 from kerja_private.interview_bookings b where b.slot_id=s.id and b.state<>'cancelled') order by s.starts_at limit 100) x;
 select coalesce(jsonb_agg(kerja_private.m8_booking(x.id)),'[]') into bookings from (select b.id from kerja_private.interview_bookings b join kerja_private.interview_slots s on s.id=b.slot_id join public.m1_applications a on a.id=b.application_id where kerja_private.m8_can_view(b.id) and case when p_staff then (kerja_private.m4_staff(a.job_id) or s.interviewer_id=auth.uid()) else a.candidate_id=auth.uid() end order by b.updated_at desc limit 100) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into people from (select a.job_id,a.user_id as id,coalesce(nullif(p.display_name,''),'Assigned interviewer') as name from public.m1_job_assignments a left join public.m1_profiles p on p.id=a.user_id where p_staff and kerja_private.m4_staff(a.job_id) and kerja_private.m8_interviewer(a.job_id,a.user_id) limit 100) x;
 return jsonb_build_object('applications',apps,'slots',slots,'bookings',bookings,'interviewers',people,'email_delivery','disabled');end; $$;
create function kerja_private.m8_reminders() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if not kerja_private.active_auth_session() then raise insufficient_privilege;end if;
 insert into kerja_private.interview_reminders(booking_id,revision,recipient_id) select b.id,b.revision,auth.uid() from kerja_private.interview_bookings b join kerja_private.interview_slots s on s.id=b.slot_id where b.state='confirmed' and s.starts_at>now() and s.starts_at<=now()+interval '24 hours' and kerja_private.m8_can_view(b.id) and kerja_private.m8_requirements(b.application_id) on conflict do nothing;
 return (select coalesce(jsonb_agg(jsonb_build_object('booking_id',r.booking_id,'revision',r.revision,'state',r.state,'starts_at',s.starts_at)),'[]') from kerja_private.interview_reminders r join kerja_private.interview_bookings b on b.id=r.booking_id join kerja_private.interview_slots s on s.id=b.slot_id where r.recipient_id=auth.uid() and r.state='due' and r.revision=b.revision and b.state='confirmed' and s.starts_at>now() and kerja_private.m8_can_view(b.id) and kerja_private.m8_requirements(b.application_id));end; $$;
create function kerja_private.m8_cancel_slot(p_slot uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$ declare s kerja_private.interview_slots;b kerja_private.interview_bookings;begin
 select * into s from kerja_private.interview_slots where id=p_slot;perform 1 from public.m1_jobs where id=s.job_id for update;
 if not kerja_private.m4_staff(s.job_id) or length(trim(coalesce(p_reason,'')))<5 then raise insufficient_privilege;end if;
 -- Job lock is also held by booking/transition actions; no reverse app/calendar locks.
 perform 1 from public.m1_applications where job_id=s.job_id order by id for update;perform 1 from kerja_private.interview_calendar_lock where id for update;
 if exists(select 1 from kerja_private.interview_bookings where slot_id=p_slot and state='completed') then raise check_violation;end if;
 update kerja_private.interview_slots set cancelled=true where id=p_slot;
 for b in select * from kerja_private.interview_bookings where slot_id=p_slot and state in ('proposed','confirmed') loop
  update kerja_private.interview_bookings set state='cancelled',revision=revision+1,reason=p_reason,updated_at=now() where id=b.id;
  update kerja_private.interview_reminders set state='cancelled' where booking_id=b.id;perform kerja_private.m8_notify(b.application_id,'interview_cancel');
  insert into public.m1_application_events(application_id,actor_id,actor_type,event_type,reason) values(b.application_id,auth.uid(),'human','interview_cancel',p_reason);
 end loop;end; $$;
revoke all on function kerja_private.m8_interviewer(uuid,uuid) from public,anon,authenticated;
revoke all on function kerja_private.m8_requirements(uuid) from public,anon,authenticated;
revoke all on function kerja_private.m8_slot_guard() from public,anon,authenticated;
revoke all on function kerja_private.m8_notify(uuid,text) from public,anon,authenticated;
revoke all on function kerja_private.m8_can_view(uuid) from public,anon,authenticated;
revoke all on function kerja_private.m8_cancel_application() from public,anon,authenticated;
revoke all on function kerja_private.m8_slot(uuid,uuid,timestamptz,timestamptz,text,text,text) from public,anon;
grant execute on function kerja_private.m8_slot(uuid,uuid,timestamptz,timestamptz,text,text,text) to authenticated;
create function public.m8_slot(p_job uuid,p_interviewer uuid,p_start timestamptz,p_end timestamptz,p_timezone text,p_mode text,p_location text) returns uuid language sql security invoker set search_path='' as $$ select kerja_private.m8_slot(p_job,p_interviewer,p_start,p_end,p_timezone,p_mode,p_location); $$;
revoke all on function public.m8_slot(uuid,uuid,timestamptz,timestamptz,text,text,text) from public,anon;
grant execute on function public.m8_slot(uuid,uuid,timestamptz,timestamptz,text,text,text) to authenticated;
revoke all on function kerja_private.m8_book(uuid,uuid,text) from public,anon;
grant execute on function kerja_private.m8_book(uuid,uuid,text) to authenticated;
create function public.m8_book(p_app uuid,p_slot uuid,p_reason text) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m8_book(p_app,p_slot,p_reason); $$;
revoke all on function public.m8_book(uuid,uuid,text) from public,anon;
grant execute on function public.m8_book(uuid,uuid,text) to authenticated;
revoke all on function kerja_private.m8_change(uuid,integer,text,uuid,text) from public,anon;
grant execute on function kerja_private.m8_change(uuid,integer,text,uuid,text) to authenticated;
create function public.m8_change(p_booking uuid,p_version integer,p_action text,p_slot uuid,p_reason text) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m8_change(p_booking,p_version,p_action,p_slot,p_reason); $$;
revoke all on function public.m8_change(uuid,integer,text,uuid,text) from public,anon;
grant execute on function public.m8_change(uuid,integer,text,uuid,text) to authenticated;
revoke all on function kerja_private.m8_score(uuid,integer,jsonb,text) from public,anon;
grant execute on function kerja_private.m8_score(uuid,integer,jsonb,text) to authenticated;
create function public.m8_score(p_booking uuid,p_version integer,p_scores jsonb,p_notes text) returns void language sql security invoker set search_path='' as $$ select kerja_private.m8_score(p_booking,p_version,p_scores,p_notes); $$;
revoke all on function public.m8_score(uuid,integer,jsonb,text) from public,anon;
grant execute on function public.m8_score(uuid,integer,jsonb,text) to authenticated;
revoke all on function kerja_private.m8_outcome(uuid,integer,text,text,boolean) from public,anon;
grant execute on function kerja_private.m8_outcome(uuid,integer,text,text,boolean) to authenticated;
create function public.m8_outcome(p_app uuid,p_version integer,p_outcome text,p_reason text,p_attested boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m8_outcome(p_app,p_version,p_outcome,p_reason,p_attested); $$;
revoke all on function public.m8_outcome(uuid,integer,text,text,boolean) from public,anon;
grant execute on function public.m8_outcome(uuid,integer,text,text,boolean) to authenticated;
revoke all on function kerja_private.m8_accept_offer(uuid,integer) from public,anon;
grant execute on function kerja_private.m8_accept_offer(uuid,integer) to authenticated;
create function public.m8_accept_offer(p_app uuid,p_version integer) returns void language sql security invoker set search_path='' as $$ select kerja_private.m8_accept_offer(p_app,p_version); $$;
revoke all on function public.m8_accept_offer(uuid,integer) from public,anon;
grant execute on function public.m8_accept_offer(uuid,integer) to authenticated;
revoke all on function kerja_private.m8_booking(uuid) from public,anon;
grant execute on function kerja_private.m8_booking(uuid) to authenticated;
create function public.m8_booking(p_booking uuid) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m8_booking(p_booking); $$;
revoke all on function public.m8_booking(uuid) from public,anon;
grant execute on function public.m8_booking(uuid) to authenticated;
revoke all on function kerja_private.m8_context(boolean) from public,anon;
grant execute on function kerja_private.m8_context(boolean) to authenticated;
create function public.m8_context(p_staff boolean) returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m8_context(p_staff); $$;
revoke all on function public.m8_context(boolean) from public,anon;
grant execute on function public.m8_context(boolean) to authenticated;
revoke all on function kerja_private.m8_reminders() from public,anon;
grant execute on function kerja_private.m8_reminders() to authenticated;
create function public.m8_reminders() returns jsonb language sql security invoker set search_path='' as $$ select kerja_private.m8_reminders(); $$;
revoke all on function public.m8_reminders() from public,anon;
grant execute on function public.m8_reminders() to authenticated;
revoke all on function kerja_private.m8_cancel_slot(uuid,text) from public,anon;
grant execute on function kerja_private.m8_cancel_slot(uuid,text) to authenticated;
create function public.m8_cancel_slot(p_slot uuid,p_reason text) returns void language sql security invoker set search_path='' as $$ select kerja_private.m8_cancel_slot(p_slot,p_reason); $$;
revoke all on function public.m8_cancel_slot(uuid,text) from public,anon;
grant execute on function public.m8_cancel_slot(uuid,text) to authenticated;
commit;
