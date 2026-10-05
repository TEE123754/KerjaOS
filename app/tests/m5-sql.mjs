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
let checks=0;
function eq(a,b){assert.deepEqual(a,b);checks++;}
const encode=v=>v!==null&&typeof v==='object'?JSON.stringify(v):v;
async function actor(id,session,aal='aal1'){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session,aal})]);await db.exec('set role authenticated');}
async function denied(sql,args=[]){let bad=false;try{await db.query(sql,args.map(encode));}catch{bad=true;}assert.ok(bad,sql);checks++;}
async function rpc(name,args=[]){return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args.map(encode))).rows[0].result;}
async function service(){await db.exec('reset role');await db.exec('set role service_role');}
const HS=crypto.randomUUID(),OS=crypto.randomUUID();await db.query('insert into auth.sessions values($1,$2),($3,$4)',[HS,HM,OS,OTHER]);
await db.query("update public.m1_jobs set policy=policy||'{\"required_identity\":false,\"required_quiz\":false}'::jsonb");
const policy=[{kind:'ctos_basic',provider:'mock',necessity:'Synthetic role-specific necessity test',exception_allowed:false},{kind:'ccris',provider:'manual',necessity:'Synthetic role-specific necessity test',exception_allowed:false},{kind:'criminal',provider:'official',necessity:'Synthetic role-specific necessity test',exception_allowed:true}];
await actor(A,S1);await denied('select public.m5_configure($1,$2)',[X,policy]);
await actor(HM,HS);await denied('select public.m5_configure($1,$2)',[X,policy]);
await actor(HM,HS,'aal2');await denied('select public.m5_configure($1,$2)',[X,policy]);
await denied('select public.m5_configure($1,$2)',[Y,[]]);
await db.exec('reset role');await db.query("update public.m1_memberships set role='admin' where user_id=$1",[HM]);await actor(HM,HS,'aal2');
await denied('select public.m5_configure($1,$2)',[X,[{...policy[0],legal_approved:true}]]);
await denied('select public.m5_configure($1,$2)',[X,[{...policy[0],necessity:'short'}]]);
await denied('select public.m5_configure($1,$2)',[X,[policy[0],policy[0]]]);
eq((await rpc('m5_configure',[X,policy])).legal_approved,false);
await actor(A,S1);await rpc('m1_bootstrap_profile');const AX=await rpc('m1_submit_application',[X,crypto.randomUUID()]);
eq((await rpc('m5_applications',[false]))[0].background_policy.checks.length,3);
await denied('select public.m5_consent($1,$2,$3,$4)',[AX.id,'ctos_basic','background-ctos_basic-v1',true]);
await db.exec('reset role');await db.query("update public.m1_applications set stage='P4',status='under_review' where id=$1",[AX.id]);
await actor(A,S1);await denied('select public.m5_start($1,$2,$3,$4,$5)',[AX.id,'ctos_basic',crypto.randomUUID(),true,'ambiguous']);
for(const agree of [false,null])await denied('select public.m5_consent($1,$2,$3,$4)',[AX.id,'ctos_basic','background-ctos_basic-v1',agree]);
await denied('select public.m5_consent($1,$2,$3,$4)',[AX.id,'ctos_basic','background-ccris-v1',true]);
const consent=await rpc('m5_consent',[AX.id,'ctos_basic','background-ctos_basic-v1',true]);eq((await rpc('m5_consent',[AX.id,'ctos_basic','background-ctos_basic-v1',true])).id,consent.id);
await denied('select public.m5_start($1,$2,$3,$4,$5)',[AX.id,'ccris',crypto.randomUUID(),true,'ambiguous']);
await denied('select public.m5_start($1,$2,$3,$4,$5)',[AX.id,'ctos_basic',crypto.randomUUID(),false,'ambiguous']);
const key=crypto.randomUUID();let ctos=await rpc('m5_start',[AX.id,'ctos_basic',key,true,'ambiguous']);eq(ctos.state,'queued');eq((await rpc('m5_start',[AX.id,'ctos_basic',key,true,'ambiguous'])).id,ctos.id);
await denied('select public.m5_start($1,$2,$3,$4,$5)',[AX.id,'ctos_basic',key,true,'consistent']);
await denied('select * from kerja_private.background_cases');await denied('select * from kerja_private.background_disputes');
await actor(B,S2);eq((await rpc('m5_cases',[false])).length,0);await denied('select public.m5_revoke($1)',[ctos.id]);
await denied('select public.m5_claim_user($1,$2)',[ctos.id,crypto.randomUUID()]);
await actor(HM,HS);await denied('select public.m5_claim_user($1,$2)',[ctos.id,crypto.randomUUID()]);
await actor(HM,HS,'aal2');eq((await rpc('m5_cases',[true])).length,1);
const lease=crypto.randomUUID();eq((await rpc('m5_claim_user',[ctos.id,lease])).lease,lease);eq(await rpc('m5_claim_user',[ctos.id,crypto.randomUUID()]),null);
await denied('select public.m5_finish($1,$2,$3)',[ctos.id,lease,'needs_review']);
await service();await denied('select public.m5_finish($1,$2,$3)',[ctos.id,lease,'clear']);await denied('select public.m5_finish($1,$2,$3)',[ctos.id,crypto.randomUUID(),'needs_review']);
eq((await rpc('m5_finish',[ctos.id,lease,'needs_review'])).official,false);eq((await rpc('m5_finish',[ctos.id,lease,'needs_review'])).state,'needs_review');
await actor(A,S1);ctos=(await rpc('m5_cases',[false]))[0];eq(ctos.version,1);eq(ctos.coverage,'synthetic_workflow_only');eq((await db.query('select status from public.m1_applications where id=$1',[AX.id])).rows[0].status,'on_hold');
await rpc('m5_dispute',[ctos.id,1,'Candidate explanation: synthetic ambiguity, review role context.']);
await denied('select public.m5_dispute($1,$2,$3)',[ctos.id,2,'Duplicate open dispute']);
await actor(HM,HS,'aal2');await denied('select public.m2_transition($1,$2,$3,$4,$5,$6)',[AX.id,'reject',1,crypto.randomUUID(),'Reject without review',[AX.id]]);
await denied('select public.m1_human_decision($1,$2,$3,$4,$5)',[AX.id,'rejected','Legacy bypass attempt',1,crypto.randomUUID()]);
await denied('select public.m2_transition($1,$2,$3,$4,$5,$6)',[AX.id,'resume',1,crypto.randomUUID(),'Unresolved explanation',[AX.id]]);
await denied('select public.m5_review($1,$2,$3,$4,$5,$6)',[ctos.id,2,'satisfied','Personally reviewed role necessity',true,false]);
await denied('select public.m5_review($1,$2,$3,$4,$5,$6)',[ctos.id,2,'satisfied','Personally reviewed role necessity',null,true]);
const reviewed=await rpc('m5_review',[ctos.id,2,'satisfied','Personally reviewed role necessity and explanation',true,true]);eq(reviewed.stage_unchanged,true);
eq((await rpc('m2_transition',[AX.id,'resume',1,crypto.randomUUID(),'Explanation considered, human resume',[AX.id]])).status,'under_review');
await db.exec('reset role');eq((await db.query("select kerja_private.m2_requirements_met($1,'credit') valid",[AX.id])).rows[0].valid,false);
await actor(A,S1);await rpc('m5_consent',[AX.id,'ccris','background-ccris-v1',true]);
await denied('select public.m5_start($1,$2,$3,$4,$5)',[AX.id,'ccris',crypto.randomUUID(),false,'consistent']);
let ccris=await rpc('m5_start',[AX.id,'ccris',crypto.randomUUID(),true,'consistent']);eq(ccris.state,'awaiting_document');
const DOC=crypto.randomUUID();eq((await rpc('m5_upload_intent',[ccris.id,DOC])).id,DOC);
await denied('select public.m5_document_ready($1)',[DOC]);eq(await rpc('m5_document',[ccris.id]),null);
await service();await rpc('m5_document_ready',[DOC]);
await actor(B,S2);eq(await rpc('m5_document',[ccris.id]),null);
await actor(OTHER,OS,'aal2');eq(await rpc('m5_document',[ccris.id]),null);
await actor(HM,HS,'aal2');eq((await rpc('m5_document',[ccris.id])).id,DOC);
ccris=(await rpc('m5_cases',[true])).find(c=>c.id===ccris.id);eq(ccris.result_code,'candidate_supplied_unverified');
await rpc('m5_review',[ccris.id,2,'satisfied','Personally reviewed existing synthetic report for role necessity',true,false]);
await db.exec('reset role');eq((await db.query("select kerja_private.m2_requirements_met($1,'credit') valid",[AX.id])).rows[0].valid,true);
await actor(A,S1);await rpc('m5_consent',[AX.id,'criminal','background-criminal-v1',true]);const criminal=await rpc('m5_start',[AX.id,'criminal',crypto.randomUUID(),true,'consistent']);
await actor(HM,HS,'aal2');const cl=crypto.randomUUID();await rpc('m5_claim_user',[criminal.id,cl]);await service();
await denied('select public.m5_finish($1,$2,$3)',[criminal.id,cl,'evidence_consistent']);
eq((await rpc('m5_finish',[criminal.id,cl,'unavailable'])).coverage,'no_check_performed');
await actor(HM,HS,'aal2');await denied('select public.m5_review($1,$2,$3,$4,$5,$6)',[criminal.id,1,'adverse_reviewed','Provider offline is not adverse evidence',true,false]);
await denied('select public.m5_review($1,$2,$3,$4,$5,$6)',[criminal.id,1,'satisfied','Provider offline is not a clear check',true,false]);
await rpc('m5_review',[criminal.id,1,'exception','Approved explicit role policy exception; no check occurred',true,false]);
await db.exec('reset role');eq((await db.query("select kerja_private.m2_requirements_met($1,'criminal') valid",[AX.id])).rows[0].valid,true);
await actor(HM,HS,'aal2');eq((await rpc('m2_transition',[AX.id,'advance',2,crypto.randomUUID(),'Human background evidence reviewed',[AX.id]])).stage,'P5');
eq((await rpc('m2_transition',[AX.id,'shortlist',3,crypto.randomUUID(),'Human decision after required reviews',[AX.id]])).stage,'P6');
await actor(A,S1);ctos=(await rpc('m5_cases',[false])).find(c=>c.kind==='ctos_basic');await rpc('m5_dispute',[ctos.id,ctos.version,'Further explanation after shortlist for reviewer consideration']);
await actor(HM,HS,'aal2');await denied('select public.m2_transition($1,$2,$3,$4,$5,$6)',[AX.id,'interview_entry',5,crypto.randomUUID(),'Unresolved finalist dispute',[AX.id]]);
ctos=(await rpc('m5_cases',[true])).find(c=>c.kind==='ctos_basic');await rpc('m5_review',[ctos.id,ctos.version,'satisfied','Further candidate explanation reviewed against role necessity',true,true]);
await rpc('m2_transition',[AX.id,'resume',5,crypto.randomUUID(),'Human resumes reviewed finalist',[AX.id]]);
eq((await rpc('m2_transition',[AX.id,'interview_entry',6,crypto.randomUUID(),'All required human evidence current',[AX.id]])).status,'interview_ready');
await actor(A,S1);await rpc('m5_revoke',[ccris.id]);eq(await rpc('m5_document',[ccris.id]),null);
await db.exec('reset role');eq((await db.query("select kerja_private.m2_requirements_met($1,'credit') valid",[AX.id])).rows[0].valid,false);
await service();const dl=crypto.randomUUID();eq((await rpc('m5_cleanup_claim',[dl])).id,DOC);eq(await rpc('m5_cleanup_complete',[DOC,crypto.randomUUID()]),false);eq(await rpc('m5_cleanup_complete',[DOC,dl]),true);eq(await rpc('m5_cleanup_complete',[DOC,dl]),false);
eq((await db.query('select object_deleted from kerja_private.background_deletion_ledger where document_id=$1',[DOC])).rows[0].object_deleted,true);
// Separate application: withdrawal cancels work and late results remain quarantined.
await db.exec('reset role');await db.query('insert into public.m1_job_assignments values($1,$2)',[HM,Y]);await actor(HM,HS,'aal2');await rpc('m5_configure',[Y,[policy[0]]]);
await actor(A,S1);const AY=await rpc('m1_submit_application',[Y,crypto.randomUUID()]);await db.exec('reset role');await db.query("update public.m1_applications set stage='P4',status='under_review' where id=$1",[AY.id]);
await actor(A,S1);await rpc('m5_consent',[AY.id,'ctos_basic','background-ctos_basic-v1',true]);const late=await rpc('m5_start',[AY.id,'ctos_basic',crypto.randomUUID(),true,'ambiguous']);
await actor(HM,HS,'aal2');const ll=crypto.randomUUID();await rpc('m5_claim_user',[late.id,ll]);
await actor(A,S1);await rpc('m2_transition',[AY.id,'withdraw',0,crypto.randomUUID(),'Candidate withdrawal before result',[]]);eq((await rpc('m5_cases',[false])).find(c=>c.id===late.id).state,'cancelled');
eq((await db.query("select count(*)::integer n from public.m1_outbox where application_id=$1 and event_type='background_cancelled'",[AY.id])).rows[0].n,1);
await service();eq((await rpc('m5_finish',[late.id,ll,'needs_review'])).state,'quarantined');eq((await rpc('m5_finish',[late.id,ll,'needs_review'])).state,'quarantined');eq((await db.query('select count(*)::integer n from kerja_private.background_late_results where case_id=$1',[late.id])).rows[0].n,1);
// Consent revocation independently cancels a leased request (profile preserved).
await actor(B,S2);await rpc('m1_bootstrap_profile');const BX=await rpc('m1_submit_application',[X,crypto.randomUUID()]);await db.exec('reset role');await db.query("update public.m1_applications set stage='P4',status='under_review' where id=$1",[BX.id]);
await actor(B,S2);await rpc('m5_consent',[BX.id,'ctos_basic','background-ctos_basic-v1',true]);const bc=await rpc('m5_start',[BX.id,'ctos_basic',crypto.randomUUID(),true,'consistent']);
await actor(HM,HS,'aal2');const bl=crypto.randomUUID();await rpc('m5_claim_user',[bc.id,bl]);await actor(B,S2);await rpc('m5_revoke',[bc.id]);
await service();eq((await rpc('m5_finish',[bc.id,bl,'evidence_consistent'])).state,'quarantined');
await actor(B,S2);eq((await db.query('select id from public.m1_profiles')).rows.length,1);
// Expired leases retry exactly three times, then mark unavailable, never adverse.
await rpc('m5_consent',[BX.id,'ctos_basic','background-ctos_basic-v1',true]);const retry=await rpc('m5_start',[BX.id,'ctos_basic',crypto.randomUUID(),true,'ambiguous']);
for(let n=0;n<3;n++){
 await actor(HM,HS,'aal2');eq((await rpc('m5_claim_user',[retry.id,crypto.randomUUID()])).id,retry.id);
 await db.exec('reset role');await db.query("update kerja_private.work_items set lease_until=now()-interval '1 second' where reference_id=$1",[retry.id]);
}
await actor(HM,HS,'aal2');eq(await rpc('m5_claim_user',[retry.id,crypto.randomUUID()]),null);
eq((await rpc('m5_cases',[true])).find(c=>c.id===retry.id).coverage,'no_check_performed');
await denied('select public.m5_review($1,$2,$3,$4,$5,$6)',[retry.id,1,'adverse_reviewed','Retry exhaustion must not become adverse evidence',true,false]);
await db.exec('reset role');eq((await db.query("select count(*)::integer n from public.m1_outbox where application_id=$1 and event_type='background_unavailable'",[BX.id])).rows[0].n,1);
// A human-reviewed concern is not an automatic rejection. Separate evidence/reference/reason required.
await actor(B,S2);await rpc('m5_revoke',[retry.id]);await rpc('m5_consent',[BX.id,'ctos_basic','background-ctos_basic-v1',true]);const adverse=await rpc('m5_start',[BX.id,'ctos_basic',crypto.randomUUID(),true,'consistent']);
await actor(HM,HS,'aal2');const al=crypto.randomUUID();await rpc('m5_claim_user',[adverse.id,al]);await service();await rpc('m5_finish',[adverse.id,al,'evidence_consistent']);
await actor(HM,HS,'aal2');const concern=await rpc('m5_review',[adverse.id,1,'adverse_reviewed','Human assessed a synthetic concern against specific role necessity',true,false]);
eq((await db.query('select status from public.m1_applications where id=$1',[BX.id])).rows[0].status,'under_review');
await denied('select public.m2_transition($1,$2,$3,$4,$5,$6)',[BX.id,'reject',0,crypto.randomUUID(),'Unreferenced concern decision',[BX.id]]);
eq((await rpc('m2_transition',[BX.id,'reject',0,crypto.randomUUID(),'Human role-specific adverse decision after evidence review',[concern.evidence_id]])).status,'rejected');
eq((await rpc('m5_cases',[true])).find(c=>c.id===adverse.id).state,'cancelled');
await actor(B,S2);const BY=await rpc('m1_submit_application',[Y,crypto.randomUUID()]);
await db.exec('reset role');await db.query("update public.m1_applications set stage='P4',status='under_review' where id=$1",[BY.id]);
await actor(B,S2);await rpc('m5_consent',[BY.id,'ctos_basic','background-ctos_basic-v1',true]);
await db.exec('reset role');await db.query('update kerja_private.background_policy set dispatch_enabled=false');
await actor(B,S2);await denied('select public.m5_start($1,$2,$3,$4,$5)',[BY.id,'ctos_basic',crypto.randomUUID(),true,'consistent']);
await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[S2]);await actor(B,S2);await denied('select public.m5_start($1,$2,$3,$4,$5)',[BX.id,'ccris',crypto.randomUUID(),true,'consistent']);eq((await rpc('m5_cases',[false])).length,0);
await db.exec('reset role');await db.exec('set role anon');await denied('select public.m5_cases($1)',[false]);await denied('select public.m5_claim_next($1)',[crypto.randomUUID()]);
console.log(`M5 PostgreSQL gate: ${checks} assertions passed`);await db.close();
