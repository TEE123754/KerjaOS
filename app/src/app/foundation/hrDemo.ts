import {dayKey} from './BentoElements';
export type Employee={id:string;user_id:string;employer_id:string;application_id:string;name:string;title:string;department:string;state:string;start_date:string;revision:number};
export type Task={id:string;employee_id:string;title:string;due:string|null;completed:boolean;revision:number};
export type TimeRow={id:string;employee_id:string;day:string;minutes:number;title:string;state:string;revision:number};
export type LeaveRow={id:string;employee_id:string;day:string;end_day:string;kind:string;reason:string;state:string;revision:number};
export type Payroll={id:string;employee_id:string;period:string;base_cents:number;allowance_cents:number;deduction_cents:number;net_cents:number;state:string;revision:number};
export type HREvent={id:string;employee_id:string;title:string;starts_at:string;ends_at:string};
export type HRContext={loaded_month?:string;company_id?:string;companies:{id:string;name:string}[];employees:Employee[];mine:Employee[];tasks:Task[];times:TimeRow[];leaves:LeaveRow[];payroll:Payroll[];events:HREvent[];hr:boolean;payroll_admin:boolean};
export type Command={action:string;employee_id:string;id?:string;expected_revision?:number;idempotency_key?:string;[name:string]:unknown};
export const emptyHR:HRContext={companies:[],employees:[],mine:[],tasks:[],times:[],leaves:[],payroll:[],events:[],hr:false,payroll_admin:false};
export function demoHR(staff:boolean,invited=false):HRContext{
 const today=dayKey(new Date()),period=today.slice(0,7),start=period+'-01';
 const people:Employee[]=[{id:'employee-farah',user_id:'demo-farah',employer_id:'kerja-studio',application_id:'sample-hired',name:'Farah Ahmad',title:'Frontend Engineer',department:'Engineering',state:invited?'invited':'active',start_date:start,revision:0},{id:'employee-amir',user_id:'demo-amir',employer_id:'kerja-studio',application_id:'sample-amir',name:'Amir Hassan',title:'Product Designer',department:'Design',state:'active',start_date:start,revision:0},{id:'employee-nadia',user_id:'demo-nadia',employer_id:'kerja-studio',application_id:'sample-nadia',name:'Nadia Lim',title:'People Operations Lead',department:'Operations',state:'active',start_date:start,revision:0}];
 const own=staff?people[2]:people[0];const employees=staff?people:[own];
 const tasks:Task[]=employees.flatMap(e=>['Complete employee profile','Review company handbook','Accounts & access','Equipment handover','Meet the team','Set first-month goals','Learning plan','Benefits introduction'].map((title,i)=>({id:e.id+'-task-'+i,employee_id:e.id,title,due:today,completed:i<2,revision:0})));
 const times:TimeRow[]=employees.flatMap(e=>Array.from({length:7},(_,i)=>{const d=new Date(today+'T12:00:00+08:00');d.setUTCDate(d.getUTCDate()-i);return{id:e.id+'-time-'+i,employee_id:e.id,day:dayKey(d),minutes:[342,474,36,66,312,444,408][i],title:'Sample workday',state:i===0?'draft':'approved',revision:0}}));
 return{...emptyHR,company_id:'kerja-studio',companies:[{id:'kerja-studio',name:'Kerja Studio'}],employees,mine:[own],tasks,times:invited?[]:times,leaves:[],payroll:invited?[]:employees.map(e=>({id:e.id+'-pay',employee_id:e.id,period,base_cents:485000,allowance_cents:30000,deduction_cents:50000,net_cents:465000,state:staff?'draft':'issued',revision:0})),events:employees.map((e,i)=>({id:e.id+'-event',employee_id:e.id,title:i===0?'Onboarding session':'Team check-in',starts_at:today+'T'+(i+9)+':00:00+08:00',ends_at:today+'T'+(i+10)+':00:00+08:00'})),hr:staff,payroll_admin:staff};
}
export function editDemoHR(current:HRContext,c:Command):HRContext{
 const data=structuredClone(current),e=data.employees.find(e=>e.id===c.employee_id);if(!e)throw Error('Employee unavailable.');
 if(e.state==='ended')throw Error('Employment has ended.');
 const own=data.mine.some(v=>v.id===e.id),id=c.id||crypto.randomUUID();
 function check<T extends {id:string;employee_id:string;revision:number}>(rows:T[]){const row=rows.find(v=>v.id===id&&v.employee_id===e!.id);if(!row||row.revision!==(c.expected_revision||0))throw Error('Refresh the current revision.');return row}
 switch(c.action){
 case'join':if(!own||e.state!=='invited')throw Error('No company invitation.');e.state='active';e.revision++;data.mine=data.mine.map(v=>v.id===e.id?{...e}:v);break;
 case'task_create':if(!data.hr)throw Error('HR permission required.');data.tasks.push({id,employee_id:e.id,title:String(c.title),due:String(c.day||''),completed:false,revision:0});break;
 case'task_complete':{const row=check(data.tasks);if(!own&&!data.hr)throw Error('Task unavailable.');row.completed=!!c.completed;row.revision++;break}
 case'time_create':if(!Number.isInteger(c.minutes)||Number(c.minutes)<1||Number(c.minutes)>1440||String(c.day)>dayKey(new Date())||data.times.filter(t=>t.employee_id===e.id&&t.day===c.day&&t.state!=='rejected').reduce((n,t)=>n+t.minutes,0)+Number(c.minutes)>1440)throw Error('Use a completed date with at most 24 hours total.');if(!own||e.state!=='active')throw Error('Join your company first.');data.times.push({id,employee_id:e.id,day:String(c.day),minutes:Number(c.minutes),title:String(c.title||'Work session'),state:'draft',revision:0});break;
 case'time_submit':{const row=check(data.times);if(!own||!['draft','rejected'].includes(row.state))throw Error('Only your draft can be submitted.');row.state='submitted';row.revision++;break}
 case'time_approve':case'time_reject':{const row=check(data.times);if(!data.hr||own||row.state!=='submitted')throw Error('A separate HR reviewer must review submitted time.');row.state=c.action==='time_approve'?'approved':'rejected';row.revision++;break}
 case'leave_create':if(!own||e.state!=='active')throw Error('Active employment required.');if(data.leaves.some(l=>l.employee_id===e.id&&['pending','approved'].includes(l.state)&&l.day<=String(c.end_day)&&l.end_day>=String(c.day)))throw Error('Leave dates overlap.');data.leaves.push({id,employee_id:e.id,day:String(c.day),end_day:String(c.end_day),kind:String(c.leave_kind),reason:String(c.reason),state:'pending',revision:0});break;
 case'leave_approve':case'leave_reject':case'leave_withdraw':{const row=check(data.leaves);if(row.state!=='pending'||(c.action==='leave_withdraw'?!own:!data.hr||own))throw Error('Leave reviewer required.');row.state=c.action==='leave_withdraw'?'withdrawn':c.action==='leave_approve'?'approved':'rejected';row.revision++;break}
 case'payroll_save':{if(!data.payroll_admin||Number(c.deduction_cents)>Number(c.base_cents)+Number(c.allowance_cents))throw Error('Payroll permission and valid amounts required.');const row=c.id?check(data.payroll):null;if(row&&row.state!=='draft')throw Error('Approved payroll is locked.');if(!row&&data.payroll.some(p=>p.employee_id===e.id&&p.period===c.period))throw Error('A payroll record already exists for this month.');const next={id,employee_id:e.id,period:String(c.period),base_cents:Number(c.base_cents),allowance_cents:Number(c.allowance_cents),deduction_cents:Number(c.deduction_cents),net_cents:Number(c.base_cents)+Number(c.allowance_cents)-Number(c.deduction_cents),state:'draft',revision:row?row.revision+1:0};if(row)Object.assign(row,next);else data.payroll.push(next);break}
 case'payroll_approve':case'payroll_issue':{const row=check(data.payroll);if(!data.payroll_admin||own||row.state!==(c.action==='payroll_approve'?'draft':'approved'))throw Error('Payroll reviewer required; no self-approval.');row.state=c.action==='payroll_approve'?'approved':'issued';row.revision++;break}
 case'event_create':if(!data.hr)throw Error('HR permission required.');data.events.push({id,employee_id:e.id,title:String(c.title),starts_at:String(c.starts_at),ends_at:String(c.ends_at)});break;
 case'employment_end':if(!data.hr||own)throw Error('Separate HR review required.');e.state='ended';e.revision++;break;
 default:throw Error('Unsupported HR action.');
 }
 return data;
}
