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

await db.exec(await readFile('supabase/migrations/20261005120000_m12_owned_reminders.sql','utf8'));
const now=Date.now(),due=new Date(now-30000).toISOString(),future=new Date(now+86400000).toISOString();
const edit=(id=null,revision=0,key=crypto.randomUUID(),action='create',origin='personal',ref=null,kind='personal',title='Private task',time=due,zone='Asia/Kuala_Lumpur')=>rpc('m12_edit',[id,revision,key,action,origin,ref,kind,title,time,zone]);
await actor(A,S1);let ctx=await rpc('m12_context',[0]);eq(ctx.policy.enabled,false);eq(ctx.preference.email_opt_in,false);eq(ctx.reminders,[]);
const key=crypto.randomUUID(),r=await edit(null,0,key);eq(r.state,'active');eq((await edit(null,0,key)).id,r.id);eq((await rpc('m12_context',[0])).reminders[0].due,true);eq((await rpc('m12_history',[r.id])).length,1);
await denied('select public.m12_edit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[null,0,key,'create','personal',null,'personal','Different',due,'UTC']);
const linked=await edit(null,0,crypto.randomUUID(),'create','internal',ax.id,'follow_up','Follow up X');const personal=await edit(null,0,crypto.randomUUID(),'create','internal',ax.id,'personal','Personal X');
await actor(B,S2);eq((await rpc('m12_context',[0])).reminders,[]);await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=null where id=$1',[B]);await actor(B,S2);await denied('select public.m12_preference($1,$2,$3)',[true,0,crypto.randomUUID()]);await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=now() where id=$1',[B]);await actor(B,S2);await denied('select public.m12_history($1)',[r.id]);await denied('select public.m12_edit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[r.id,0,crypto.randomUUID(),'complete','personal',null,'personal','',null,'UTC']);await denied('select public.m12_edit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[null,0,crypto.randomUUID(),'create','internal',ax.id,'follow_up','Foreign',due,'UTC']);
await actor(HM,hs,'aal2');eq((await rpc('m12_context',[0])).reminders,[]);await denied('select public.m12_history($1)',[r.id]);
await actor(A,S1);const sk=crypto.randomUUID(),s=await edit(r.id,0,sk,'snooze','personal',null,'personal','',future,'America/New_York');eq(s.revision,1);eq((await edit(r.id,0,sk,'snooze','personal',null,'personal','',future,'America/New_York')).revision,1);eq((await rpc('m12_context',[0])).reminders.find(x=>x.id===r.id).due,false);
await denied('select public.m12_edit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[r.id,0,crypto.randomUUID(),'complete','personal',null,'personal','',null,'UTC']);
const completed=await edit(r.id,1,crypto.randomUUID(),'complete','personal',null,'personal','',null,'UTC');eq(completed.state,'completed');eq((await rpc('m12_history',[r.id])).length,3);
const early=await edit(null,0,crypto.randomUUID(),'create','personal',null,'personal','DST earlier','2026-11-01T01:30:00-04:00','America/New_York'),late=await edit(null,0,crypto.randomUUID(),'create','personal',null,'personal','DST later','2026-11-01T01:30:00-05:00','America/New_York');eq((new Date(late.due_at)-new Date(early.due_at))/1000,3600);
for(const [time,zone] of [[new Date(now-7200000).toISOString(),'UTC'],[new Date(now+400*86400000).toISOString(),'UTC'],[future,'Invalid/Zone']])await denied('select public.m12_edit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[null,0,crypto.randomUUID(),'create','personal',null,'personal','Bad',time,zone]);
const prefKey=crypto.randomUUID();eq((await rpc('m12_preference',[true,0,prefKey])).revision,1);eq((await rpc('m12_preference',[true,0,prefKey])).revision,1);
await denied('select public.m12_preference($1,$2,$3)',[false,0,crypto.randomUUID()]);await denied('select public.m12_enqueue()');await denied('select public.m12_claim($1)',[crypto.randomUUID()]);await denied('select * from kerja_private.reminder_deliveries');
await service();eq(await rpc('m12_enqueue'),2);eq(await rpc('m12_claim',[crypto.randomUUID()]),null);
await db.exec('reset role');eq((await db.query("select count(*)::int n from kerja_private.reminder_deliveries where state='disabled'")).rows[0].n,2);await db.query("update kerja_private.reminder_policy set enabled=true,mode='fixture' where id");
await actor(A,S1);const send=await edit(null,0,crypto.randomUUID(),'create','personal',null,'personal','Fixture due');await service();eq(await rpc('m12_enqueue'),1);const lease=crypto.randomUUID(),claim=await rpc('m12_claim',[lease]);eq(Boolean(claim),true);eq(await rpc('m12_dispatch',[claim.id,crypto.randomUUID()]),null);const beforeDispatch=await db.dumpDataDir();const dispatch=await rpc('m12_dispatch',[claim.id,lease]);eq(dispatch.recipient,'a@example.test');eq(dispatch.mode,'fixture');eq(await rpc('m12_dispatch',[claim.id,lease]),null);eq(await rpc('m12_finish',[claim.id,crypto.randomUUID(),'fixture','synthetic']),false);eq(await rpc('m12_finish',[claim.id,lease,'fixture','synthetic']),true);eq(await rpc('m12_finish',[claim.id,lease,'fixture','synthetic']),false);eq(await rpc('m12_enqueue'),0);
// Opt-out after claim cancels work; dispatch must refuse stale preference.
await actor(A,S1);const opt=await edit(null,0,crypto.randomUUID(),'create','personal',null,'personal','Opt-out due');await service();await rpc('m12_enqueue');const ol=crypto.randomUUID(),oc=await rpc('m12_claim',[ol]);await actor(A,S1);eq((await rpc('m12_preference',[false,1,crypto.randomUUID()])).email_opt_in,false);await service();eq(await rpc('m12_dispatch',[oc.id,ol]),null);
await actor(A,S1);await rpc('m12_preference',[true,2,crypto.randomUUID()]);const uncertain=await edit(null,0,crypto.randomUUID(),'create','personal',null,'personal','Ambiguous due');await service();await rpc('m12_enqueue');const ul=crypto.randomUUID(),uc=await rpc('m12_claim',[ul]);eq(Boolean(await rpc('m12_dispatch',[uc.id,ul])),true);eq(await rpc('m12_finish',[uc.id,ul,'unknown',null]),true);eq(await rpc('m12_claim',[crypto.randomUUID()]),null);eq(await rpc('m12_enqueue'),0);
// Crash after durable dispatch expires to unknown, never leased for retry.
await actor(A,S1);const crash=await edit(null,0,crypto.randomUUID(),'create','personal',null,'personal','Crash due');await service();await rpc('m12_enqueue');const cl=crypto.randomUUID(),cc=await rpc('m12_claim',[cl]);eq(Boolean(await rpc('m12_dispatch',[cc.id,cl])),true);await db.exec('reset role');await db.query("update kerja_private.reminder_deliveries set lease_until=now()-interval '1 minute' where id=$1",[cc.id]);await db.query("update kerja_private.reminder_dispatch_ledger set dispatched_at=now()-interval '3 minutes' where delivery_id=$1",[cc.id]);await service();eq(await rpc('m12_claim',[crypto.randomUUID()]),null);await db.exec('reset role');eq((await db.query('select state from kerja_private.reminder_deliveries where id=$1',[cc.id])).rows[0].state,'unknown');
// Quota reservations persist after forgetting reminders, so deletion cannot reset budget.
await actor(A,S1);const quota=await edit(null,0,crypto.randomUUID(),'create','personal',null,'personal','Quota due');await service();await rpc('m12_enqueue');const ql=crypto.randomUUID(),qc=await rpc('m12_claim',[ql]);eq(await rpc('m12_dispatch',[qc.id,ql]),null);await db.exec('reset role');eq((await db.query('select failure_code from kerja_private.reminder_deliveries where id=$1',[qc.id])).rows[0].failure_code,'quota');
// Global kill switch cancels a claimed dispatch before network send.
await db.query("update kerja_private.reminder_policy set enabled=false where id");await service();eq(await rpc('m12_claim',[crypto.randomUUID()]),null);
// Canonical withdrawal cancels linked follow-up but retains explicit personal task.
await actor(A,S1);await rpc('m2_transition',[ax.id,'withdraw',0,crypto.randomUUID(),'Candidate withdrawal',[]]);ctx=await rpc('m12_context',[0]);eq(ctx.reminders.find(x=>x.id===linked.id).state,'cancelled');eq(ctx.reminders.find(x=>x.id===personal.id).state,'active');
const company=await rpc('m10_company',[null,0,'Private company','',null,'']);const manual=await rpc('m10_manual',[null,0,company.id,'External','','applied',null,'',null,false]);const mr=await edit(null,0,crypto.randomUUID(),'create','manual',manual.id,'follow_up','Manual follow up');const mp=await edit(null,0,crypto.randomUUID(),'create','manual',manual.id,'personal','Manual personal');await rpc('m10_manual',[manual.id,0,company.id,'External','','rejected',null,'',null,false]);eq((await rpc('m12_context',[0])).reminders.find(x=>x.id===mr.id).state,'cancelled');await rpc('m10_forget',['manual',manual.id,1]);eq((await rpc('m12_context',[0])).reminders.some(x=>x.id===mp.id),false);
// M8 confirmation prevents/clears duplicate preparation notices.
const prep=await edit(null,0,crypto.randomUUID(),'create','internal',ay.id,'preparation','Preparation');await db.exec('reset role');await db.query('insert into public.m1_job_assignments values($1,$2)',[HM,Y]);const slot=crypto.randomUUID();await db.query("insert into kerja_private.interview_slots(id,job_id,interviewer_id,starts_at,ends_at,timezone,mode,location,created_by) values($1,$2,$3,now(),now()+interval '1 hour','UTC','online','https://example.test/',$3)",[slot,Y,HM]);await db.query("insert into kerja_private.interview_bookings(application_id,slot_id,state,reason) values($1,$2,'confirmed','Synthetic booking')",[ay.id,slot]);await actor(A,S1);eq((await rpc('m12_context',[0])).reminders.find(x=>x.id===prep.id).state,'cancelled');await denied('select public.m12_edit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[null,0,crypto.randomUUID(),'create','internal',ay.id,'preparation','Duplicate',future,'UTC']);
for(const section of ['reminders','reminder_history','reminder_deliveries','reminder_preferences','analytics_observations','applications'])eq((await rpc('m9_export',[section,0])).section,section);
await actor(B,S2);eq((await rpc('m9_export',['reminders',0])).rows.length,0);
// Unstarted leases can be reclaimed, preflight retry is bounded to three attempts.
await db.exec('reset role');await db.query("update kerja_private.reminder_policy set enabled=true,mode='fixture',global_daily=30,owner_daily=10 where id");await actor(B,S2);await rpc('m12_preference',[true,0,crypto.randomUUID()]);const globalReminder=await edit(null,0,crypto.randomUUID(),'create','personal',null,'personal','Global quota due');await db.exec('reset role');await db.query('update kerja_private.reminder_policy set global_daily=3 where id');await service();await rpc('m12_enqueue');const gl=crypto.randomUUID(),gc=await rpc('m12_claim',[gl]);eq(await rpc('m12_dispatch',[gc.id,gl]),null);await db.exec('reset role');eq((await db.query('select failure_code from kerja_private.reminder_deliveries where id=$1',[gc.id])).rows[0].failure_code,'quota');await db.query('update kerja_private.reminder_policy set global_daily=30 where id');await actor(B,S2);const br=await edit(null,0,crypto.randomUUID(),'create','personal',null,'personal','B due');await service();await rpc('m12_enqueue');let leaseB=crypto.randomUUID(),bc=await rpc('m12_claim',[leaseB]);await db.exec('reset role');await db.query("update kerja_private.reminder_deliveries set lease_until=now()-interval '1 minute' where id=$1",[bc.id]);await service();leaseB=crypto.randomUUID();eq((await rpc('m12_claim',[leaseB])).id,bc.id);eq(await rpc('m12_retry_before_dispatch',[bc.id,leaseB]),true);await db.exec('reset role');await db.query("update kerja_private.reminder_deliveries set next_attempt=now() where id=$1",[bc.id]);await service();leaseB=crypto.randomUUID();eq((await rpc('m12_claim',[leaseB])).id,bc.id);eq(await rpc('m12_retry_before_dispatch',[bc.id,leaseB]),true);await db.exec('reset role');eq((await db.query('select state from kerja_private.reminder_deliveries where id=$1',[bc.id])).rows[0].state,'dead_letter');
// Restore with newest dispatch/optout/removal ledger: no sent occurrence resurrected.
const latest=(await db.query('select * from kerja_private.reminder_dispatch_ledger where reminder_id=$1',[send.id])).rows[0],restored=new PGlite({loadDataDir:beforeDispatch});await restored.query('insert into kerja_private.reminder_dispatch_ledger values($1,$2,$3,$4,$5,$6)',[latest.delivery_id,latest.reminder_id,latest.owner_id,latest.revision,latest.dispatched_at,latest.outcome]);await restored.exec('set role service_role');eq((await restored.query('select public.m12_dispatch($1,$2) result',[claim.id,lease])).rows[0].result,null);eq(await restored.query('select public.m12_enqueue() n').then(x=>x.rows[0].n),0);await restored.query('select public.m12_replay_optout($1,$2)',[A,new Date(Date.now()+1000).toISOString()]);await restored.query('select public.m12_replay_forget($1,$2)',[A,send.id]);await restored.exec('reset role');eq((await restored.query('select count(*)::int n from kerja_private.reminders where id=$1',[send.id])).rows[0].n,0);eq((await restored.query('select outcome from kerja_private.reminder_dispatch_ledger where reminder_id=$1',[send.id])).rows[0].outcome,'fixture');await restored.close();
await actor(A,S1);await edit(r.id,2,crypto.randomUUID(),'forget','personal',null,'personal','',null,'UTC');await db.exec('reset role');eq((await db.query("select count(*)::int n from kerja_private.operation_keys where actor_id=$1 and operation='reminder' and result->>'title'='Private task'",[A])).rows[0].n,0);
// Approved erasure removes reminder text/history but leaves protected dedupe metadata.
await actor(A,S1);const er=await rpc('m9_request',['erase_private_workspace','Erase private reminders please',crypto.randomUUID()]);await service();await rpc('m9_approve_private_erasure',[er.id]);await actor(A,S1);eq((await rpc('m12_context',[0])).reminders.length,0);eq((await rpc('m12_context',[0])).preference.email_opt_in,false);await actor(B,S2);eq((await rpc('m12_context',[0])).reminders.length,2);
await db.exec('reset role');await db.query("update kerja_private.reminders set state='completed',finished_at=now()-interval '91 days' where id=$1",[br.id]);await service();eq(await rpc('m12_cleanup'),1);
await db.exec('reset role;set role anon');await denied('select public.m12_context(0)');await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[S1]);await actor(A,S1);await denied('select public.m12_context(0)');
await db.close();console.log(`M12 PostgreSQL reminders/lifecycle/dispatch/privacy gate: ${checks} assertions passed`);
