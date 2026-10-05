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
let checks=0;
function eq(a,b){assert.deepEqual(a,b);checks++;}
async function actor(id,session,aal='aal1'){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session,aal})]);await db.exec('set role authenticated');}
async function denied(sql,args=[]){let bad=false;try{await db.query(sql,args);}catch{bad=true;}assert.ok(bad);checks++;}
async function rpc(name,args=[]){const values=args.map((_,i)=>'$'+(i+1)).join(',');return(await db.query(`select public.${name}(${values}) result`,args)).rows[0].result;}
await db.exec('reset role');const E2=crypto.randomUUID(),HS=crypto.randomUUID(),OS=crypto.randomUUID();
await db.query('insert into public.m1_employers values($1,$2)',[E2,'Other synthetic employer']);await db.query('update public.m1_jobs set employer_id=$1 where id=$2',[E2,Y]);
await db.query("insert into public.m1_memberships values($1,$2,'reviewer',true)",[OTHER,E2]);await db.query('insert into public.m1_job_assignments values($1,$2)',[OTHER,Y]);
await db.query('insert into auth.sessions values($1,$2),($3,$4)',[HS,HM,OS,OTHER]);
await db.query('insert into kerja_private.identity_reviewers(user_id,job_id,qualified) values($1,$2,true),($3,$4,true)',[HM,X,OTHER,Y]);
await actor(A,S1);await rpc('m1_bootstrap_profile');
const AX=await rpc('m1_submit_application',[X,crypto.randomUUID()]),AY=await rpc('m1_submit_application',[Y,crypto.randomUUID()]);
await db.exec('reset role');await db.query("update public.m1_applications set stage='P2',status='under_review',version=2 where id in ($1,$2)",[AX.id,AY.id]);
await actor(A,S1);
await denied('select public.m3_start($1,$2,$3)',[AX.id,'mykad',true]);
await denied('select public.m3_consent($1,$2,$3)',[AX.id,'old-version',true]);
await denied('select public.m3_consent($1,$2,$3)',[AX.id,'identity-v1',false]);
await denied('select public.m3_consent($1,$2,$3)',[AX.id,'identity-v1',null]);
const consent=await rpc('m3_consent',[AX.id,'identity-v1',true]);eq(consent.employer_id,E);
eq((await rpc('m3_consent',[AX.id,'identity-v1',true])).id,consent.id);
await denied('select public.m3_start($1,$2,$3)',[AX.id,'mykad',false]);
const c=await rpc('m3_start',[AX.id,'mykad',true]);eq(c.state,'awaiting_document');
eq((await rpc('m3_cases',[false])).length,1);await denied('select * from kerja_private.identity_cases');
await actor(B,S2);eq((await rpc('m3_cases',[false])).length,0);await denied('select public.m3_consent($1,$2,$3)',[AX.id,'identity-v1',true]);
eq(await rpc('m3_document',[c.id]),null);await denied('select public.m3_review($1,$2,$3,$4,$5)',[c.id,0,'verified_manual','review_completed',true]);
await actor(A,S1);const DOC=crypto.randomUUID();const intent=await rpc('m3_upload_intent',[c.id,DOC]);eq(intent.id,DOC);
await denied('select public.m3_document_ready($1,$2,$3)',[DOC,'evidence_consistent','image/jpeg']);
await db.exec('reset role');await db.exec('set role service_role');await rpc('m3_document_ready',[DOC,'needs_review','image/jpeg']);
await actor(OTHER,OS,'aal2');eq((await rpc('m3_cases',[true])).length,0);eq(await rpc('m3_document',[c.id]),null);
await actor(HM,HS);await denied('select public.m3_review($1,$2,$3,$4,$5)',[c.id,2,'verified_manual','review_completed',true]);
await actor(HM,HS,'aal2');eq((await rpc('m3_cases',[true])).length,1);eq((await rpc('m3_document',[c.id])).id,DOC);
await denied('select public.m3_review($1,$2,$3,$4,$5)',[c.id,2,'verified_manual','review_completed',true]); // low-detail evidence
await denied('select public.m3_review($1,$2,$3,$4,$5)',[c.id,0,'needs_review','blurred',false]);
eq((await rpc('m3_review',[c.id,2,'needs_review','blurred',false])).decision,'needs_review');
await actor(A,S1);eq((await rpc('m3_start',[AX.id,'alternative',true])).state,'awaiting_review');
await actor(HM,HS,'aal2');await denied('select public.m3_review($1,$2,$3,$4,$5)',[c.id,4,'verified_manual','alternative_completed',false]);
await denied('select public.m3_review($1,$2,$3,$4,$5)',[c.id,4,'verified_manual','alternative_completed',null]);
const result=await rpc('m3_review',[c.id,4,'verified_manual','alternative_completed',true]);eq(result.method,'mock');
await actor(A,S1);const assertions=await rpc('m3_assertions');eq(assertions.length,1);eq(assertions[0].method,'mock');
assert.ok(!JSON.stringify(assertions).includes('object_key'));checks++;
await denied('select public.m3_share($1,$2)',[result.assertion_id,AY.id]); // no fresh target consent
await rpc('m3_consent',[AY.id,'identity-v1',true]);
const share=await rpc('m3_share',[result.assertion_id,AY.id]);eq(share.state,'awaiting_review');
eq((await rpc('m3_shares')).length,1);
await actor(HM,HS,'aal2');await denied('select public.m3_review($1,$2,$3,$4,$5)',[share.case_id,0,'verified_manual','review_completed',true]);
await actor(OTHER,OS,'aal2');eq((await rpc('m3_cases',[true]))[0].shared_assertion.id,result.assertion_id);
const child=await rpc('m3_review',[share.case_id,0,'verified_manual','review_completed',true]);eq(child.method,'mock');
await db.exec('reset role');eq((await db.query("select kerja_private.m2_requirements_met($1,'identity') valid",[AY.id])).rows[0].valid,true);
await actor(A,S1);await rpc('m3_revoke',[share.id,'sharing']);
await db.exec('reset role');eq((await db.query("select kerja_private.m2_requirements_met($1,'identity') valid",[AY.id])).rows[0].valid,false);
eq((await db.query("select kerja_private.m2_requirements_met($1,'identity') valid",[AX.id])).rows[0].valid,true);
await actor(A,S1);await denied('select public.m3_share($1,$2)',[child.assertion_id,AX.id]); // derived assertions cannot chain
await rpc('m3_revoke',[AX.id,'consent']);eq(await rpc('m3_document',[c.id]),null);
eq((await db.query('select id from public.m1_profiles')).rows.length,1);
await db.exec('reset role');eq((await db.query("select kerja_private.m2_requirements_met($1,'identity') valid",[AX.id])).rows[0].valid,false);
// Overdue deletion blocks capture; service-only lease/completion is token checked.
await actor(A,S1);await denied('select public.m3_cleanup_claim($1)',[crypto.randomUUID()]);
await rpc('m3_consent',[AX.id,'identity-v1',true]);await rpc('m3_start',[AX.id,'mykad',true]);
await denied('select public.m3_upload_intent($1,$2)',[c.id,crypto.randomUUID()]); // overdue identity object blocks new capture
await db.exec('reset role');await db.exec('set role service_role');const lease=crypto.randomUUID();const due=await rpc('m3_cleanup_claim',[lease]);eq(due.id,DOC);
eq(await rpc('m3_cleanup_complete',[DOC,crypto.randomUUID()]),false);
eq(await rpc('m3_cleanup_claim',[crypto.randomUUID()]),null);
eq(await rpc('m3_cleanup_complete',[DOC,lease]),true);
eq(await rpc('m3_cleanup_complete',[DOC,lease]),false);
eq((await db.query('select object_deleted from kerja_private.identity_deletion_ledger where document_id=$1',[DOC])).rows[0].object_deleted,true);
// Expired source assertion cannot be reused; unassigned reviewer loses raw access.
await db.exec('reset role');await db.query("update kerja_private.identity_assertions set expires_at=now()-interval '1 second' where id=$1",[result.assertion_id]);
await db.query('update kerja_private.identity_assertions set revoked_at=null where id=$1',[result.assertion_id]);
await actor(A,S1);await denied('select public.m3_share($1,$2)',[result.assertion_id,AY.id]);
await db.exec('reset role');await db.query('update kerja_private.identity_reviewers set active=false where user_id=$1',[OTHER]);
await actor(OTHER,OS,'aal2');eq((await rpc('m3_cases',[true])).length,0);
await db.close();console.log(`M3 SQL gate: ${checks} synthetic PostgreSQL assertions passed`);
