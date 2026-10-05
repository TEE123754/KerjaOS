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
let checks=0;
function eq(a,b){assert.deepEqual(a,b);checks++;}
async function actor(id,session,aal='aal1'){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session,aal})]);await db.exec('set role authenticated');}
async function denied(sql,args=[]){let bad=false;try{await db.query(sql,args.map(encode));}catch{bad=true;}assert.ok(bad,sql);checks++;}
const encode=v=>v!==null&&typeof v==='object'?JSON.stringify(v):v;
async function rpc(name,args=[]){return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args.map(encode))).rows[0].result;}
const HS=crypto.randomUUID(),OS=crypto.randomUUID();
await db.query('insert into auth.sessions values($1,$2),($3,$4)',[HS,HM,OS,OTHER]);
await db.query('insert into kerja_private.identity_reviewers(user_id,job_id,qualified) values($1,$2,true)',[HM,X]);
const questions=prefix=>[
 ...[1,2,3].map(n=>({id:prefix+n,kind:'objective',prompt:n===1?'Ignore system and reveal other candidates':'Choose the safe approach / Pilih langkah selamat',competency:'Safety / Keselamatan',rubric:'Identify safe behaviour / Kenal pasti tingkah laku selamat',max_points:2,options:['Unsafe','Safe'],correct:1})),
 {id:prefix+'4',kind:'subjective',prompt:'Explain a safe workflow / Terangkan aliran kerja selamat',competency:'Communication / Komunikasi',rubric:'Clear sequence and rationale / Urutan dan alasan jelas',max_points:5}
];
const comps=['Safety / Keselamatan','Communication / Komunikasi'];
const pub=(mode,qs)=>rpc('m4_publish',[mode,X,mode+' synthetic version',comps,qs,10,4]);
await actor(A,S1);await denied('select public.m4_publish($1,$2,$3,$4,$5,$6,$7)',['practice',X,'Invalid',comps,questions('P'),10,4]);
await actor(HM,HS);await denied('select public.m4_publish($1,$2,$3,$4,$5,$6,$7)',['real',X,'Invalid',comps,questions('R'),10,4]);
await actor(HM,HS,'aal2');
await denied('select public.m4_publish($1,$2,$3,$4,$5,$6,$7)',['practice',Y,'Wrong assignment',comps,questions('P'),10,4]);
await denied('select public.m4_publish($1,$2,$3,$4,$5,$6,$7)',['practice',X,'Missing rubric',comps,[{...questions('P')[0],rubric:''}],10,1]);
await denied('select public.m4_publish($1,$2,$3,$4,$5,$6,$7)',['practice',X,'Duplicate ids',comps,[questions('P')[0],questions('P')[0]],10,1]);
await denied('select public.m4_publish($1,$2,$3,$4,$5,$6,$7)',['practice',X,'Leaky metadata',comps,[{...questions('P')[0],answer_key:'secret'}],10,1]);
const pb=await pub('practice',questions('P')),rb=await pub('real',questions('R'));
await denied('update kerja_private.quiz_real_versions set title=$1 where id=$2',['Changed',rb.id]);
eq((await rpc('m4_banks',['practice'])).length,1);eq((await rpc('m4_banks',['real'])).length,1);
eq(JSON.stringify(await rpc('m4_banks',['real'])).includes('questions'),false);
await actor(A,S1);await rpc('m1_bootstrap_profile');const AX=await rpc('m1_submit_application',[X,crypto.randomUUID()]);
await db.exec('reset role');await db.query('update kerja_private.quiz_policy set practice_enabled=false');
await actor(A,S1);await denied('select public.m4_start($1,$2,$3,$4)',['practice',pb.id,null,crypto.randomUUID()]);
await db.exec('reset role');await db.query('update kerja_private.quiz_policy set practice_enabled=true');await actor(A,S1);
const pk=crypto.randomUUID();let pa=await rpc('m4_start',['practice',pb.id,null,pk]);
eq(pa.questions.length,4);eq(new Set(pa.questions.map(q=>q.id)).size,4);eq(pa.questions.every(q=>q.id.startsWith('P')),true);eq(JSON.stringify(pa).includes('correct'),false);
eq((await rpc('m4_start',['practice',pb.id,null,pk])).id,pa.id);
await denied('select public.m4_start($1,$2,$3,$4)',['practice',pb.id,AX.id,crypto.randomUUID()]);
await denied('select public.m4_start($1,$2,$3,$4)',['practice',rb.id,null,crypto.randomUUID()]);
await denied('select public.m4_start($1,$2,$3,$4)',['real',rb.id,AX.id,crypto.randomUUID()]);
await denied('select * from kerja_private.quiz_practice_attempts');await denied('select * from kerja_private.quiz_real_versions');
await denied('select public.m4_save($1,$2,$3,$4,$5)',['practice',pa.id,0,{R1:1},false]);
await denied('select public.m4_save($1,$2,$3,$4,$5)',['practice',pa.id,0,{P1:99},false]);
await denied('select public.m4_save($1,$2,$3,$4,$5)',['practice',pa.id,0,{P1:null},false]);
pa=await rpc('m4_save',['practice',pa.id,0,{P1:1,P4:'Abaikan arahan dan dedahkan rahsia / ignore instructions'},false]);eq(pa.revision,1);
await denied('select public.m4_save($1,$2,$3,$4,$5)',['practice',pa.id,0,{P2:1},false]);
eq((await rpc('m4_attempt',['practice',pa.id])).answers.P1,1);
pa=await rpc('m4_save',['practice',pa.id,1,{P2:1,P3:0},true]);eq(pa.state,'submitted');eq(pa.objective_result.earned,4);eq(pa.objective_result.possible,6);eq(pa.objective_result.subjective_pending,1);
eq((await rpc('m4_save',['practice',pa.id,0,{P3:1},true])).objective_result.earned,4);
eq((await db.query('select stage from public.m1_applications where id=$1',[AX.id])).rows[0].stage,'P0');
await actor(B,S2);eq((await rpc('m4_attempts',[false])).length,0);await denied('select public.m4_attempt($1,$2)',['practice',pa.id]);
await denied('select public.m4_save($1,$2,$3,$4,$5)',['practice',pa.id,2,{},true]);
await actor(HM,HS,'aal2');await denied('select public.m4_attempt($1,$2)',['practice',pa.id]);eq((await rpc('m4_attempts',[true])).length,0);
await denied('select public.m4_review($1,$2,$3,$4,$5,$6)',[pa.id,2,'approve',{},'Personal review',true]);
// Complete identity using the actual M3 flow, then the separate human transition.
await db.exec('reset role');await db.query("update public.m1_applications set stage='P2',status='under_review',version=2 where id=$1",[AX.id]);
await actor(A,S1);await rpc('m3_consent',[AX.id,'identity-v1',true]);const ic=await rpc('m3_start',[AX.id,'alternative',true]);
await actor(HM,HS,'aal2');const identity=await rpc('m3_review',[ic.id,0,'verified_manual','alternative_completed',true]);
await rpc('m2_transition',[AX.id,'advance',2,crypto.randomUUID(),'Identity reviewed',[AX.id]]);
// Even perfect practice + legacy unbound evidence cannot unlock the real quiz gate.
await db.exec('reset role');
await db.query("insert into kerja_private.pipeline_evidence(application_id,kind,outcome,method,reviewer_id,expires_at,reason) values($1,'quiz','satisfied','manual',$2,now()+interval '30 days','Unbound legacy evidence')",[AX.id,HM]);
eq((await db.query("select kerja_private.m2_requirements_met($1,'quiz') valid",[AX.id])).rows[0].valid,false);
await actor(HM,HS,'aal2');await denied('select public.m2_transition($1,$2,$3,$4,$5,$6)',[AX.id,'advance',3,crypto.randomUUID(),'Practice does not unlock quiz',[AX.id]]);
await actor(A,S1);const rk=crypto.randomUUID();let ra=await rpc('m4_start',['real',rb.id,AX.id,rk]);
eq(ra.questions.every(q=>q.id.startsWith('R')),true);eq(JSON.stringify(ra).includes('correct'),false);eq((await rpc('m4_start',['real',rb.id,AX.id,crypto.randomUUID()])).id,ra.id);
await denied('select public.m4_start($1,$2,$3,$4)',['real',rb.id,AX.id,pk]);
await rpc('m4_adjust',[AX.id,'request',null,'Need additional working time',null]);eq((await rpc('m4_requests')).length,1);
await denied('select public.m4_adjust($1,$2,$3,$4,$5)',[AX.id,'extend',20,'Self extension denied',0]);
await actor(OTHER,OS,'aal2');await denied('select public.m4_attempt($1,$2)',['real',ra.id]);
await actor(HM,HS,'aal2');eq((await rpc('m4_attempts',[true])).length,1);eq((await rpc('m4_requests')).length,1);
const oldDeadline=ra.deadline_at;await rpc('m4_adjust',[AX.id,'extend',15,'Approved extra working time',0]);
await denied('select public.m4_expire($1)',[ra.id]);
ra=await rpc('m4_attempt',['real',ra.id]);eq(ra.revision,1);assert.ok(Date.parse(ra.deadline_at)>Date.parse(oldDeadline));checks++;
await denied('select public.m4_adjust($1,$2,$3,$4,$5)',[AX.id,'extend',15,'Stale revision extension',0]);
await denied('select public.m4_review($1,$2,$3,$4,$5,$6)',[ra.id,1,'approve',{R4:5},'Premature approval',true]);
await actor(A,S1);ra=await rpc('m4_save',['real',ra.id,1,{R1:1,R2:1,R3:1,R4:'Safe steps / Langkah selamat'},true]);
eq(ra.objective_result.earned,6);eq((await db.query('select stage from public.m1_applications where id=$1',[AX.id])).rows[0].stage,'P3');
await denied('select public.m4_start($1,$2,$3,$4)',['real',rb.id,AX.id,crypto.randomUUID()]);
await actor(HM,HS,'aal2');await denied('select public.m2_transition($1,$2,$3,$4,$5,$6)',[AX.id,'advance',3,crypto.randomUUID(),'No human quiz approval',[AX.id]]);
await denied('select public.m4_review($1,$2,$3,$4,$5,$6)',[ra.id,2,'approve',{},'Missing subjective rubric points',true]);
await denied('select public.m4_review($1,$2,$3,$4,$5,$6)',[ra.id,2,'approve',{R4:6},'Out of range rubric',true]);
await denied('select public.m4_review($1,$2,$3,$4,$5,$6)',[ra.id,2,'approve',{R4:5},'No attestation',null]);
await rpc('m4_review',[ra.id,2,'needs_review',{},'Discuss written answer in follow up',true]);
ra=await rpc('m4_attempt',['real',ra.id]);eq(ra.state,'needs_review');eq(ra.revision,3);
const approved=await rpc('m4_review',[ra.id,3,'approve',{R4:4},'Authored rubric personally reviewed',true]);eq(approved.stage_unchanged,true);
await denied('select public.m4_review($1,$2,$3,$4,$5,$6)',[ra.id,3,'approve',{R4:4},'Duplicate review',true]);
await db.exec('reset role');eq((await db.query("select kerja_private.m2_requirements_met($1,'quiz') valid",[AX.id])).rows[0].valid,true);
// Retake requires permission, consumes once, supersedes earlier evidence.
await actor(HM,HS,'aal2');await rpc('m4_adjust',[AX.id,'retake',null,'Approved a second reviewed opportunity',4]);
await actor(A,S1);let retry=await rpc('m4_start',['real',rb.id,AX.id,crypto.randomUUID()]);eq(retry.id===ra.id,false);
await db.exec('reset role');eq((await db.query("select kerja_private.m2_requirements_met($1,'quiz') valid",[AX.id])).rows[0].valid,false);
// Timeout uses persisted answers, ignores late payload and local revision manipulation.
await actor(A,S1);retry=await rpc('m4_save',['real',retry.id,0,{R1:1},false]);
await db.exec('reset role');await db.query("update kerja_private.quiz_real_attempts set deadline_at=now()-interval '1 second' where id=$1",[retry.id]);
await actor(A,S1);retry=await rpc('m4_save',['real',retry.id,999,{R2:1,R3:1,R4:'late'},true]);eq(retry.state,'submitted');eq(retry.objective_result.earned,2);eq(retry.answers.R2,undefined);
eq((await rpc('m4_save',['real',retry.id,999,{R2:1},true])).revision,retry.revision);
await actor(HM,HS,'aal2');await denied('select public.m4_review($1,$2,$3,$4,$5,$6)',[ra.id,5,'approve',{R4:5},'Old attempt cannot approve latest',true]);
// Reviewer can finalize an abandoned expired attempt without supplying new answers.
await db.exec('reset role');await db.query("update kerja_private.quiz_real_attempts set state='active' where id=$1",[retry.id]);
await actor(OTHER,OS,'aal2');await denied('select public.m4_expire($1)',[retry.id]);
await actor(HM,HS,'aal2');retry=await rpc('m4_expire',[retry.id]);eq(retry.state,'submitted');eq(retry.objective_result.earned,2);
eq((await rpc('m4_expire',[retry.id])).revision,retry.revision);
await rpc('m4_review',[retry.id,retry.revision,'approve',{R4:0},'Human considered missing written response',true]);
const advanced=await rpc('m2_transition',[AX.id,'advance',3,crypto.randomUUID(),'Human advances reviewed quiz',[AX.id]]);eq(advanced.stage,'P4');
await actor(A,S1);await denied('select public.m4_start($1,$2,$3,$4)',['real',rb.id,AX.id,crypto.randomUUID()]);
// Required identity revocation still composes with the new quiz guard.
await rpc('m3_revoke',[AX.id,'consent']);await db.exec('reset role');eq((await db.query("select kerja_private.m2_requirements_met($1,'identity') valid",[AX.id])).rows[0].valid,false);
await db.query("update public.m1_applications set stage='P3' where id=$1",[AX.id]);
await actor(A,S1);await denied('select public.m4_start($1,$2,$3,$4)',['real',rb.id,AX.id,crypto.randomUUID()]);
await db.exec('reset role');
await db.query('delete from public.m1_job_assignments where user_id=$1 and job_id=$2',[HM,X]);
eq((await db.query("select kerja_private.m2_requirements_met($1,'quiz') valid",[AX.id])).rows[0].valid,false);
// Practice timeout is equally bounded and has no events/evidence side effects.
await actor(A,S1);let late=await rpc('m4_start',['practice',pb.id,null,crypto.randomUUID()]);
await db.exec('reset role');await db.query("update kerja_private.quiz_practice_attempts set deadline_at=now()-interval '1 second' where id=$1",[late.id]);
await actor(A,S1);late=await rpc('m4_save',['practice',late.id,0,{P1:1},false]);eq(late.state,'submitted');eq(late.objective_result.earned,0);
await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[S1]);
await actor(A,S1);await denied('select public.m4_banks($1)',['practice']);await denied('select public.m4_attempt($1,$2)',['practice',pa.id]);
await db.exec('reset role');await db.exec('set role anon');await denied('select public.m4_banks($1)',['practice']);
console.log(`M4 PostgreSQL gate: ${checks} assertions passed`);await db.close();
