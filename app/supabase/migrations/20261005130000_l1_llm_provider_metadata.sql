-- Optional Morpheus wiring. Keeps the M6 policy, global quota and default OFF.
begin;
create function kerja_private.m6_begin_provider(p_scope text,p_external boolean,p_requested_model text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare event jsonb;
begin
 if p_requested_model is null or p_requested_model not in ('gpt-oss-120b','typesafe/jev-router') then raise check_violation; end if;
 -- Existing M6 function verifies session, staff MFA/role and reserves under lock.
 event:=kerja_private.m6_begin(p_scope,p_external);
 update kerja_private.chat_metadata
 set requested_model=case when p_external then p_requested_model else 'rules' end
 where id=(event->>'id')::uuid and actor_id=auth.uid();
 return event;
end; $$;
revoke all on function kerja_private.m6_begin_provider(text,boolean,text) from public,anon;
grant execute on function kerja_private.m6_begin_provider(text,boolean,text) to authenticated;
create function public.m6_begin_provider(p_scope text,p_external boolean,p_requested_model text)
returns jsonb language sql security invoker set search_path='' as $$
 select kerja_private.m6_begin_provider(p_scope,p_external,p_requested_model);
$$;
revoke all on function public.m6_begin_provider(text,boolean,text) from public,anon;
grant execute on function public.m6_begin_provider(text,boolean,text) to authenticated;
commit;
