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
let checks=0;function eq(a,b){assert.deepEqual(a,b);checks++;}
async function actor(id,session){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session,aal:'aal1'})]);await db.exec('set role authenticated');}
async function denied(sql,args=[]){let bad=false;try{await db.query(sql,args);}catch{bad=true;}assert.ok(bad,sql);checks++;}
async function rpc(name,args=[]){return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;}
await actor(A,S1);await rpc('m1_bootstrap_profile');const ax=await rpc('m1_submit_application',[X,crypto.randomUUID()]);await rpc('m1_submit_application',[Y,crypto.randomUUID()]);
await actor(B,S2);await rpc('m1_bootstrap_profile');await rpc('m1_submit_application',[X,crypto.randomUUID()]);
await db.exec('reset role');
await db.query("insert into kerja_private.chat_metadata(actor_id,scope,tool) values($1,'candidate','faq'),($2,'candidate','denied')",[A,B]);
await actor(A,S1);
const sections=['profile','applications','events','consents','documents','practice','quiz','saved','tracking','chat','interviews','identity','background','requests'];
for(const section of sections){const out=await rpc('m9_export',[section,0]);eq(out.section,section);eq(out.next_offset,null);assert.ok(Array.isArray(out.rows));}
eq((await rpc('m9_export',['applications',0])).rows.length,2);
eq((await rpc('m9_export',['chat',0])).rows[0].tool,'faq');
await denied("select public.m9_export('staff_notes',0)");await denied("select public.m9_export('profile',-1)");
const key=crypto.randomUUID(),reason='Erase my private practice and saved jobs';
const req=await rpc('m9_request',['erase_private_workspace',reason,key]);eq(req.state,'pending_review');eq((await rpc('m9_request',['erase_private_workspace',reason,key])).id,req.id);
await denied('select public.m9_request($1,$2,$3)',['erase_account',reason,key]);
await denied('select public.m9_approve_private_erasure($1)',[req.id]);
await denied('select * from kerja_private.privacy_requests');await denied('select * from kerja_private.privacy_erasure_ledger');
await actor(B,S2);eq(await rpc('m9_requests'),[]);eq((await rpc('m9_export',['applications',0])).rows.length,1);
await db.exec('reset role');const snapshot=await db.dumpDataDir();
await db.exec('set role service_role');await rpc('m9_approve_private_erasure',[req.id]);await rpc('m9_approve_private_erasure',[req.id]);
await db.exec('reset role');const ledger=(await db.query('select * from kerja_private.privacy_erasure_ledger')).rows;eq(ledger.length,1);
eq((await db.query('select count(*)::int n from kerja_private.chat_metadata where actor_id=$1',[A])).rows[0].n,0);
eq((await db.query('select count(*)::int n from kerja_private.chat_metadata where actor_id=$1',[B])).rows[0].n,1);
eq((await db.query('select count(*)::int n from public.m1_applications')).rows[0].n,3);
// Cross-runtime encrypted archive restores actual PostgreSQL image and encrypted synthetic object.
const {spawnSync}=await import('node:child_process');
const code=`import sys,json,base64
from cryptography.fernet import Fernet
from app.foundation.recovery import seal,open_archive
x=json.load(sys.stdin);key=Fernet.generate_key();archive=seal(base64.b64decode(x['database']),{'A/resume.enc':b'encrypted synthetic object'},x['ledger'],key);out=open_archive(archive,key);assert out['objects/A/resume.enc']==b'encrypted synthetic object';print(json.dumps({'database':base64.b64encode(out['database.dump']).decode(),'ledger':json.loads(out['deletion-ledger.json'])}))`;
const result=spawnSync('.venv/Scripts/python.exe',['-c',code],{input:JSON.stringify({database:Buffer.from(await snapshot.arrayBuffer()).toString('base64'),ledger}),env:{...process.env,PYTHONPATH:'backend'},encoding:'utf8',maxBuffer:128*1024*1024});
assert.equal(result.status,0,result.stderr);const recovered=JSON.parse(result.stdout);eq(recovered.ledger[0].request_id,req.id);
const restored=new PGlite({loadDataDir:new Blob([Buffer.from(recovered.database,'base64')])});
eq((await restored.query('select count(*)::int n from kerja_private.chat_metadata where actor_id=$1',[A])).rows[0].n,1);
await restored.exec('set role service_role');await restored.query('select public.m9_replay_private_erasure($1,$2)',[ledger[0].owner_id,ledger[0].cutoff]);await restored.exec('reset role');
eq((await restored.query('select count(*)::int n from kerja_private.chat_metadata where actor_id=$1',[A])).rows[0].n,0);
eq((await restored.query('select count(*)::int n from kerja_private.chat_metadata where actor_id=$1',[B])).rows[0].n,1);
await restored.close();
await actor(A,S1);eq((await rpc('m9_requests'))[0].state,'private_workspace_erased');
const account=await rpc('m9_request',['erase_account','Please review full account erasure',crypto.randomUUID()]);await db.exec('reset role; set role service_role');await denied('select public.m9_approve_private_erasure($1)',[account.id]);
await db.exec('reset role');const did=crypto.randomUUID();await db.query("insert into kerja_private.documents(id,owner_id,application_id,object_key,expires_at) values($1,$2,$3,'fixture/tombstone.enc',now())",[did,A,ax.id]);await db.query("update kerja_private.documents set state='deleted',deleted_at=now() where id=$1",[did]);eq((await db.query('select object_key from kerja_private.document_deletion_ledger where document_id=$1',[did])).rows[0].object_key,'fixture/tombstone.enc');
// Narrow synthetic paired check: equal answers/key/rubric, changed names/pronouns in prompt.
const fairness=[];
for(const pair of [['Alex / he','Aina / she'],['Applicant / age 24','Applicant / age 54'],['EN applicant','BM pemohon']]){
 const question=name=>[{id:'q1',kind:'objective',competency:'reasoning',max_points:5,correct:1,prompt:name+': choose the matching technical answer'},{id:'q2',kind:'subjective',competency:'communication',max_points:5,prompt:name+': explain your approach'}];
 const grade=async name=>(await db.query('select kerja_private.m4_grade($1,$2) result',[JSON.stringify(question(name)),JSON.stringify({q1:1,q2:'Synthetic explanation'})])).rows[0].result;
 const left=await grade(pair[0]),right=await grade(pair[1]);eq(left,right);eq(left.earned,5);eq(left.subjective_pending,1);fairness.push({pair,result:'equal_objective_score; subjective_human_review_pending'});
}
const {writeFile}=await import('node:fs/promises');await writeFile('docs/m9/FAIRNESS.json',JSON.stringify({scope:'Three tiny synthetic quiz pairs only; no representative resume ranking/calibration or human bias evaluation; no fairness certification',pairs:fairness},null,2));
await db.exec('set role anon');await denied("select public.m9_export('profile',0)");await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[S1]);await actor(A,S1);await denied('select public.m9_requests()');
await db.close();console.log(`M9 PostgreSQL privacy/encrypted restore/replay gate: ${checks} assertions passed`);
