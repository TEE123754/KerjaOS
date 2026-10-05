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
await db.exec(await readFile('supabase/migrations/20261002103658_m2_application_pipeline.sql','utf8'));
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
let checks=0;
const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
async function actor(id,session,aal='aal1'){
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session,aal,user_metadata:{role:'admin'}})]);await db.exec('set role authenticated');
}
async function denied(sql,params=[]){let failure=false;try{await db.query(sql,params);}catch{failure=true;}assert.ok(failure);checks++;}
async function move(app,action,version,reason='Human reviewed submission',key=crypto.randomUUID(),evidence=[app]){
 return (await db.query('select public.m2_transition($1,$2,$3,$4,$5,$6::jsonb) result',[app,action,version,key,reason,JSON.stringify(evidence)])).rows[0].result;
}
async function noMove(app,action,version,key=crypto.randomUUID(),evidence=[app]){
 await denied('select public.m2_transition($1,$2,$3,$4,$5,$6::jsonb)',[app,action,version,key,'Human reviewed submission',JSON.stringify(evidence)]);
}
await actor(A,S1);await db.query('select public.m1_bootstrap_profile()');
const AX=(await db.query('select public.m1_submit_application($1,$2) result',[X,crypto.randomUUID()])).rows[0].result;
const AY=(await db.query('select public.m1_submit_application($1,$2) result',[Y,crypto.randomUUID()])).rows[0].result;
await actor(B,S2);await db.query('select public.m1_bootstrap_profile()');
const BX=(await db.query('select public.m1_submit_application($1,$2) result',[X,crypto.randomUUID()])).rows[0].result;
eq(new Set([AX.id,AY.id,BX.id]).size,3);
eq((await db.query('select id from public.m1_applications')).rows.length,1);
await noMove(AX.id,'advance',0);await noMove(BX.id,'shortlist',0);
const withdrawalKey=crypto.randomUUID();
eq((await move(BX.id,'withdraw',0,'Candidate withdraws voluntarily',withdrawalKey,[])).status,'withdrawn');
eq((await move(BX.id,'withdraw',0,'Candidate withdraws voluntarily',withdrawalKey,[])).version,1);
await noMove(BX.id,'reopen',1);
await db.exec('reset role');const HS=crypto.randomUUID();await db.query('insert into auth.sessions values($1,$2)',[HS,HM]);
await actor(HM,HS);await noMove(AX.id,'advance',0);
await actor(HM,HS,'aal2');
eq((await db.query('select id from public.m2_staff_queue()')).rows.length,2);
await noMove(AY.id,'advance',0);await noMove(AX.id,'shortlist',0);await noMove(AX.id,'skip',0);
eq((await move(BX.id,'reopen',1)).status,'applied');
const key=crypto.randomUUID();eq((await move(AX.id,'advance',0,'Human reviewed submission',key)).stage,'P1');
eq((await move(AX.id,'advance',0,'Human reviewed submission',key)).version,1);
await noMove(AX.id,'pause',1,key);await noMove(AX.id,'advance',0);await noMove(AX.id,'advance',1); // no resume
eq((await move(BX.id,'pause',2)).status,'on_hold');await noMove(BX.id,'advance',3);
eq((await move(BX.id,'resume',3)).status,'applied');
eq((await db.query('select next_action from public.m1_applications where id=$1',[BX.id])).rows[0].next_action,'await_resume_review');
// Burst callers with the same expected version: only one commits.
const burst=await Promise.allSettled([move(BX.id,'advance',4),move(BX.id,'advance',4)]);
eq(burst.filter(r=>r.status==='fulfilled').length,1);
await db.exec('reset role');const DOC=crypto.randomUUID();
await db.query("insert into kerja_private.documents(id,owner_id,application_id,object_key,state,expires_at) values($1,$2,$3,'synthetic-fixture.enc','ready',now()+interval '1 day')",[DOC,A,AX.id]);
await actor(HM,HS,'aal2');eq((await move(AX.id,'advance',1)).stage,'P2');
eq((await db.query('select resume_snapshot_id from public.m1_applications where id=$1',[AX.id])).rows[0].resume_snapshot_id,DOC);
await noMove(AX.id,'advance',2);await noMove(AX.id,'shortlist',2);
await db.exec('reset role');
const IC=crypto.randomUUID(),IE=crypto.randomUUID(),QE=crypto.randomUUID();
await db.query("insert into kerja_private.consents(id,candidate_id,employer_id,purpose,version,text_hash) values($1,$2,$3,'identity','fixture-v1','synthetic-only')",[IC,A,E]);
await db.query("insert into kerja_private.pipeline_evidence(id,application_id,kind,outcome,method,reviewer_id,consent_id,expires_at,reason) values($1,$2,'identity','satisfied','mock',$3,$4,now()+interval '1 day','Labelled synthetic gate evidence')",[IE,AX.id,HM,IC]);
await db.query('update public.m1_jobs set policy=$1 where id=$2',[JSON.stringify({version:2,required_identity:false,required_quiz:false}),X]);
await actor(HM,HS,'aal2');
eq((await db.query('select policy_snapshot from public.m1_applications where id=$1',[AX.id])).rows[0].policy_snapshot.required_identity,true);
eq((await move(AX.id,'advance',2)).stage,'P3');await noMove(AX.id,'advance',3);
await db.exec('reset role');
await db.query("insert into kerja_private.pipeline_evidence(id,application_id,kind,outcome,method,reviewer_id,expires_at,reason) values($1,$2,'quiz','satisfied','mock',$3,now()+interval '1 day','Labelled synthetic quiz review')",[QE,AX.id,HM]);
await actor(HM,HS,'aal2');eq((await move(AX.id,'advance',3)).stage,'P4');eq((await move(AX.id,'advance',4)).stage,'P5');
await db.exec('reset role');await db.query('update kerja_private.consents set revoked_at=now() where id=$1',[IC]);
await actor(HM,HS,'aal2');await noMove(AX.id,'shortlist',5);
await db.exec('reset role');await db.query('update kerja_private.consents set revoked_at=null where id=$1',[IC]);
await db.query("update kerja_private.pipeline_evidence set expires_at=now()-interval '1 second' where id=$1",[QE]);
await actor(HM,HS,'aal2');await noMove(AX.id,'shortlist',5);
await db.exec('reset role');await db.query("update kerja_private.pipeline_evidence set expires_at=now()+interval '1 day' where id=$1",[QE]);
await actor(HM,HS,'aal2');eq((await move(AX.id,'shortlist',5)).status,'shortlisted');
await db.exec('reset role');await db.query('update kerja_private.consents set revoked_at=now() where id=$1',[IC]);
await actor(HM,HS,'aal2');await noMove(AX.id,'interview_entry',6);
await db.exec('reset role');await db.query('update kerja_private.consents set revoked_at=null where id=$1',[IC]);await actor(HM,HS,'aal2');
eq((await move(AX.id,'interview_entry',6)).status,'interview_ready');
await noMove(BX.id,'interview_entry',5);
eq((await move(AX.id,'note',7,'PRIVATE ONLY - reviewer discussion')).version,8);
eq((await db.query('select note from public.m2_staff_notes($1)',[AX.id])).rows[0].note,'PRIVATE ONLY - reviewer discussion');
await actor(A,S1);
eq((await db.query('select note from public.m2_staff_notes($1)',[AX.id])).rows.length,0);
eq((await db.query("select reason from public.m1_application_events where application_id=$1 and event_type='note'",[AX.id])).rows[0].reason,'Internal review note recorded');
await denied('select * from kerja_private.pipeline_notes');
eq((await move(AY.id,'withdraw',0,'Candidate withdraws voluntarily',crypto.randomUUID(),[])).status,'withdrawn');
await db.exec('reset role');await db.query('insert into public.m1_job_assignments values($1,$2)',[HM,Y]);
await actor(HM,HS,'aal2');eq((await move(AY.id,'reopen',1)).stage,'P0');
const closeKey=crypto.randomUUID();
const closed=(await db.query('select public.m2_close_job($1,$2,$3) result',[X,closeKey,'Hiring closed after review'])).rows[0].result;
eq(closed.closed_applications,2);
eq((await db.query('select public.m2_close_job($1,$2,$3) result',[X,closeKey,'Hiring closed after review'])).rows[0].result,closed);
await noMove(AX.id,'interview_entry',9);await noMove(BX.id,'advance',6);
await actor(B,S2);await denied('select public.m1_submit_application($1,$2)',[X,crypto.randomUUID()]);
eq((await db.query('select status from public.m1_applications where id=$1',[BX.id])).rows[0].status,'job_closed');
await actor(A,S1);eq((await db.query('select stage from public.m1_applications where id=$1',[AY.id])).rows[0].stage,'P0');
await db.exec('reset role');
eq((await db.query("select count(*)::int n from public.m1_application_events where application_id=$1 and event_type='shortlist'",[AX.id])).rows[0].n,1);
eq((await db.query("select count(*)::int n from public.m1_outbox where application_id=$1 and event_type='shortlist'",[AX.id])).rows[0].n,1);
// Required unavailable background evidence and explicitly permitted admin exception.
const Z=crypto.randomUUID();
await db.query('insert into public.m1_jobs(id,employer_id,title,published,policy) values($1,$2,$3,true,$4::jsonb)',[Z,E,'Synthetic exception role',JSON.stringify({version:1,demo_only:false,required_identity:false,required_quiz:false,background_checks:['credit'],allowed_skips:['P1'],allowed_exceptions:['credit'],consent_versions:{credit:'current'},stage_days:7})]);
await db.query('insert into public.m1_job_assignments values($1,$2)',[HM,Z]);
await actor(A,S1);const AZ=(await db.query('select public.m1_submit_application($1,$2) result',[Z,crypto.randomUUID()])).rows[0].result;
await actor(HM,HS,'aal2');await move(AZ.id,'advance',0);eq((await move(AZ.id,'skip',1)).stage,'P2');await move(AZ.id,'advance',2);await move(AZ.id,'advance',3);await noMove(AZ.id,'advance',4);
await db.exec('reset role');const CC=crypto.randomUUID(),CE=crypto.randomUUID();
await db.query("insert into kerja_private.consents(id,candidate_id,employer_id,purpose,version,text_hash) values($1,$2,$3,'credit','old','fixture')",[CC,A,E]);
await db.query("insert into kerja_private.pipeline_evidence(id,application_id,kind,outcome,method,reviewer_id,consent_id,expires_at,reason) values($1,$2,'credit','exception','mock',$3,$4,now()+interval '1 day','Explicit synthetic exception')",[CE,AZ.id,HM,CC]);
await actor(HM,HS,'aal2');await noMove(AZ.id,'advance',4);
await db.exec('reset role');await db.query("update public.m1_memberships set role='admin' where user_id=$1 and employer_id=$2",[HM,E]);await db.query("update kerja_private.consents set version='current' where id=$1",[CC]);
await actor(HM,HS,'aal2');await noMove(AZ.id,'advance',4); // mock cannot qualify a non-demo policy
await db.exec('reset role');await db.query("update kerja_private.pipeline_evidence set method='manual' where id=$1",[CE]);
await actor(HM,HS,'aal2');eq((await move(AZ.id,'advance',4)).stage,'P5');eq((await move(AZ.id,'shortlist',5)).status,'shortlisted');
await db.close();console.log(`M2 SQL gate: ${checks} PostgreSQL assertions passed (synthetic, burst checks serialized by PGlite)`);
