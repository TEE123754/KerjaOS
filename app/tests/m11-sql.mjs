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
await db.exec(await readFile('supabase/migrations/20261003120000_m9_release_privacy.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261005100000_m10_tracker_workspace.sql','utf8'));
let checks=0;function eq(a,b){assert.deepEqual(a,b);checks++;}
async function actor(id,session,aal='aal1'){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session,aal})]);await db.exec('set role authenticated');}
async function service(){await db.exec('reset role;set role service_role');}
async function denied(sql,args=[]){let bad=false;try{await db.query(sql,args);}catch{bad=true;}assert.ok(bad,sql);checks++;}
const enc=x=>x!==null&&typeof x==='object'?JSON.stringify(x):x;
async function rpc(name,args=[]){return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args.map(enc))).rows[0].result;}
const hs=crypto.randomUUID();await db.query('insert into auth.sessions values($1,$2)',[hs,HM]);
await actor(A,S1);await rpc('m1_bootstrap_profile');const ax=await rpc('m1_submit_application',[X,crypto.randomUUID()]),ay=await rpc('m1_submit_application',[Y,crypto.randomUUID()]);await actor(B,S2);await rpc('m1_bootstrap_profile');const bx=await rpc('m1_submit_application',[X,crypto.randomUUID()]);

await db.exec('reset role');
await db.exec(await readFile('supabase/migrations/20261005110000_m11_scoped_analytics.sql','utf8'));
await db.query("update public.m1_applications set created_at='2026-03-08T04:30:00Z' where id=$1",[ax.id]);
await db.query("update public.m1_applications set created_at='2026-03-08T07:30:00Z' where id in ($1,$2)",[ay.id,bx.id]);
await actor(A,S1);
const report=(scope='candidate',start='2026-01-01',end='2026-12-31',zone='UTC',company='',origin='all',job=null,archive=false)=>rpc('m11_report',[scope,start,end,zone,company,origin,job,archive]);
let r=await report();eq(r.total,2);eq(r.stages[0].known_age_count,0);eq(r.stages[0].mean_age_days,null);eq(r.observed_funnel,[]);eq(r.outcomes[0].denominator,2);
eq((await report('candidate','2026-03-07','2026-03-07','America/New_York')).total,1);
eq((await report('candidate','2026-03-08','2026-03-08','America/New_York')).total,1);
eq((await report('candidate','2026-03-08','2026-03-08','UTC')).total,2);eq((await rpc('m11_report',['candidate','2026-01-01','2026-12-31','UTC','','all',null,false,'KerjaOS'])).total,2);eq((await rpc('m11_report',['candidate','2026-01-01','2026-12-31','UTC','','all',null,false,'absent'])).total,0);
const c=await rpc('m10_company',[null,0,'=Synthetic Company','',null,'PRIVATE']);
const known=await rpc('m10_manual',[null,0,c.id,'External','','interview','2026-03-08','PRIVATE',null,false]);
const unknown=await rpc('m10_manual',[null,0,c.id,'Unknown','','offer',null,'SECRET',null,false]);
r=await report();eq(r.total,3);eq(r.unknown_dates,1);eq(r.outcomes.find(x=>x.origin==='manual').interviews,1);eq(r.outcomes.find(x=>x.origin==='manual').denominator,1);eq(JSON.stringify(r).includes('PRIVATE'),false);eq(JSON.stringify(r).includes('SECRET'),false);
eq((await report('candidate','2026-01-01','2026-12-31','UTC','=Synthetic','manual')).total,1);
await rpc('m10_manual',[known.id,0,c.id,'External','','rejected','2026-03-08','PRIVATE',null,true]);eq((await report()).total,2);eq((await report('candidate','2026-01-01','2026-12-31','UTC','','all',null,true)).total,3);
await actor(B,S2);r=await report();eq(r.total,1);eq(r.unknown_dates,0);eq(r.companies.some(x=>x.company==='=Synthetic Company'),false);
await denied('select public.m11_report($1,$2,$3,$4,$5,$6,$7,$8)',['staff','2026-01-01','2026-12-31','UTC','','all',null,false]);
await actor(HM,hs,'aal1');await denied('select public.m11_report($1,$2,$3,$4,$5,$6,$7,$8)',['staff','2026-01-01','2026-12-31','UTC','','all',null,false]);
await actor(HM,hs,'aal2');r=await report('staff');eq(r.total,2);eq(r.unknown_dates,0);eq(r.outcomes.length,1);eq(r.outcomes[0].origin,'internal');eq((await report('staff','2026-01-01','2026-12-31','UTC','','all',X)).total,2);
await denied('select public.m11_report($1,$2,$3,$4,$5,$6,$7,$8)',['staff','2026-01-01','2026-12-31','UTC','','all',Y,false]);
await denied('select public.m11_report($1,$2,$3,$4,$5,$6,$7,$8)',['staff','2026-01-01','2026-12-31','UTC','','manual',null,false]);
await db.exec('reset role');await db.query("update public.m1_applications set stage='P1' where id=$1",[ay.id]);await db.query("update public.m1_applications set stage='P2' where id=$1",[ay.id]);await db.query("update public.m1_applications set stage='P1' where id=$1",[ay.id]);await db.query("update public.m1_applications set status='on_hold' where id=$1",[ay.id]);
await db.query("update public.m1_applications set final_outcome='offer',offer_accepted_at=now() where id=$1",[ay.id]);
const slot=crypto.randomUUID();await db.query("insert into kerja_private.interview_slots(id,job_id,interviewer_id,starts_at,ends_at,timezone,mode,location,created_by) values($1,$2,$3,now(),now()+interval '1 hour','UTC','online','https://example.test',$3)",[slot,X,HM]);await db.query("insert into kerja_private.interview_bookings(application_id,slot_id,state,reason) values($1,$2,'confirmed','Synthetic confirmed booking')",[ax.id,slot]);
await actor(A,S1);r=await report();eq(r.outcomes.find(x=>x.origin==='internal').interviews,1);eq(r.outcomes.find(x=>x.origin==='internal').offers,1);eq(r.outcomes.find(x=>x.origin==='internal').hires,0);eq(r.observed_funnel.find(x=>x.stage==='P1').applications,1);eq(r.observed_funnel.find(x=>x.stage==='P2').applications,1);eq(r.observed_funnel[0].denominator,2);eq(r.stages.find(x=>x.stage==='P1').known_age_count,1);eq(r.stages.find(x=>x.stage==='P0').mean_age_days,null);eq((await rpc('m9_export',['analytics_observations',0])).rows.length,4);eq((await rpc('m9_export',['applications',0])).rows.length,2);
await actor(B,S2);eq((await rpc('m9_export',['analytics_observations',0])).rows.length,0);
await db.exec('reset role');await db.query("update public.m1_applications set status='job_closed' where id=$1",[ax.id]);await actor(A,S1);r=await report();eq(r.outcomes.find(x=>x.origin==='internal').closures,1);eq(r.outcomes.find(x=>x.origin==='internal').rejections,0);eq(r.observed_funnel.some(x=>x.stage==='P0'),false);
for(const args of [['candidate','2026-03-09','2026-03-08','UTC','','all',null,false],['candidate','2025-01-01','2026-12-31','UTC','','all',null,false],['candidate','2026-01-01','2026-12-31','bad-zone','','all',null,false],['candidate','2026-01-01','2026-12-31','UTC','','all',X,false]])await denied('select public.m11_report($1,$2,$3,$4,$5,$6,$7,$8)',args);
eq((await report('candidate','2025-01-01','2025-01-02')).total,0);
await denied('select * from kerja_private.analytics_observations');await denied("insert into kerja_private.analytics_observations(application_id,stage,status,stage_changed) values($1,'P6','hired',true)",[ax.id]);
// Discovery saved status is excluded from dated cohort, counted as unknown once.
await db.exec('reset role');const source=(await db.query('select id from kerja_private.job_sources limit 1')).rows[0].id,listing=crypto.randomUUID();await db.query("insert into kerja_private.discovery_listings(id,source_id,provider_id,canonical_url,title,company,location,category,seniority,region,classification) values($1,$2,'fixture','https://example.test/job/source','Source role','Source company','','technology','junior','unknown','unverified')",[listing,source]);await db.query('insert into kerja_private.saved_jobs(actor_id,listing_id) values($1,$2)',[B,listing]);await db.query("insert into kerja_private.external_application_notes(actor_id,listing_id,status,note) values($1,$2,'applied','PRIVATE')",[B,listing]);await actor(B,S2);r=await report();eq(r.total,1);eq(r.unknown_dates,1);eq((await report('candidate','2026-01-01','2026-12-31','UTC','','discovery')).total,0);
const samples=[];for(let i=0;i<5;i++){let start=performance.now();await report();samples.push(performance.now()-start);}console.log('M11 small synthetic query milliseconds',JSON.stringify(samples));
await db.exec('reset role');await db.query("insert into kerja_private.analytics_observations(application_id,stage,status,stage_changed) select $1,'P1','applied',true from generate_series(1,20001)",[bx.id]);await actor(B,S2);await denied('select public.m11_report($1,$2,$3,$4,$5,$6,$7,$8)',['candidate','2026-01-01','2026-12-31','UTC','','all',null,false]);
await db.exec('reset role;set role anon');await denied('select public.m11_report($1,$2,$3,$4,$5,$6,$7,$8)',['candidate','2026-01-01','2026-12-31','UTC','','all',null,false]);await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[S1]);await actor(A,S1);await denied('select public.m11_report($1,$2,$3,$4,$5,$6,$7,$8)',['candidate','2026-01-01','2026-12-31','UTC','','all',null,false]);
await db.close();console.log(`M11 PostgreSQL scoped analytics gate: ${checks} assertions passed`);
