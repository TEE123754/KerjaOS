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
eq((await rpc('m6_candidate_applications')).length,1);await denied('select public.m6_candidate_progress($1)',[AX.id]);
eq((await rpc('m6_candidate_progress',[BX.id])).id,BX.id);
await denied('select public.m6_staff_summary($1)',[X]);await denied('select public.m6_begin($1,$2)',['staff',false]);
await actor(A,S1);eq((await rpc('m6_candidate_applications')).length,2);await denied('select public.m6_candidate_progress($1)',[BX.id]);
const progress=await rpc('m6_candidate_progress',[AY.id]);eq(progress.stage,'P0');eq(typeof progress.updated_at,'string');eq(Object.hasOwn(progress,'candidate_id'),false);eq(Object.hasOwn(progress,'policy_snapshot'),false);
await denied('select * from kerja_private.chat_metadata');await denied('update public.m1_applications set stage=$1 where id=$2',['P6',AX.id]);
await actor(HM,HS);await denied('select public.m6_staff_jobs()');await denied('select public.m6_staff_summary($1)',[X]);
await actor(HM,HS,'aal2');eq((await rpc('m6_staff_jobs')).map(j=>j.id),[X]);
eq((await rpc('m6_staff_summary',[X])).counts[0].count,2);await denied('select public.m6_staff_summary($1)',[Y]);
// Staff RLS access to applications does not confer candidate-tool access.
await denied('select public.m6_candidate_progress($1)',[AX.id]);eq((await rpc('m6_candidate_applications')).length,0);
await actor(OTHER,OS,'aal2');await denied('select public.m6_staff_summary($1)',[X]);
await actor(A,S1);let event=await rpc('m6_begin',['candidate',true]);eq(event.external_reserved,false);eq(event.fallback_warning,'external_disabled');
await denied('select public.m6_complete($1,$2,$3,$4,$5)',[event.id,'update_application_status',null,'rules','local']);
await denied('select public.m6_complete($1,$2,$3,$4,$5)',[event.id,'faq',null,'raw personal email@example.test','local']);
await actor(B,S2);await denied('select public.m6_complete($1,$2,$3,$4,$5)',[event.id,'faq',null,'rules','local']);
await actor(A,S1);await rpc('m6_complete',[event.id,'faq','external_disabled','rules','local']);
await denied('select public.m6_complete($1,$2,$3,$4,$5)',[event.id,'faq',null,'rules','local']);
await db.exec('reset role');await db.query('update kerja_private.chat_policy set external_enabled=true');
await actor(A,S1);event=await rpc('m6_begin',['candidate',true]);eq(event.fallback_warning,'privacy_unapproved');
await db.exec('reset role');await db.query('update kerja_private.chat_policy set privacy_approved=true,daily_external_limit=2');
await actor(A,S1);event=await rpc('m6_begin',['candidate',true]);eq(event.external_reserved,true);
await actor(B,S2);eq((await rpc('m6_begin',['candidate',true])).external_reserved,true);
await actor(A,S1);eq((await rpc('m6_begin',['candidate',true])).fallback_warning,'quota_exhausted');
await db.exec('reset role');eq((await db.query('select count(*)::integer n from kerja_private.chat_metadata where external_reserved')).rows[0].n,2);
const columns=(await db.query("select column_name from information_schema.columns where table_schema='kerja_private' and table_name='chat_metadata'")).rows.map(r=>r.column_name);
eq(columns.some(c=>['prompt','message','answer','resume','email','application_id'].includes(c)),false);
await db.query('update kerja_private.chat_metadata set expires_at=now()-interval \'1 second\'');
await actor(A,S1);await rpc('m6_begin',['candidate',false]);
await db.exec('reset role');eq((await db.query('select count(*)::integer n from kerja_private.chat_metadata')).rows[0].n,1);
await db.query("insert into kerja_private.chat_metadata(actor_id,scope) select $1,'candidate' from generate_series(1,99)",[A]);
await actor(A,S1);await denied('select public.m6_begin($1,$2)',['candidate',false]);
await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[S1]);
await actor(A,S1);eq((await rpc('m6_candidate_applications')).length,0);await denied('select public.m6_candidate_progress($1)',[AX.id]);await denied('select public.m6_begin($1,$2)',['candidate',false]);
await db.exec('reset role');await db.exec('set role anon');await denied('select public.m6_candidate_applications()');await denied('select public.m6_begin($1,$2)',['candidate',false]);
console.log(`M6 PostgreSQL gate: ${checks} assertions passed`);await db.close();
