// Offline PostgreSQL engine: real SQL/RLS semantics, synthetic Supabase schemas.
// This does not substitute for hosted Supabase/Storage/Auth/deployment checks.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
process.on('uncaughtException',e=>{console.error(e.message,e.code,e.where,e.internalQuery);process.exit(1);});
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
await db.exec(await readFile('supabase/migrations/20261002110620_m3_identity_review.sql','utf8'));
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
await db.exec(await readFile('supabase/migrations/20261002135810_m4_quiz_practice.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261002150000_m5_background_evidence.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261002160000_m6_scoped_chat.sql','utf8'));
let checks=0;
function eq(a,b){assert.deepEqual(a,b);checks++;}
const encode=v=>v!==null&&typeof v==='object'?JSON.stringify(v):v;
async function actor(id,session,aal='aal1'){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session,aal})]);await db.exec('set role authenticated');}
async function denied(sql,args=[]){let bad=false;try{await db.query(sql,args.map(encode));}catch{bad=true;}assert.ok(bad,sql);checks++;}
async function rpc(name,args=[]){return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args.map(encode))).rows[0].result;}
const HS=crypto.randomUUID(),OS=crypto.randomUUID();await db.query('insert into auth.sessions values($1,$2),($3,$4)',[HS,HM,OS,OTHER]);
await actor(A,S1);await rpc('m1_bootstrap_profile');const AX=await rpc('m1_submit_application',[X,crypto.randomUUID()]),AY=await rpc('m1_submit_application',[Y,crypto.randomUUID()]);
await actor(B,S2);await rpc('m1_bootstrap_profile');const BX=await rpc('m1_submit_application',[X,crypto.randomUUID()]);
await db.exec('reset role');
await db.exec(await readFile('supabase/migrations/20261005140000_l2_recruiter_parity.sql','utf8'));
await actor(A,S1);await denied('select public.m14_recruiter_context()');await denied('select public.m14_candidate_accounts()');
await actor(HM,HS);await denied('select public.m14_recruiter_context()');
await actor(HM,HS,'aal2');eq((await rpc('m14_recruiter_context')).jobs.length,1);eq((await rpc('m14_candidate_accounts')).length,2);
const data={employer_id:E,job_id:null,title:'Scoped new role',department:'Engineering',description:'Test role',requirements:['React'],published:true,opens_at:null,closes_at:null,expected_revision:0,idempotency_key:crypto.randomUUID()};
const created=await rpc('m14_job_save',[data]);eq(created.title,data.title);eq((await rpc('m14_job_save',[data])).id,created.id);
const updated=await rpc('m14_job_save',[{...data,job_id:created.id,title:'Updated role',idempotency_key:crypto.randomUUID()}]);eq(updated.revision,1);
await denied('select public.m14_job_save($1)',[{...data,job_id:created.id,expected_revision:0,idempotency_key:crypto.randomUUID()}]);
await denied('select public.m14_job_save($1)',[{...data,job_id:created.id,expected_revision:null,idempotency_key:crypto.randomUUID()}]);
await denied('select public.m14_job_save($1)',[{...data,job_id:Y,idempotency_key:crypto.randomUUID()}]);
await denied('select public.m14_job_save($1)',[{...data,opens_at:'2026-10-20',closes_at:'2026-10-19',idempotency_key:crypto.randomUUID()}]);
const future=await rpc('m14_job_save',[{...data,title:'Future role',opens_at:'2099-01-01',idempotency_key:crypto.randomUUID()}]);
const source=await rpc('m14_source_stage',[created.id,'encrypted-fixture']);eq(source.state,'staged');eq((await rpc('m14_sources')).length,1);
await actor(OTHER,OS,'aal2');await denied('select public.m14_job_save($1)',[data]);eq((await rpc('m14_sources')).length,0);
await actor(A,S1);await denied('select public.m1_submit_application($1,$2)',[future.id,crypto.randomUUID()]);await denied('select public.m14_source_stage($1,$2)',[created.id,'encrypted-fixture']);await denied('select * from kerja_private.recruiter_sources');await denied('select public.m14_source_cleanup()');
await db.exec('reset role');await db.query("update kerja_private.recruiter_sources set expires_at=now()-interval '1 second'");
await actor(HM,HS,'aal2');eq((await rpc('m14_sources')).length,0);
await db.exec('reset role');eq((await rpc('m14_source_cleanup')),1);
await db.exec('set role anon');const publicJobs=await rpc('m14_public_jobs');eq(publicJobs.some(j=>j.id===created.id),true);eq(publicJobs.some(j=>j.id===future.id),false);await denied('select public.m14_candidate_accounts()');await denied('select public.m14_sources()');
await db.exec('reset role');
await db.exec(await readFile('supabase/migrations/20261003100000_m8_human_interviews.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261006100000_u2_recruiter_dashboard.sql','utf8'));
await actor(A,S1);await denied('select public.m15_dashboard(0)');
await actor(HM,HS,'aal1');await denied('select public.m15_dashboard(0)');
await actor(HM,HS,'aal2');const dash=await rpc('m15_dashboard',[0]);eq(dash.total,2);eq(dash.applications.length,2);eq(dash.applications.every(a=>a.job_id===X),true);eq(dash.applications[0].screening_completed,false);eq((await rpc('m15_dashboard',[50])).applications.length,0);await denied('select public.m15_dashboard(-1)');
const application=dash.applications[0].id,doc=crypto.randomUUID();
await db.exec('reset role');await db.query("insert into kerja_private.documents(id,owner_id,application_id,object_key,state,expires_at) values($1,$2,$3,'fixture/resume.enc','quarantined',now()+interval '1 day')",[doc,(await db.query('select candidate_id from public.m1_applications where id=$1',[application])).rows[0].candidate_id,application]);
await actor(HM,HS,'aal2');eq((await rpc('m15_resume_context',[application])).document_id,doc);
await actor(OTHER,OS,'aal2');await denied('select public.m15_resume_context($1)',[application]);await denied('select public.m15_dashboard(0)');
await db.exec('reset role');await db.query("update kerja_private.documents set expires_at=now()-interval '1 second' where id=$1",[doc]);await actor(HM,HS,'aal2');eq(await rpc('m15_resume_context',[application]),null);
await db.exec('reset role');await db.exec('set role anon');await denied('select public.m15_dashboard(0)');await denied('select public.m15_resume_context($1)',[application]);
console.log(`Recruiter parity + overview PostgreSQL gate: ${checks} assertions passed`);await db.close();
