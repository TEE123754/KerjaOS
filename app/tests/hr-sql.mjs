// Real offline Postgres authorization/transition gate, synthetic Auth fixtures.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
grant usage on schema auth to authenticated,anon;grant execute on function auth.uid(),auth.jwt() to authenticated,anon;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table public.candidates(email text primary key);`);
for(const name of ['20261002060758_m1_secure_foundation','20261002103658_m2_application_pipeline','20261002110620_m3_identity_review','20261002135810_m4_quiz_practice','20261002150000_m5_background_evidence','20261002160000_m6_scoped_chat','20261003100000_m8_human_interviews','20261006062058_h1_hr_workspace']){
 await db.exec((await readFile('supabase/migrations/'+name+'.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
}
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
const encode=v=>v!==null&&typeof v==='object'?JSON.stringify(v):v;
async function denied(sql,args=[]){let bad=false;try{await db.query(sql,args.map(encode))}catch{bad=true}assert.ok(bad,'Expected denial: '+sql);checks++}
async function rpc(name,...args){return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args.map(encode))).rows[0].result}
const [A,B,HR,PAY,RECRUIT,XHR,C1,C2,J1,J2]=Array.from({length:10},()=>crypto.randomUUID());
const sessions=new Map();
for(const u of [A,B,HR,PAY,RECRUIT,XHR]){const session=crypto.randomUUID();sessions.set(u,session);await db.query('insert into auth.users values($1,$2,now());',[u,u+'@example.test']);await db.query('insert into auth.sessions values($1,$2)',[session,u]);}
await db.query('insert into public.m1_employers values($1,$2),($3,$4)',[C1,'Local fixture company',C2,'Other company']);
await db.query("insert into public.m1_jobs(id,employer_id,title,department,published) values($1,$2,'Engineer','Engineering',true),($3,$4,'Designer','Design',true)",[J1,C1,J2,C2]);
await db.query("insert into kerja_private.hr_grants values($1,$2,'hr',true),($3,$2,'payroll',true),($4,$5,'hr',true)",[HR,C1,PAY,XHR,C2]);
await db.query("insert into public.m1_memberships values($1,$2,'recruiter',true)",[RECRUIT,C1]);
async function actor(u,aal='aal1'){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:u,session_id:sessions.get(u),aal})]);await db.exec('set role authenticated')}
await actor(A);await rpc('m1_bootstrap_profile');const app=await rpc('m1_submit_application',J1,crypto.randomUUID());
await actor(B);await rpc('m1_bootstrap_profile');const other=await rpc('m1_submit_application',J2,crypto.randomUUID());
await actor(A);eq((await rpc('h1_context')).companies.length,0);
// Service fixture represents canonical M8 completion, not an application/shortlist.
await db.exec('reset role');await db.query("update public.m1_applications set final_outcome='offer',offer_accepted_at=now() where id=$1",[app.id]);
await actor(A);eq((await rpc('h1_context')).companies.length,0);
await db.exec('reset role');await db.query("update public.m1_applications set status='hired',final_outcome='hired' where id=$1",[app.id]);
await db.query("update public.m1_applications set offer_accepted_at=now(),status='hired',final_outcome='hired' where id=$1",[other.id]);
await actor(A);let context=await rpc('h1_context');eq(context.mine[0].state,'invited');eq(context.employees.length,1);const emp=context.mine[0].id;
const cmd=(action,fields={})=>({action,employee_id:emp,expected_revision:0,idempotency_key:crypto.randomUUID(),...fields});
await denied('select public.h1_context($1,$2)',[C2,'']);await denied('select * from kerja_private.hr_employees');
const join=cmd('join');eq((await rpc('h1_command',join)).state,'active');eq((await rpc('h1_command',join)).state,'active');
await denied('select public.h1_command($1)',[{...join,title:'Changed replay'}]);
await denied('select public.h1_command($1)',[cmd('time_create',{day:'2026-10-06',minutes:10,title:'x'.repeat(5000)})]);
await denied('select public.h1_command($1)',[cmd('task_create',{title:'Bad\ntext'})]);
context=await rpc('h1_context');eq(context.tasks.length,4);eq(context.mine[0].revision,1);
const task=context.tasks[0];eq((await rpc('h1_command',cmd('task_complete',{id:task.id,completed:true}))).completed,true);
await denied('select public.h1_command($1)',[cmd('task_complete',{id:task.id,completed:false})]);
const today=(await db.query("select (now() at time zone 'Asia/Kuala_Lumpur')::date::text d")).rows[0].d;
const t=await rpc('h1_command',cmd('time_create',{day:today,minutes:60,title:'Work'}));eq(t.state,'draft');
await denied('select public.h1_command($1)',[cmd('time_create',{day:'2099-01-01',minutes:60})]);
await denied('select public.h1_command($1)',[cmd('time_create',{day:today,minutes:1440})]);
eq((await rpc('h1_command',cmd('time_submit',{id:t.id}))).state,'submitted');
await denied('select public.h1_command($1)',[cmd('time_approve',{id:t.id,expected_revision:1})]);
await actor(HR);eq((await rpc('h1_context')).companies.length,0);
await actor(HR,'aal2');eq((await rpc('h1_context')).hr,true);eq((await rpc('h1_context')).payroll_admin,false);
eq((await rpc('h1_command',cmd('time_approve',{id:t.id,expected_revision:1}))).state,'approved');
await denied('select public.h1_command($1)',[cmd('time_reject',{id:t.id,expected_revision:1})]);
await actor(A);const leave=await rpc('h1_command',cmd('leave_create',{day:today,end_day:today,leave_kind:'annual',reason:'Annual leave'}));
await denied('select public.h1_command($1)',[cmd('leave_create',{day:today,end_day:today,leave_kind:'annual',reason:'Overlap'})]);
await denied('select public.h1_command($1)',[cmd('leave_approve',{id:leave.id})]);
await actor(HR,'aal2');eq((await rpc('h1_command',cmd('leave_approve',{id:leave.id}))).state,'approved');
const salary=cmd('payroll_save',{period:today.slice(0,7),base_cents:485000,allowance_cents:30000,deduction_cents:50000});
await denied('select public.h1_command($1)',[salary]);
await actor(RECRUIT,'aal2');eq((await rpc('h1_context')).companies.length,0);await denied('select public.h1_command($1)',[salary]);
await actor(PAY,'aal2');const pay=await rpc('h1_command',salary);const payrollContext=await rpc('h1_context');eq(payrollContext.times.length,1);eq(payrollContext.leaves.length,1);eq(payrollContext.leaves[0].reason,undefined);eq(pay.net_cents,465000);eq((await rpc('h1_command',salary)).id,pay.id);
await denied('select public.h1_command($1)',[cmd('payroll_save',{period:today.slice(0,7),base_cents:100,allowance_cents:0,deduction_cents:0})]);
await denied('select public.h1_command($1)',[cmd('payroll_save',{period:'2026-13',base_cents:100,allowance_cents:0,deduction_cents:0})]);
await denied('select public.h1_command($1)',[cmd('payroll_save',{period:'2027-01',base_cents:100,allowance_cents:0,deduction_cents:101})]);
await actor(A);eq((await rpc('h1_context')).payroll.length,0);
await actor(HR,'aal2');eq((await rpc('h1_context')).payroll.length,0);
await actor(PAY,'aal2');eq((await rpc('h1_command',cmd('payroll_approve',{id:pay.id}))).state,'approved');
await denied('select public.h1_command($1)',[{...salary,id:pay.id,expected_revision:1,idempotency_key:crypto.randomUUID()}]);
eq((await rpc('h1_command',cmd('payroll_issue',{id:pay.id,expected_revision:1}))).state,'issued');
await actor(A);eq((await rpc('h1_context')).payroll[0].net_cents,465000);
await db.exec('reset role');await db.query("insert into kerja_private.hr_grants values($1,$2,'payroll',true)",[A,C1]);
await actor(A,'aal2');await denied('select public.h1_command($1)',[cmd('payroll_approve',{id:pay.id,expected_revision:2})]);
await actor(B);await denied('select public.h1_command($1)',[cmd('task_complete',{id:task.id,completed:true,expected_revision:1})]);
await actor(XHR,'aal2');await denied('select public.h1_context($1,$2)',[C1,'']);await denied('select public.h1_command($1)',[cmd('task_create',{title:'Wrong company'})]);
await actor(HR,'aal2');const event=await rpc('h1_command',cmd('event_create',{title:'Team session',starts_at:today+'T09:00:00+08:00',ends_at:today+'T10:00:00+08:00'}));eq(event.title,'Team session');
await denied('select public.h1_command($1)',[cmd('event_create',{title:'Invalid event',starts_at:today+'T09:00:00',ends_at:today+'T10:00:00'})]);
await denied('select public.h1_command($1)',[cmd('event_create',{title:'Too long',starts_at:today+'T09:00:00Z',ends_at:today+'T14:00:00Z'})]);
// Revoked privilege cannot replay a cached payroll result.
await db.exec('reset role');await db.query("update kerja_private.hr_grants set active=false where user_id=$1",[PAY]);
await actor(PAY,'aal2');await denied('select public.h1_command($1)',[salary]);
await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[sessions.get(A)]);
await actor(A);await denied('select public.h1_context()');await denied('select public.h1_command($1)',[join]);
await db.exec('reset role');await db.query('insert into auth.sessions values($1,$2)',[sessions.get(A),A]);
await actor(HR,'aal2');eq((await rpc('h1_command',cmd('employment_end',{expected_revision:1,reason:'Reviewed fixture offboarding'}))).state,'ended');
await actor(A);eq((await rpc('h1_context')).companies.length,0);
await actor(A,'aal2');eq((await rpc('h1_context')).companies.length,1); // Independent MFA staff grant remains, not employment access.
await denied('select public.h1_command($1)',[cmd('time_create',{day:today,minutes:60})]);
await db.exec('reset role');await db.query('delete from kerja_private.hr_grants where user_id=$1',[A]);
await actor(A);eq((await rpc('h1_context')).companies.length,0);
await db.exec('reset role');eq((await db.query("select reason from kerja_private.hr_audit where action='employment_end'")).rows[0].reason,'Reviewed fixture offboarding');
eq((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kerja_private' and c.relname like 'hr_%' and c.relkind='r' and c.relrowsecurity")).rows[0].n,8);
await db.exec('set role anon');await denied('select public.h1_context()');await denied('select public.h1_command($1)',[join]);
console.log(`H1 Postgres gate: ${checks} assertions passed (hosted activation not performed)`);await db.close();
