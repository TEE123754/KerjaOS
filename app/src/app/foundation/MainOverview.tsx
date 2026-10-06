import {ArrowUpRight, BriefcaseBusiness, CalendarDays, ClipboardList, Users} from 'lucide-react';
import {dayKey} from './BentoElements';
import type {HRContext} from './hrDemo';

export type RecruitmentSnapshot = {
  jobs: {id:string;title:string;active?:boolean;published?:boolean}[];
  rows: {id:string;stage:string;status:string}[];
  total:number;
};
export type OverviewData = ReturnType<typeof summarizeWorkspace>;
const terminal = new Set(['rejected','withdrawn','job_closed','hired','accepted']);
export function summarizeWorkspace(hr:HRContext|null, recruitment:RecruitmentSnapshot|null) {
  const today=dayKey(new Date());
  const staff=!!hr?.hr;
  const own=new Set(hr?.mine.map(e=>e.id)||[]);
  const active=new Set(hr?.employees.filter(e=>e.state==='active').map(e=>e.id)||[]);
  const tasks=hr?.tasks.filter(t=>!t.completed&&hr.employees.some(e=>e.id===t.employee_id&&e.state!=='ended'))||[];
  const pendingTime=hr?.times.filter(t=>t.state==='submitted'&&active.has(t.employee_id)&&(!staff||!own.has(t.employee_id)))||[];
  const pendingLeave=hr?.leaves.filter(t=>t.state==='pending'&&active.has(t.employee_id)&&(!staff||!own.has(t.employee_id)))||[];
  const month=hr?.loaded_month||today.slice(0,7);
  const payroll=hr?.payroll_admin?hr.payroll.filter(p=>p.period===month&&['draft','approved'].includes(p.state)&&active.has(p.employee_id)):[];
  const ongoing=recruitment?.rows.filter(r=>!terminal.has(r.status))||[];
  const resume=ongoing.filter(r=>['P0','P1'].includes(r.stage));
  const decision=ongoing.filter(r=>r.stage==='P5');
  const stages=Array.from({length:7},(_,i)=>({stage:'P'+i,count:ongoing.filter(r=>r.stage==='P'+i).length}));
  const events=hr?.events.filter(e=>new Date(e.ends_at).getTime()>Date.now()).sort((a,b)=>a.starts_at.localeCompare(b.starts_at))||[];
  return {month,hrAvailable:!!hr?.companies.length,recruitmentAvailable:recruitment!==null,staff,payrollAdmin:!!hr?.payroll_admin,
    company:hr?.companies.find(c=>c.id===hr.company_id)?.name||hr?.companies[0]?.name,
    employees:active.size,joining:hr?.employees.filter(e=>e.state==='invited').length||0,
    tasks:tasks.length,overdue:tasks.filter(t=>t.due&&t.due<today).length,
    time:pendingTime.length,leave:pendingLeave.length,payroll:payroll.length,
    ongoing:ongoing.length,resume:resume.length,decisions:decision.length,
    loaded:recruitment?.rows.length||0,total:recruitment?.total||0,
    roles:recruitment?.jobs.filter(j=>j.active!==false&&j.published!==false).length||0,
    stages,events:events.slice(0,4),eventCount:events.length};
}

// Only summarize the already authorized records in the current workspace.
export function workspaceAnswer(question:string,locale:'en'|'ms',data:OverviewData):string|null {
  const q=question.toLowerCase();
  if(!/overview|summary|statistic|management|onboard|timesheet|leave|payroll|employee|team|gambaran|ringkasan|pengurusan|cuti|gaji|pekerja/.test(q))return null;
  if(/\b(approve|reject|hire|accept|send|update|change|delete|pay|lulus|tolak|ubah|hantar)\b/.test(q))return locale==='ms'?'Pembantu hanya membaca. Buka alat yang berkaitan untuk tindakan manusia.':'The assistant is read-only. Open the relevant workspace for a human action.';
  const hr=data.hrAvailable?(locale==='ms'?`${data.employees} pekerja aktif, ${data.joining} menyertai, ${data.tasks} tugas belum selesai; ${data.time} rekod masa dan ${data.leave} permohonan cuti ${data.staff?'untuk semakan berasingan':'menunggu semakan'}.`:`${data.employees} active employees, ${data.joining} joining, ${data.tasks} unfinished tasks; ${data.time} timesheets and ${data.leave} leave requests ${data.staff?'await separate review':'await review'}.`):(locale==='ms'?'Data pengurusan belum tersedia.':'Management data is not available yet.');
  const hiring=data.recruitmentAvailable?(locale==='ms'?`${data.roles} jawatan terbuka dan ${data.ongoing} permohonan sedang berjalan dalam ${data.loaded} rekod dimuatkan.`:`${data.roles} open roles and ${data.ongoing} ongoing applications among ${data.loaded} loaded records.`):(locale==='ms'?'Data pengambilan belum tersedia.':'Recruitment data is not available yet.');
  return [hr,data.payrollAdmin?(locale==='ms'?`${data.payroll} rekod gaji memerlukan semakan atau pengeluaran.`:`${data.payroll} payroll records await review or issue.`):'',hiring,locale==='ms'?'Ringkasan data dibenarkan yang sedang dimuatkan; bukan jumlah seluruh syarikat.':'Summary of currently loaded authorized data; not a company-wide census.'].filter(Boolean).join(' ');
}

export function MainOverview({data,locale,recruiter,onManagement,onRecruitment}:{data:OverviewData;locale:'en'|'ms';recruiter:boolean;onManagement:(view:string)=>void;onRecruitment:()=>void}) {
  const ms=locale==='ms';const t=(en:string,bm:string)=>ms?bm:en;
  const metrics=[
    [t('Open roles','Jawatan terbuka'),data.roles,data.recruitmentAvailable,BriefcaseBusiness],
    [t('Ongoing applications','Permohonan sedang berjalan'),data.ongoing,data.recruitmentAvailable,ClipboardList],
    [t('Active employees','Pekerja aktif'),data.employees,data.hrAvailable,Users],
    [t('Joining company','Menyertai syarikat'),data.joining,data.hrAvailable,Users],
    [t('Unfinished onboarding','Onboarding belum selesai'),data.tasks,data.hrAvailable,ClipboardList],
    [t('Upcoming company events','Acara syarikat akan datang'),data.eventCount,data.hrAvailable,CalendarDays],
  ] as const;
  const queue=[
    {name:t(recruiter?'Resume queue':'Applications in early review','Permohonan dalam semakan awal'),count:data.resume,available:data.recruitmentAvailable,go:onRecruitment},
    {name:t(recruiter?'Human decision queue':'Applications at decision stage','Permohonan di peringkat keputusan'),count:data.decisions,available:data.recruitmentAvailable,go:onRecruitment},
    {name:t(data.staff?'Timesheets to review':'My submitted timesheets','Rekod masa menunggu semakan'),count:data.time,available:data.hrAvailable,go:()=>onManagement('Timesheets')},
    {name:t(data.staff?'Leave requests to review':'My pending leave','Permohonan cuti menunggu semakan'),count:data.leave,available:data.hrAvailable,go:()=>onManagement('Leave')},
    {name:t('Overdue onboarding tasks','Tugas onboarding tertunggak'),count:data.overdue,available:data.hrAvailable,go:()=>onManagement('Tasks')},
    ...(data.payrollAdmin?[{name:t('Payroll review / issue','Semakan / pengeluaran gaji'),count:data.payroll,available:true,go:()=>onManagement('Payroll')}]:[]),
  ];
  return <section className="main-overview" aria-label={t('Combined workspace overview','Gambaran gabungan ruang kerja')}>
    <div className="main-overview-heading"><div><small>{t('YOUR WORKSPACE, AT A GLANCE','RUANG KERJA ANDA, SEPINTAS LALU')}</small><h1>{t('Main Overview','Gambaran utama')}</h1><p>{t('Hiring and people operations. See what is moving and what needs attention.','Pengambilan dan pengurusan pekerja. Lihat kemajuan dan perkara yang memerlukan perhatian.')}</p></div><span className="status-badge">{data.company||t('Current access','Akses semasa')}</span></div>
    <p className="overview-scope">{t('Current authorized records only. Recruitment:','Rekod dibenarkan semasa sahaja. Pengambilan:')} {data.recruitmentAvailable?`${data.loaded} / ${data.total}`:t('unavailable','belum tersedia')} {t('loaded. Management uses the current company dashboard records; payroll period:','dimuatkan. Pengurusan menggunakan rekod papan pemuka syarikat semasa; tempoh gaji:')} {data.month}.</p>
    <div className="main-overview-metrics">{metrics.map(([label,count,available,Icon])=><article key={label}><Icon size={20} aria-hidden="true"/><strong>{available?count:'—'}</strong><span>{label}</span>{!available&&<small>{t('Data unavailable','Data belum tersedia')}</small>}</article>)}</div>
    <div className="main-overview-grid">
      <section className="bento-card attention-panel"><div className="section-heading"><h2>{t('Needs attention','Perlu perhatian')}</h2><span>{t('Review queues','Giliran semakan')}</span></div><ul>{queue.map(item=><li key={item.name}><div><strong>{item.name}</strong><small>{item.available?(item.count?t('Open the workspace to review.','Buka ruang kerja untuk semakan.'):t('No pending items in loaded data.','Tiada perkara tertunda dalam data dimuatkan.')):t('Data unavailable.','Data belum tersedia.')}</small></div><span>{item.available?item.count:'—'}</span><button onClick={item.go} aria-label={t('Open '+item.name,'Buka '+item.name)}><ArrowUpRight size={18} aria-hidden="true"/></button></li>)}</ul></section>
      <section className="bento-card overview-pipeline"><h2>{t('Recruitment in motion','Kemajuan pengambilan')}</h2><p>{t('Ongoing applications by phase in the loaded records.','Permohonan sedang berjalan mengikut fasa dalam rekod dimuatkan.')}</p>{data.recruitmentAvailable?<div>{data.stages.map((s,i)=><div key={s.stage}><span>{['Apply / approach','Resume','Identity','Quiz','Background','Decision','Human interview'][i]}</span><div className="overview-phase-track"><span style={{width:(data.ongoing?s.count/data.ongoing*100:0)+'%'}}/></div><strong>{s.count}</strong></div>)}</div>:<p>{t('Recruitment data unavailable. Open Recruitment to check access or refresh.','Data pengambilan belum tersedia. Buka Pengambilan untuk semak akses atau muat semula.')}</p>}<button onClick={onRecruitment}>{t('Open Recruitment','Buka Pengambilan')} <ArrowUpRight size={15} aria-hidden="true"/></button></section>
      <section className="bento-card overview-events"><h2>{t('Coming up','Akan datang')}</h2>{!data.hrAvailable?<p>{t('Company calendar unavailable.','Kalendar syarikat belum tersedia.')}</p>:data.events.length?<ul>{data.events.map(e=><li key={e.id}><CalendarDays size={18} aria-hidden="true"/><div><strong>{e.title}</strong><time dateTime={e.starts_at}>{new Date(e.starts_at).toLocaleString(ms?'ms-MY':'en-MY',{timeZone:'Asia/Kuala_Lumpur',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})} · MYT</time></div></li>)}</ul>:<p>{t('No upcoming company events in loaded data.','Tiada acara syarikat akan datang dalam data dimuatkan.')}</p>}<button onClick={()=>onManagement('Calendar')}>{t('Company calendar','Kalendar syarikat')}</button></section>
    </div>
  </section>;
}
