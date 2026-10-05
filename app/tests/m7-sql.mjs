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
let checks=0;
function eq(a,b){assert.deepEqual(a,b);checks++;}
const encode=v=>v!==null&&typeof v==='object'?JSON.stringify(v):v;
async function actor(id,session,aal='aal1'){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session,aal})]);await db.exec('set role authenticated');}
async function denied(sql,args=[]){let bad=false;try{await db.query(sql,args.map(encode));}catch{bad=true;}assert.ok(bad,sql);checks++;}
async function rpc(name,args=[]){return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args.map(encode))).rows[0].result;}
async function admin(){await db.exec('reset role');await db.exec('set role service_role');}
const source=crypto.randomUUID(),synthetic=crypto.randomUUID();
await db.query("insert into kerja_private.job_sources(id,name,adapter,board,endpoint,allowed_hosts) values($1,'Approved fixture','lever','fixture','https://api.lever.co/v0/postings/fixture?mode=json&limit=50',array['api.lever.co','jobs.lever.co']),($2,'Synthetic fixture','lever','synthetic','https://api.lever.co/v0/postings/synthetic?mode=json&limit=50',array['api.lever.co','jobs.lever.co'])",[source,synthetic]);
await actor(A,S1);eq(await rpc('m7_list',['','all','all',false,false,false]),[]);
await denied('select * from kerja_private.job_sources');await denied('select public.m7_enqueue()');await denied('select public.m7_claim($1)',[crypto.randomUUID()]);
await denied("update kerja_private.discovery_policy set enabled=true");await denied('select public.m7_list($1,$2,$3,$4,$5,$6)',['','bad','all',false,false,false]);
await denied('select public.m7_list($1,$2,$3,$4,$5,$6)',['','all',null,false,false,false]);
await admin();eq(await rpc('m7_enqueue'),0);
await db.exec('reset role');await denied('update kerja_private.job_sources set enabled=true where id=$1',[source]);
await db.query("update kerja_private.job_sources set tos_reviewed=true,robots_ok=true,redistribution_approved=true,evidence='Synthetic approval fixture, not real permission',reviewed_at=now(),review_expires_at=now()+interval '1 day',enabled=true,synthetic=(id=$2) where id in ($1,$2)",[source,synthetic]);
await db.query('update kerja_private.discovery_policy set enabled=true');
await admin();eq(await rpc('m7_enqueue'),2);eq(await rpc('m7_enqueue'),0);
let lease=crypto.randomUUID(),claim=await rpc('m7_claim',[lease]);eq(claim.lease,lease);eq(claim.enabled,true);eq(await rpc('m7_claim',[crypto.randomUUID()]),null);
const sid=claim.id;
function listing(id,url='https://jobs.lever.co/fixture/'+id){return {provider_id:id,title:'Junior Software Engineer',company:'Fixture Company',location:'Kuala Lumpur Malaysia',url,category:'technology',seniority:'junior',region:'malaysia',classification:'unverified'};}
await denied('select public.m7_finish($1,$2,$3,$4,$5,$6)',[claim.work_id,crypto.randomUUID(),[],true,null,60]);
await denied('select public.m7_finish($1,$2,$3,$4,$5,$6)',[claim.work_id,lease,[listing('bad','https://127.0.0.1/private')],true,null,60]);
eq(await rpc('m7_finish',[claim.work_id,lease,[listing('a'),listing('b')],true,null,60]),2);
await denied('select public.m7_finish($1,$2,$3,$4,$5,$6)',[claim.work_id,lease,[],true,null,60]);
await db.exec('reset role');let listingIds=(await db.query('select id,provider_id from kerja_private.discovery_listings where source_id=$1 order by provider_id',[sid])).rows;let lid=listingIds[0].id;
await actor(A,S1);let rows=await rpc('m7_list',['','all','all',false,false,sid===synthetic]);eq(rows.length,2);eq(rows[0].synthetic,sid===synthetic);
eq((await rpc('m7_list',['software','malaysia','technology',false,false,sid===synthetic])).length,2);
eq((await rpc('m7_list',['none','all','all',false,false,sid===synthetic])).length,0);
await rpc('m7_save',[lid,true]);await rpc('m7_save',[lid,true]);eq((await rpc('m7_list',['','all','all',true,false,sid===synthetic])).length,1);
await rpc('m7_track',[lid,'applied','DO NOT OVERWRITE WITH CLICK',false]);await rpc('m7_track',[lid,'considering','',true]);
rows=await rpc('m7_list',['','all','all',true,false,sid===synthetic]);eq(rows[0].external_status,'applied');eq(rows[0].note,'DO NOT OVERWRITE WITH CLICK');eq(!!rows[0].clicked_at,true);
await denied('select public.m7_track($1,$2,$3,$4)',[lid,'hired','',false]);
await denied('select * from kerja_private.external_application_notes');
await db.exec('reset role');await db.query("update kerja_private.job_sources set review_expires_at=now()-interval '1 second' where id=$1",[sid]);await actor(A,S1);eq((await rpc('m7_list',['','all','all',true,false,sid===synthetic]))[0].state,'source_paused');eq((await rpc('m7_list',['','all','all',false,false,sid===synthetic])).length,0);await db.exec('reset role');await db.query("update kerja_private.job_sources set review_expires_at=now()+interval '1 day' where id=$1",[sid]);
await actor(B,S2);eq((await rpc('m7_list',['','all','all',true,false,sid===synthetic])).length,0);
await rpc('m7_track',[lid,'considering','B PRIVATE',true]);rows=await rpc('m7_list',['','all','all',true,false,sid===synthetic]);eq(rows[0].external_status,'considering');eq(rows[0].note,'');
await rpc('m7_forget',[lid]);eq((await rpc('m7_list',['','all','all',true,false,sid===synthetic])).length,0);
await actor(A,S1);eq((await rpc('m7_list',['','all','all',true,false,sid===synthetic]))[0].note,'DO NOT OVERWRITE WITH CLICK');
await db.exec('reset role');eq((await db.query('select count(*)::integer n from public.m1_applications')).rows[0].n,0);eq((await db.query('select count(*)::integer n from kerja_private.saved_jobs')).rows[0].n,1);
// Finish the second source with same canonical links; dedupe retains first provenance.
await admin();lease=crypto.randomUUID();claim=await rpc('m7_claim',[lease]);eq(await rpc('m7_finish',[claim.work_id,lease,[listing('a')],true,null,60]),0);
await db.exec('reset role');eq((await db.query('select count(*)::integer n from kerja_private.discovery_listings')).rows[0].n,2);
// Repeat run updates in place; partial board does not mark missing jobs removed.
await db.query('update kerja_private.job_sources set next_run_at=now() where id=$1',[sid]);await admin();eq(await rpc('m7_enqueue'),1);lease=crypto.randomUUID();claim=await rpc('m7_claim',[lease]);eq(await rpc('m7_finish',[claim.work_id,lease,[listing('a')],false,null,60]),1);
await db.exec('reset role');eq((await db.query("select count(*)::integer n from kerja_private.discovery_listings where state='active'")).rows[0].n,2);
await db.query("update kerja_private.discovery_runs set queued_at=now()-interval '1 day'");
// Expired lease can be resumed; wrong/late completion is denied.
await db.query('update kerja_private.job_sources set next_run_at=now() where id=$1',[sid]);await admin();await rpc('m7_enqueue');lease=crypto.randomUUID();claim=await rpc('m7_claim',[lease]);
await db.exec('reset role');await db.query("update kerja_private.work_items set lease_until=now()-interval '1 second' where id=$1",[claim.work_id]);await admin();await denied('select public.m7_finish($1,$2,$3,$4,$5,$6)',[claim.work_id,lease,[],true,null,60]);
lease=crypto.randomUUID();let resumed=await rpc('m7_claim',[lease]);eq(resumed.work_id,claim.work_id);eq(await rpc('m7_finish',[resumed.work_id,lease,[listing('a')],true,null,60]),1);
await db.exec('reset role');eq((await db.query("select state from kerja_private.discovery_listings where id=$1",[listingIds[1].id])).rows[0].state,'removed');
await db.query("update kerja_private.discovery_listings set expires_at=now()-interval '1 second' where id=$1",[lid]);await admin();await rpc('m7_enqueue');await actor(A,S1);eq((await rpc('m7_list',['','all','all',false,false,sid===synthetic])).length,0);eq((await rpc('m7_list',['','all','all',true,false,sid===synthetic]))[0].state,'expired');
// 429 persists backoff without same-run retry; blocking kills the source.
await db.exec('reset role');await db.query('update kerja_private.job_sources set next_run_at=now() where id=$1',[sid]);await admin();await rpc('m7_enqueue');lease=crypto.randomUUID();claim=await rpc('m7_claim',[lease]);eq(await rpc('m7_finish',[claim.work_id,lease,[],false,'rate_limited',120]),0);eq(await rpc('m7_claim',[crypto.randomUUID()]),null);
await db.exec('reset role');eq((await db.query('select last_error_code from kerja_private.job_sources where id=$1',[sid])).rows[0].last_error_code,'rate_limited');await db.query('update kerja_private.work_items set due_at=now() where id=$1',[claim.work_id]);await admin();lease=crypto.randomUUID();claim=await rpc('m7_claim',[lease]);await rpc('m7_finish',[claim.work_id,lease,[],false,'blocked',60]);
await db.exec('reset role');eq((await db.query('select enabled from kerja_private.job_sources where id=$1',[sid])).rows[0].enabled,false);await actor(A,S1);eq((await rpc('m7_list',['','all','all',true,false,sid===synthetic]))[0].state,'source_paused');
// Global/source kill after claim quarantines the late result.
await db.exec('reset role');await db.query('update kerja_private.job_sources set next_run_at=now() where id=$1',[sid===source?synthetic:source]);await admin();await rpc('m7_enqueue');lease=crypto.randomUUID();claim=await rpc('m7_claim',[lease]);await db.exec('reset role');await db.query('update kerja_private.discovery_policy set enabled=false');await admin();eq(await rpc('m7_finish',[claim.work_id,lease,[listing('late')],true,null,60]),0);
// Budget is consumed globally, including failed/cancelled runs; no refund loop.
await db.exec('reset role');await db.query('update kerja_private.discovery_policy set enabled=true');await db.query('update kerja_private.discovery_runs set queued_at=now()');await db.query('update kerja_private.job_sources set next_run_at=now()');await admin();eq(await rpc('m7_enqueue'),0);
await db.exec('reset role');const exhausted=crypto.randomUUID();await db.query("insert into kerja_private.work_items(id,kind,reference_id,idempotency_key,state,attempts) values($1,'job_discovery',$2,$3,'pending',3)",[exhausted,sid===source?synthetic:source,'exhausted-'+exhausted]);await admin();eq(await rpc('m7_claim',[crypto.randomUUID()]),null);await db.exec('reset role');eq((await db.query('select state from kerja_private.work_items where id=$1',[exhausted])).rows[0].state,'dead');
await actor(A,S1);await rpc('m7_forget',[lid]);eq((await rpc('m7_list',['','all','all',true,false,sid===synthetic])).length,0);
await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[S1]);await actor(A,S1);await denied('select public.m7_progress()');await denied('select public.m7_list($1,$2,$3,$4,$5,$6)',['','all','all',false,false,false]);await denied('select public.m7_save($1,$2)',[lid,true]);
await db.exec('reset role');await db.exec('set role anon');await denied('select public.m7_progress()');await denied('select public.m7_claim($1)',[crypto.randomUUID()]);
console.log(`M7 PostgreSQL gate: ${checks} assertions passed`);await db.close();
