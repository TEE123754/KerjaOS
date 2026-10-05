// Offline PostgreSQL engine: real SQL/RLS semantics, synthetic Supabase schemas.
// This does not substitute for hosted Supabase/Storage/Auth/deployment checks.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 grant usage on schema auth to authenticated,anon;
 grant execute on function auth.uid(),auth.jwt() to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table public.candidates(email text primary key); grant all on public.candidates to anon,authenticated;
`);
const migration = await readFile('supabase/migrations/20261002060758_m1_secure_foundation.sql','utf8');
// gen_random_uuid is built-in. Hosted Supabase provides pgcrypto; the WASM
// fixture does not install that optional extension and uses no pgcrypto function.
await db.exec(migration.replace('create extension if not exists pgcrypto;',''));
const ids = Array.from({length: 9}, (_,i) => `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const [A,B,HM,OTHER,E,X,Y,S1,S2] = ids;
await db.exec(`insert into auth.users(id,email,email_confirmed_at) values
 ('${A}','a@example.test',now()),('${B}','b@example.test',now()),('${HM}','hm@example.test',now()),('${OTHER}','other@example.test',now());
 insert into auth.sessions values('${S1}','${A}'),('${S2}','${B}');
 insert into public.m1_employers values('${E}','Synthetic employer');
 insert into public.m1_jobs(id,employer_id,title,published) values('${X}','${E}','Role X',true),('${Y}','${E}','Role Y',true);
 insert into public.m1_memberships values('${HM}','${E}','hm',true);
 insert into public.m1_job_assignments values('${HM}','${X}');
`);
let checks = 0;
async function actor(id,session,aal='aal1') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:id, session_id:session, aal, user_metadata:{role:'admin'}})]);
  await db.exec('set role authenticated');
}
async function denied(sql,params=[]) {
  let blocked=false;
  try { await db.query(sql,params); } catch { blocked=true; }
  assert.ok(blocked); checks++;
}
await actor(A,S1); await db.query('select public.m1_bootstrap_profile()');
const aX=(await db.query('select public.m1_submit_application($1,$2) as result',[X,crypto.randomUUID()])).rows[0].result;
const retryKey=crypto.randomUUID();
const aY=(await db.query('select public.m1_submit_application($1,$2) as result',[Y,retryKey])).rows[0].result;
const replay=(await db.query('select public.m1_submit_application($1,$2) as result',[Y,retryKey])).rows[0].result;
assert.equal(aY.id,replay.id); checks++;
await denied('select public.m1_submit_application($1,$2)',[X,retryKey]);
await denied('select public.m1_submit_application($1,$2)',[X,crypto.randomUUID()]);
assert.equal((await db.query('select id from public.m1_applications')).rows.length,2); checks++;
await denied("update public.m1_applications set candidate_id=$1",[B]);
await denied('select * from public.candidates');
await denied('select * from kerja_private.sessions');
await denied('select public.m1_session_read($1)',['fake']);
await denied('select public.m1_human_decision($1,$2,$3,$4,$5)',[aX.id,'rejected','Candidate cannot decide',0,crypto.randomUUID()]);
await actor(B,S2); await db.query('select public.m1_bootstrap_profile()');
const bX=(await db.query('select public.m1_submit_application($1,$2) as result',[X,crypto.randomUUID()])).rows[0].result;
assert.equal(new Set([aX.id,aY.id,bX.id]).size,3); checks++;
assert.equal((await db.query('select id from public.m1_applications')).rows.length,1); checks++;
assert.equal((await db.query('select id from public.m1_applications where id=$1',[aX.id])).rows.length,0); checks++;
await db.exec('reset role');
const hmSession=crypto.randomUUID();
await db.query('insert into auth.sessions values($1,$2)',[hmSession,HM]);
await actor(HM,hmSession,'aal1');
assert.equal((await db.query('select id from public.m1_applications')).rows.length,0); checks++;
await denied('select public.m1_human_decision($1,$2,$3,$4,$5)',[aX.id,'rejected','Reviewed by HM',0,crypto.randomUUID()]);
await actor(HM,hmSession,'aal2');
assert.equal((await db.query('select id from public.m1_applications')).rows.length,2); checks++;
await denied('select public.m1_human_decision($1,$2,$3,$4,$5)',[aY.id,'rejected','Wrong assignment',0,crypto.randomUUID()]);
await denied('select public.m1_human_decision($1,$2,$3,$4,$5)',[aX.id,'shortlisted','Missing prerequisites',0,crypto.randomUUID()]);
const decisionKey=crypto.randomUUID();
const decision=(await db.query('select public.m1_human_decision($1,$2,$3,$4,$5) as result',[aX.id,'rejected','Reviewed by HM',0,decisionKey])).rows[0].result;
assert.equal(decision.status,'rejected'); checks++;
const decisionReplay=(await db.query('select public.m1_human_decision($1,$2,$3,$4,$5) as result',[aX.id,'rejected','Reviewed by HM',0,decisionKey])).rows[0].result;
assert.equal(decisionReplay.version,1); checks++;
await db.exec('reset role');
assert.equal((await db.query("select id from public.m1_application_events where application_id=$1 and event_type='rejected'",[aX.id])).rows.length,1); checks++;
assert.equal((await db.query("select id from public.m1_outbox where application_id=$1 and event_type='rejected'",[aX.id])).rows.length,1); checks++;
await db.query('update public.m1_memberships set active=false where user_id=$1',[HM]);
await actor(HM,hmSession,'aal2');
assert.equal((await db.query('select id from public.m1_applications')).rows.length,0); checks++;
await db.exec('reset role'); await db.query('delete from auth.sessions where id=$1',[S2]);
await actor(B,S2); assert.equal((await db.query('select public.m1_auth_session_active() as active')).rows[0].active,false); checks++;
assert.equal((await db.query('select id from public.m1_applications')).rows.length,0); checks++;
assert.equal((await db.query('select id from public.m1_profiles')).rows.length,0); checks++;
assert.equal((await db.query('select id from public.m1_outbox')).rows.length,0); checks++;
await denied('select public.m1_submit_application($1,$2)',[Y,crypto.randomUUID()]);
await db.close();
console.log(`M1 SQL gate: ${checks} synthetic PostgreSQL/RLS assertions passed`);
