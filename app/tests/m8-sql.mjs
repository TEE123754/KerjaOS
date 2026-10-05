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
await db.exec(await readFile('supabase/migrations/20261002170000_m7_job_discovery.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261003100000_m8_human_interviews.sql','utf8'));
let checks=0;
function eq(a,b){assert.deepEqual(a,b);checks++;}
const encode=v=>v!==null&&typeof v==='object'?JSON.stringify(v):v;
async function actor(id,session,aal='aal1'){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session,aal})]);await db.exec('set role authenticated');}
async function denied(sql,args=[]){let bad=false;try{await db.query(sql,args.map(encode));}catch{bad=true;}assert.ok(bad,sql);checks++;}
async function rpc(name,args=[]){return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args.map(encode))).rows[0].result;}
const HS=crypto.randomUUID(),OS=crypto.randomUUID();await db.query('insert into auth.sessions values($1,$2),($3,$4)',[HS,HM,OS,OTHER]);
await db.query("insert into public.m1_memberships values($1,$2,'reviewer',true)",[OTHER,E]);await db.query('insert into public.m1_job_assignments values($1,$2),($1,$3),($4,$3)',[OTHER,X,Y,HM]);
await actor(A,S1);await rpc('m1_bootstrap_profile');const AX=await rpc('m1_submit_application',[X,crypto.randomUUID()]),AY=await rpc('m1_submit_application',[Y,crypto.randomUUID()]);
await actor(B,S2);await rpc('m1_bootstrap_profile');const BX=await rpc('m1_submit_application',[X,crypto.randomUUID()]);
await db.exec('reset role');await db.query("update public.m1_applications set policy_snapshot=jsonb_build_object('demo_only',true,'required_identity',false,'required_quiz',false,'background_checks','[]'::jsonb) where id in ($1,$2,$3)",[AX.id,AY.id,BX.id]);
const start=new Date(Date.now()+3600000).toISOString(),end=new Date(Date.now()+7200000).toISOString(),later=new Date(Date.now()+10800000).toISOString(),laterEnd=new Date(Date.now()+14400000).toISOString();
const slotArgs=[X,HM,start,end,'Asia/Kuala_Lumpur','online','https://meet.example.test/room'];
await actor(A,S1);await denied('select public.m8_slot($1,$2,$3,$4,$5,$6,$7)',slotArgs);await denied('select * from kerja_private.interview_bookings');
await actor(HM,HS);await denied('select public.m8_slot($1,$2,$3,$4,$5,$6,$7)',slotArgs);
await actor(HM,HS,'aal2');const slot=await rpc('m8_slot',slotArgs);await denied('select public.m8_slot($1,$2,$3,$4,$5,$6,$7)',slotArgs);await denied('select public.m8_slot($1,$2,$3,$4,$5,$6,$7)',[...slotArgs.slice(0,4),'Bad/Timezone',...slotArgs.slice(5)]);
await denied('select public.m8_book($1,$2,$3)',[AX.id,slot,'Propose human interview']);
await db.exec('reset role');await db.query("update public.m1_applications set stage='P6',status='interview_ready' where id in ($1,$2,$3)",[AX.id,AY.id,BX.id]);
await actor(HM,HS,'aal2');const booked=await rpc('m8_book',[AX.id,slot,'Propose human interview']);eq(booked.revision,0);
await denied('select public.m8_book($1,$2,$3)',[BX.id,slot,'Conflicting second candidate']);
const alternate=await rpc('m8_slot',[X,HM,later,laterEnd,'Asia/Kuala_Lumpur','physical','Office interview room']);const crossSlot=await rpc('m8_slot',[Y,OTHER,start,end,'UTC','physical','Second job room']);
await denied('select public.m8_book($1,$2,$3)',[AY.id,crossSlot,'Candidate conflict across jobs']);
await actor(B,S2);await denied('select public.m8_booking($1)',[booked.id]);await denied('select public.m8_change($1,$2,$3,$4,$5)',[booked.id,0,'confirm',null,'I confirm this slot']);
await actor(A,S1);eq((await rpc('m8_context',[false])).bookings.length,1);eq((await rpc('m8_booking',[booked.id])).scorecard,null);
await denied('select public.m8_change($1,$2,$3,$4,$5)',[booked.id,5,'confirm',null,'Stale invite']);
eq((await rpc('m8_change',[booked.id,0,'confirm',null,'I confirm this slot'])).revision,1);eq((await rpc('m8_reminders')).length,1);eq((await rpc('m8_reminders')).length,1);
eq((await rpc('m8_change',[booked.id,1,'reschedule',alternate,'I request the alternate slot'])).state,'proposed');eq((await rpc('m8_reminders')).length,0);eq((await rpc('m8_change',[booked.id,2,'confirm',null,'I confirm the alternate slot'])).revision,3);
await actor(HM,HS,'aal2');await denied('select public.m8_score($1,$2,$3,$4)',[booked.id,3,{skills:3,communication:3,reasoning:3},'Human reviewed notes']);await denied('select public.m8_outcome($1,$2,$3,$4,$5)',[AX.id,0,'hired','Human final review reason',true]);
// End the synthetic interview in fixture time; real clients cannot edit slots directly.
await db.exec('reset role');await db.query("update kerja_private.interview_slots set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",[alternate]);
await actor(OTHER,OS,'aal2');await denied('select public.m8_score($1,$2,$3,$4)',[booked.id,3,{skills:3,communication:3,reasoning:3},'Wrong interviewer notes']);
await actor(HM,HS,'aal2');await denied('select public.m8_score($1,$2,$3,$4)',[booked.id,3,{skills:6,communication:3,reasoning:3},'Human reviewed notes']);await rpc('m8_score',[booked.id,3,{skills:4,communication:3,reasoning:5},'Human interviewer rationale']);eq((await rpc('m8_booking',[booked.id])).state,'completed');
await actor(A,S1);eq((await rpc('m8_booking',[booked.id])).scorecard,null);await denied('select public.m8_outcome($1,$2,$3,$4,$5)',[AX.id,0,'offer','Human final review reason',true]);
await actor(HM,HS,'aal2');await denied('select public.m8_outcome($1,$2,$3,$4,$5)',[AX.id,0,'offer','Human final review reason',false]);eq((await rpc('m8_outcome',[AX.id,0,'offer','Human final review and offer reason',true])).outcome,'offer');await denied('select public.m8_outcome($1,$2,$3,$4,$5)',[AX.id,1,'hired','Human final hire review reason',true]);
await actor(B,S2);await denied('select public.m8_accept_offer($1,$2)',[AX.id,1]);await actor(A,S1);await rpc('m8_accept_offer',[AX.id,1]);eq((await rpc('m8_context',[false])).applications.find(a=>a.id===AX.id).final_outcome,'offer');
await actor(HM,HS,'aal2');eq((await rpc('m8_outcome',[AX.id,2,'hired','Human final hire review reason',true])).outcome,'hired');
// Withdraw a confirmed independent application; old revision and reminders are cancelled.
const second=await rpc('m8_book',[BX.id,slot,'Propose another human interview']);await actor(B,S2);await rpc('m8_change',[second.id,0,'confirm',null,'I confirm human interview']);eq((await rpc('m8_reminders')).length,1);
await rpc('m2_transition',[BX.id,'withdraw',0,crypto.randomUUID(),'I withdraw my application',[]]);eq((await rpc('m8_booking',[second.id])).state,'cancelled');eq((await rpc('m8_booking',[second.id])).revision,2);eq((await rpc('m8_reminders')).length,0);await denied('select public.m8_change($1,$2,$3,$4,$5)',[second.id,1,'confirm',null,'Replay stale confirmation']);
await actor(HM,HS,'aal2');await rpc('m8_cancel_slot',[slot,'Interviewer no longer available']);eq((await rpc('m8_context',[true])).slots.some(s=>s.id===slot),false);
await db.exec('reset role');eq((await db.query("select status,final_outcome from public.m1_applications where id=$1",[AX.id])).rows[0],{status:'hired',final_outcome:'hired'});eq((await db.query("select count(*)::integer n from public.m1_application_events where event_type='final_hired'")).rows[0].n,1);
await db.query('delete from auth.sessions where id=$1',[S1]);await actor(A,S1);await denied('select public.m8_context($1)',[false]);await denied('select public.m8_booking($1)',[booked.id]);await db.exec('reset role');await db.exec('set role anon');await denied('select public.m8_context($1)',[false]);
console.log(`M8 PostgreSQL gate: ${checks} assertions passed`);await db.close();
