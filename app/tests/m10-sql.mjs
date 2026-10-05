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
await actor(A,S1);const c=await rpc('m10_company',[null,0,'Synthetic Company','example.test',E,'PRIVATE company note']);
eq(c.name,'Synthetic Company');eq((await rpc('m10_companies',[0])).length,1);
await denied('select public.m10_company($1,$2,$3,$4,$5,$6)',[c.id,9,'Changed','example.test',null,'stale']);
const v=await rpc('m10_resume_register',['Version 1','a'.repeat(64)]);eq(v.object_key.includes('/library/'),true);
await denied('select public.m10_resume_ready($1)',[v.id]);await service();await rpc('m10_resume_ready',[v.id]);await actor(A,S1);eq((await rpc('m10_resume_read',[v.id])).state,'ready');
const m=await rpc('m10_manual',[null,0,c.id,'External API role','https://example.test/jobs/1','applied',null,'Private external note',v.id,false]);
eq(m.applied_on,null);eq((await rpc('m10_list',['','all','','',null,null,false,0])).length,3);
await denied('select public.m10_manual($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[null,0,c.id,'Duplicate','https://example.test/jobs/1','applied',null,'',null,false]);
await denied('select public.m10_manual($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[m.id,9,c.id,'Changed','','interview',null,'',null,false]);
eq((await rpc('m10_list',['','manual','','', '2026-01-01',null,false,0])).length,0);
const updated=await rpc('m10_manual',[m.id,0,c.id,m.title,m.url,'interview','2026-10-01','Self-reported interview',v.id,true]);eq(updated.revision,1);eq((await rpc('m10_list',['','manual','','',null,null,false,0])).length,0);eq((await rpc('m10_list',['','manual','','',null,null,true,0])).length,1);eq((await rpc('m10_history',['manual',m.id])).length,2);
await denied('select public.m10_forget($1,$2,$3)',['company',c.id,0]);
for(const [who,session,aal] of [[B,S2,'aal1'],[HM,hs,'aal2']]){
 await actor(who,session,aal);eq(await rpc('m10_companies',[0]),[]);eq(await rpc('m10_resumes',[0]),[]);await denied('select public.m10_resume_read($1)',[v.id]);await denied('select public.m10_history($1,$2)',['manual',m.id]);await denied('select public.m10_manual($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[m.id,1,c.id,m.title,m.url,'rejected',null,'',v.id,false]);
}
await actor(B,S2);eq((await rpc('m10_list',['','all','','',null,null,false,0])).length,1);await denied('select public.m10_clone($1,$2,$3,$4)',[v.id,ax.id,0,crypto.randomUUID()]);
await actor(A,S1);const key=crypto.randomUUID(),clone=await rpc('m10_clone',[v.id,ax.id,0,key]);eq(clone.object_key===v.object_key,false);eq((await rpc('m10_clone',[v.id,ax.id,0,key])).id,clone.id);await denied('select public.m10_clone_ready($1)',[clone.id]);
await service();eq(await rpc('m10_clone_ready',[clone.id]),true);
await actor(HM,hs,'aal2');await rpc('m2_transition',[ax.id,'advance',0,crypto.randomUUID(),'Human reviews submitted resume',[ax.id]]);await rpc('m2_transition',[ax.id,'advance',1,crypto.randomUUID(),'Human fixes screening snapshot',[ax.id]]);
await actor(A,S1);eq((await rpc('m10_links'))[0].submitted_snapshot,true);await denied('select public.m10_clone($1,$2,$3,$4)',[v.id,ax.id,2,crypto.randomUUID()]);await denied('select * from kerja_private.resume_versions');
// App changing while a copy uploads invalidates completion.
const pending=await rpc('m10_clone',[v.id,ay.id,0,crypto.randomUUID()]);await rpc('m2_transition',[ay.id,'withdraw',0,crypto.randomUUID(),'Candidate withdraws during upload',[]]);await service();eq(await rpc('m10_clone_ready',[pending.id]),false);
await actor(A,S1);for(const section of ['companies','manual_tracker','manual_history','resume_library','resume_links','applications']){const out=await rpc('m9_export',[section,0]);eq(out.section,section);}
await rpc('m10_resume_retire',[v.id]);await denied('select public.m10_resume_read($1)',[v.id]);
// Existing external submission reference may survive library retirement without permitting new use.
eq((await rpc('m10_manual',[m.id,1,c.id,m.title,m.url,'rejected','2026-10-01','Outcome self-reported',v.id,false])).resume_version_id,v.id);
await service();const lease=crypto.randomUUID();eq((await rpc('m10_cleanup_claim',[lease])).id,v.id);eq(await rpc('m10_cleanup_complete',[v.id,crypto.randomUUID()]),false);eq(await rpc('m10_cleanup_complete',[v.id,lease]),true);eq(await rpc('m10_cleanup_complete',[v.id,lease]),false);
await db.exec('reset role');eq((await db.query('select object_key from kerja_private.document_deletion_ledger where document_id=$1',[v.id])).rows[0].object_key,v.object_key);eq((await db.query('select resume_snapshot_id from public.m1_applications where id=$1',[ax.id])).rows[0].resume_snapshot_id,clone.id);eq((await db.query('select state from kerja_private.documents where id=$1',[clone.id])).rows[0].state,'quarantined');
await actor(A,S1);await rpc('m10_forget',['manual',m.id,2]);await denied('select public.m10_replay_forget($1,$2,$3)',['manual',m.id,A]);eq(await rpc('m10_history',['internal',ay.id]) instanceof Array,true);await denied('select public.m10_history($1,$2)',['manual',m.id]);
const replayRecord=await rpc('m10_manual',[null,0,c.id,'Erase me','','considering',null,'Erase private notes',null,false]);const req=await rpc('m9_request',['erase_private_workspace','Please erase my private workspace',crypto.randomUUID()]);
await service();await rpc('m9_approve_private_erasure',[req.id]);await actor(A,S1);eq(await rpc('m10_companies',[0]),[]);eq((await rpc('m10_list',['','all','','',null,null,true,0])).length,2);eq((await rpc('m9_export',['manual_history',0])).rows.length,0);
await db.exec('reset role');eq((await db.query('select count(*)::int n from public.m1_applications')).rows[0].n,3);
await actor(B,S2);const bc=await rpc('m10_company',[null,0,'B private company','',null,'B only']);await service();await rpc('m9_replay_private_erasure',[A,new Date().toISOString()]);await actor(B,S2);eq((await rpc('m10_companies',[0]))[0].id,bc.id);
await db.exec('reset role');const source=(await db.query('select id from kerja_private.job_sources limit 1')).rows[0].id;const listing=crypto.randomUUID();await db.query("insert into kerja_private.discovery_listings(id,source_id,provider_id,canonical_url,title,company,location,category,seniority,region,classification) values($1,$2,'fixture','https://example.test/job/source','Source role','Source company','','technology','junior','unknown','unverified')",[listing,source]);await db.query('insert into kerja_private.saved_jobs(actor_id,listing_id) values($1,$2)',[B,listing]);
await actor(B,S2);const projection=await rpc('m10_list',['','discovery','','',null,null,false,0]);eq(projection.length,1);eq(projection[0].status,'saved');eq(projection[0].applied_on,null);
// Isolated restore/replay with actual M10 tables, preserving locked application copies.
await db.exec('reset role');eq((await db.query("select count(*)::int n from kerja_private.tracker_deletion_ledger where kind='manual' and record_id=$1",[m.id])).rows[0].n,1);const image=await db.dumpDataDir();const restored=new PGlite({loadDataDir:image});await restored.exec('set role service_role');await restored.query('select public.m9_replay_private_erasure($1,$2)',[B,new Date().toISOString()]);await restored.query('select public.m10_replay_forget($1,$2,$3)',['resume_library',v.id,A]);await restored.exec('reset role');eq((await restored.query('select count(*)::int n from kerja_private.tracker_companies where owner_id=$1',[B])).rows[0].n,0);eq((await restored.query('select resume_snapshot_id from public.m1_applications where id=$1',[ax.id])).rows[0].resume_snapshot_id,clone.id);await restored.close();
await db.exec('reset role;set role anon');await denied('select public.m10_companies(0)');await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[S1]);await actor(A,S1);await denied('select public.m10_resumes(0)');
await db.close();console.log(`M10 PostgreSQL tracker/ownership/snapshot/privacy gate: ${checks} assertions passed`);
