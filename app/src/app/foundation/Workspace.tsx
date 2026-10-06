import { useEffect, useRef, useState } from 'react';
import {BriefcaseBusiness} from 'lucide-react';
import {readTheme,persistTheme,type WorkspaceTheme} from './theme';
import { ApplicationDashboard } from './ApplicationDashboard';
import { IdentityWorkspace } from './IdentityWorkspace';
import { QuizWorkspace } from './QuizWorkspace';
import { BackgroundWorkspace } from './BackgroundWorkspace';
import { ChatWorkspace } from './ChatWorkspace';
import { DiscoverWorkspace } from './DiscoverWorkspace';
import { InterviewWorkspace } from './InterviewWorkspace';
import {ReminderWorkspace} from './ReminderWorkspace';
import {AnalyticsWorkspace} from './AnalyticsWorkspace';
import {TrackerWorkspace} from './TrackerWorkspace';
import {PrivacyWorkspace} from './PrivacyWorkspace';
import { DesktopPanel } from './DesktopPanel';
import { api } from './api';
import { DemoWorkspace } from './DemoWorkspace';
import { RecruiterWorkspace } from './RecruiterWorkspace';
import {ProfileWorkspace} from './ProfileWorkspace';
import {HRWorkspace} from './HRWorkspace';
import {WorkspaceModeHeader, type WorkspaceMode} from './WorkspaceModeHeader';
import {MainOverview,summarizeWorkspace,workspaceAnswer,type RecruitmentSnapshot} from './MainOverview';
import {FloatingAssistant} from './FloatingAssistant';
import type {HRContext} from './hrDemo';
import './foundation.css';

type Me = { id: string; email: string; aal: string; password_recovery: boolean; csrf_token: string; memberships: { role: string; employer_id: string }[] };
type Job = { id: string; title: string; department: string };
type Application = { id: string; job_id: string; stage: string; status: string; version: number };
const words = {
  en: { title: 'Recruitment workspace', login: 'Sign in', logout: 'Sign out', jobs: 'Available roles', applications: 'My applications', apply: 'Apply', empty: 'No applications yet.', email: 'Email', password: 'Password', google: 'Continue with Google', refresh: 'Refresh', resume: 'Upload PDF resume', warning: 'Manual identity and versioned quiz/practice are available for synthetic demos. Background evidence now supports labelled mocks/manual review. Human interview scheduling is available after shortlist and human entry. Required gates remain blocked until valid evidence is supplied.' },
  ms: { title: 'Ruang kerja pengambilan pekerja', login: 'Log masuk', logout: 'Log keluar', jobs: 'Jawatan tersedia', applications: 'Permohonan saya', apply: 'Mohon', empty: 'Belum ada permohonan.', email: 'E-mel', password: 'Kata laluan', google: 'Teruskan dengan Google', refresh: 'Muat semula', resume: 'Muat naik resume PDF', warning: 'Semakan identiti manual serta kuiz/latihan berversi tersedia untuk demo sintetik. Bukti latar belakang kini menyokong mock/semakan manual berlabel. Penjadualan temu duga manusia tersedia selepas senarai pendek dan kemasukan manusia. Syarat wajib kekal disekat sehingga bukti sah dibekalkan.' },
};

export function FoundationWorkspace() {
  const [demoRole,setDemoRole]=useState<'candidate'|'recruiter'|'employee'|null>(null);
  const [employeeMode,setEmployeeMode]=useState(false);
  const [overviewMode,setOverviewMode]=useState(false);
  const [hrContext,setHrContext]=useState<HRContext|null>(null);
  const [recruitmentContext,setRecruitmentContext]=useState<RecruitmentSnapshot|null>(null);
  const [hrRequest,setHrRequest]=useState<{view:string;sequence:number}>();
  const [applicationsReady,setApplicationsReady]=useState(false),[jobsReady,setJobsReady]=useState(false);
  const hrIdentity=useRef(''),careerChoice=useRef('');
  const [loginRole,setLoginRole]=useState<'candidate'|'recruiter'|'employee'|'account'>('candidate');
  const [locale, setLocale] = useState<'en' | 'ms'>('en');
  const [theme,setThemeState]=useState<WorkspaceTheme>(readTheme);
  function setTheme(value:WorkspaceTheme){setThemeState(value);persistTheme(value)}
  const [view,setView]=useState(()=>{const v=new URLSearchParams(window.location.search).get('view');return v&&['Reminders','Interviews'].includes(v)?v:'all';});
  useEffect(()=>{document.documentElement.lang=locale;},[locale]);
  const [me, setMe] = useState<Me | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [email, setEmail] = useState('candidate@demo.kerjaos.test');
  const [password, setPassword] = useState('KerjaDemo2026!');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [qr, setQr] = useState('');
  const [links, setLinks] = useState<Record<string, string>>({});
  const [newPassword, setNewPassword] = useState('');
  const pending = useRef(false);
  pending.current = applications.some(a => ['applied','under_review','shortlisted'].includes(a.status));
  const t = words[locale];

  async function reload() {
    try {
      const identity = await api<Me>('/me');
      setMe(identity);
      if(!me&&identity.aal==='aal2'&&identity.memberships.some(m=>['hm','admin','recruiter'].includes(m.role)))setView('Recruiting');
      setApplications(await api<Application[]>('/applications'));setApplicationsReady(true);
      try{const hr=await api<HRContext>('/hr/context');const next=identity.id+':'+hr.mine.map(e=>e.id+':'+e.state).join('|');if(hrIdentity.current!==next){hrIdentity.current=next;setEmployeeMode(careerChoice.current!==identity.id&&hr.mine.some(e=>['invited','active'].includes(e.state)));}}catch{/* HR migration/access pending; recruitment remains available. */}
    } catch (error) {
      setMe(null); setEmployeeMode(false);setOverviewMode(false);setHrContext(null);setRecruitmentContext(null);setApplicationsReady(false);setJobsReady(false); hrIdentity.current='';careerChoice.current=''; setApplications([]); setLinks({}); setQr(''); setFactorId(''); setCode('');
      if (!String(error).includes('Sign in')) setMessage(String(error));
      return;
    }
    try { setJobs(await api<Job[]>('/jobs'));setJobsReady(true); }
    catch (error) { setJobs([]);setJobsReady(false);setMessage(String(error)); }
  }

  useEffect(() => {
    // Delete legacy sensitive client storage, including when opening an old link.
    for (const key of ['candidateSession', 'candidateSessionV1', 'candidateSessionV2', 'candidateSessionV3', 'hiringManagerSession', 'hiringManagerSessionV1']) localStorage.removeItem(key);
    void reload();
  }, []);

  useEffect(() => {
    if (!me) return;
    const onFocus = () => { if(document.visibilityState==='visible') void reload(); };
    window.addEventListener('focus',onFocus);
    let attempts=0;
    const timer=window.setInterval(()=>{
      if(attempts>=6){window.clearInterval(timer);return;}
      if(pending.current && document.visibilityState==='visible'){attempts++;void reload();}
    },15000);
    return ()=>{window.removeEventListener('focus',onFocus);window.clearInterval(timer);};
  },[me?.id]);

  async function action(work: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Operation unavailable'); }
    finally { setBusy(false); }
  }

  function changeWorkspace(mode:WorkspaceMode) {
    if(me)careerChoice.current=mode!=='Management'?me.id:'';
    setOverviewMode(mode==='Main Overview');
    setEmployeeMode(mode==='Management');
  }
  const recruiter=!!me&&me.aal==='aal2'&&me.memberships.some(m=>['hm','admin','recruiter'].includes(m.role));
  const overview=summarizeWorkspace(hrContext,recruiter?recruitmentContext:applicationsReady&&jobsReady?{jobs,rows:applications,total:applications.length}:null);
  function openManagement(next:string){setHrRequest(v=>({view:next,sequence:(v?.sequence||0)+1}));changeWorkspace('Management')}
  function openRecruitment(){setView(recruiter?'Recruiting':'Applications');changeWorkspace('Recruitment')}
  if(demoRole) return <DemoWorkspace role={demoRole==='employee'?'candidate':demoRole} employeeDemo={demoRole==='employee'} locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} onExit={()=>{setDemoRole(null);setMessage('');}}/>;

  return <main className={"foundation"+(me?" portal-shell":"")} data-theme={theme}>
    {me&&<WorkspaceModeHeader mode={overviewMode?'Main Overview':employeeMode?'Management':'Recruitment'} onChange={changeWorkspace} locale={locale}/>}
    {me&&<div hidden={!overviewMode}><MainOverview data={overview} locale={locale} recruiter={recruiter} onManagement={openManagement} onRecruitment={openRecruitment}/></div>}
    {me&&<div hidden={!employeeMode||overviewMode}>
      <HRWorkspace embedded onContext={setHrContext} navigationRequest={hrRequest} key={me.id} csrf={me.csrf_token} theme={theme} setTheme={setTheme} locale={locale}
        onCareer={()=>changeWorkspace('Recruitment')} onExit={()=>void action(async()=>{
          await api('/auth/logout',{method:'POST'},me.csrf_token);setMe(null);setEmployeeMode(false);setOverviewMode(false);setHrContext(null);setRecruitmentContext(null);setApplicationsReady(false);setJobsReady(false);hrIdentity.current='';careerChoice.current='';setApplications([]);setLinks({});setQr('');setFactorId('');setCode('');
        })}/>
      <p role="status" aria-live="polite">{message}</p>
    </div>}
    <div className="recruitment-mode-content" hidden={!!me&&(employeeMode||overviewMode)}>
    <div className="brand-strip"><img src="/kerjaos-mark.svg" alt=""/><div><h1>KerjaOS</h1><p>{locale==='ms'?'Peluang seterusnya bermula di sini.':'Your next opportunity starts here.'}</p></div><img src="/kerjaos-mascot.svg" alt={locale==='ms'?'Signal, maskot KerjaOS':'Signal, KerjaOS mascot'}/><label>{locale==='ms'?'Tema':'Theme'}<select aria-label="Theme" value={theme} onChange={e=>{const value=e.target.value as WorkspaceTheme;setTheme(value)}}><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    {me&&<nav className="portal-tabs global-workspace-tabs" aria-label="Workspace navigation">{['all','HR','Recruiting','Profile','Applications','Interview Results','Identity','Quiz','Background','Discover','Assistant','Interviews','Privacy','Tracker','Analytics','Reminders'].map(name=><button key={name} aria-pressed={view===name} onClick={()=>name==='HR'?changeWorkspace('Management'):setView(name)}>{locale==='ms'?({all:'Semua alat',HR:'Pengurusan HR',Recruiting:'Pengambilan',Profile:'Profil','Interview Results':'Hasil temu duga',Applications:'Permohonan',Identity:'Identiti',Quiz:'Kuiz',Background:'Latar belakang',Discover:'Temui',Assistant:'Pembantu',Interviews:'Temu duga',Privacy:'Privasi',Tracker:'Penjejak',Analytics:'Analitik',Reminders:'Peringatan'} as Record<string,string>)[name]:name==='all'?'All tools':name==='HR'?'Company HR':name}</button>)}</nav>}
    <section className="foundation-window" aria-label={t.title}>
      <header><strong>KerjaOS — {t.title}</strong><select aria-label="Language / Bahasa" value={locale} onChange={e => setLocale(e.target.value as 'en' | 'ms')}><option value="en">English</option><option value="ms">Bahasa Malaysia</option></select></header>
      <div className={'foundation-content'+(!me?' welcome-content':'')}>
        {me&&<p className="notice">{locale==='ms'?'Ruang kerja akaun':'Account workspace'}</p>}
        <p role="status" aria-live="polite">{message}</p>
        {!me ? <><div className="welcome-hero"><div className="welcome-icon"><BriefcaseBusiness size={34} aria-hidden="true"/></div><div><small>A LITTLE CLARITY. A LOT OF POSSIBILITY.</small><h2>{locale==='ms'?'Selamat datang ke KerjaOS':'Good work starts here.'}</h2><p>{locale==='ms'?'Cari peluang. Kenali bakat. Bina masa depan.':'Your next role. Your next great hire. A clearer path to both.'}</p></div><div className="welcome-pills"><span>Track your progress</span><span>Meet your next hire</span></div></div><div className="login-tabs" role="group" aria-label="Sign-in workspace">{(['candidate','recruiter','employee','account'] as const).map(r=><button type="button" key={r} aria-pressed={loginRole===r} onClick={()=>{setLoginRole(r);setEmail(r==='account'?'':r+'@demo.kerjaos.test');setPassword(r==='account'?'':'KerjaDemo2026!');setMessage('');}}>{r==='candidate'?'Candidate demo':r==='recruiter'?'Recruiter demo':r==='employee'?'Employee demo':'My account'}</button>)}</div><form className="login-form" onSubmit={e => { e.preventDefault(); void action(async () => {
          if(email==='candidate@demo.kerjaos.test'||email==='recruiter@demo.kerjaos.test'||email==='employee@demo.kerjaos.test'){if(password!=='KerjaDemo2026!')throw Error('Use the demo password shown below.');setDemoRole(email.startsWith('recruiter')?'recruiter':email.startsWith('employee')?'employee':'candidate');return;}
          await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
          setPassword(''); await reload();
        }); }}>
          <label>{t.email}<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>{t.password}<input type="password" required minLength={8} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          <button disabled={busy}>{t.login}</button> {loginRole==='account'&&<a href="/api/v1/auth/google">{t.google}</a>}
          {loginRole==='account'&&<button type="button" disabled={busy || !email} onClick={() => void action(async () => {
            const result = await api<{message: string}>('/auth/recover', {method: 'POST', body: JSON.stringify({email})}); setMessage(result.message);
          })}>Request password recovery</button>}
          {loginRole==='account'&&<button type="button" disabled={busy||!email||password.length<8} onClick={()=>void action(async()=>{const r=await api<{message:string}>('/auth/signup',{method:'POST',body:JSON.stringify({email,password})});setMessage(r.message);setPassword('');})}>Create account</button>}<div className="demo-account"><strong>{loginRole==='account'?'Your private workspace':'Ready-to-use demo account'}</strong><p>{loginRole==='account'?'Sign in with your verified email.':'Password: KerjaDemo2026! · Sample data · No setup needed'}</p></div>
        </form><div className="welcome-footer"><span>✓ Multi-job tracking</span><span>✓ Guided screening</span><span>✓ Human decisions</span></div></> : <>
          <p>{me.email} <button disabled={busy} onClick={() => void action(async () => {
            await api('/auth/logout', { method: 'POST' }, me.csrf_token); setMe(null); setEmployeeMode(false);setOverviewMode(false);setHrContext(null);setRecruitmentContext(null);setApplicationsReady(false);setJobsReady(false); hrIdentity.current='';careerChoice.current=''; setApplications([]); setLinks({}); setQr(''); setFactorId(''); setCode('');
          })}>{t.logout}</button> <button disabled={busy} onClick={() => void action(reload)}>{t.refresh}</button></p>
          {me.password_recovery && <form onSubmit={e => {e.preventDefault(); void action(async () => {
            await api('/auth/recovery-password', {method: 'POST', body: JSON.stringify({new_password: newPassword})}, me.csrf_token);
            setNewPassword(''); setMe(null); setEmployeeMode(false);setOverviewMode(false);setHrContext(null);setRecruitmentContext(null);setApplicationsReady(false);setJobsReady(false); hrIdentity.current='';careerChoice.current=''; setApplications([]); setLinks({}); setQr(''); setMessage('Password updated. Sign in again.');
          });}}><label>New password<input type="password" minLength={12} required autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label><button disabled={busy}>Set password after verified recovery</button></form>}
          {me.memberships.length > 0 && <fieldset><legend>Staff MFA ({me.aal})</legend>
            <p>Verify your existing authenticator factor, or enroll one for this account.</p>
            <button disabled={busy} onClick={() => void action(async () => {
              const factor = await api<{id: string; totp: {qr_code: string}}>('/auth/mfa/enroll', { method: 'POST' }, me.csrf_token);
              setFactorId(factor.id); setQr(factor.totp.qr_code);
            })}>Enroll authenticator</button>
            {qr && <img alt="Authenticator enrollment QR code" src={qr.startsWith('data:') ? qr : `data:image/svg+xml,${encodeURIComponent(qr)}`} />}
            <label>Factor ID<input value={factorId} onChange={e => setFactorId(e.target.value)} /></label>
            <label>Six-digit code<input inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={e => setCode(e.target.value)} /></label>
            <button disabled={busy || code.length !== 6} onClick={() => void action(async () => {
              await api('/auth/mfa/verify', { method: 'POST', body: JSON.stringify({factor_id: factorId, code}) }, me.csrf_token);
              setCode(''); setQr(''); await reload();
            })}>Verify MFA</button>
          </fieldset>}
          {me.aal==='aal2'&&me.memberships.some(m=>['hm','admin','recruiter'].includes(m.role))&&<DesktopPanel name="Recruiting" locale={locale} hidden={view!=='all'&&view!=='Recruiting'}><RecruiterWorkspace locale={locale} csrf={me.csrf_token} memberships={me.memberships} onSnapshot={setRecruitmentContext}/></DesktopPanel>}
          <DesktopPanel name="Profile" locale={locale} hidden={view!=='all'&&view!=='Profile'}><ProfileWorkspace csrf={me.csrf_token} locale={locale}/></DesktopPanel>
          <h2>{t.jobs}</h2>
          {jobs.length === 0 && <p>No published roles available. The operator must configure jobs; no fake listings are shown.</p>}
          <ul>{jobs.map(job => <li key={job.id}>{job.title} — {job.department} <button disabled={busy || applications.some(a => a.job_id === job.id)} onClick={() => void action(async () => {
            await api('/applications', { method: 'POST', body: JSON.stringify({ job_id: job.id, idempotency_key: crypto.randomUUID() }) }, me.csrf_token);
            await reload();
          })}>{t.apply}</button></li>)}</ul>
          <DesktopPanel locale={locale} name="Applications" hidden={view!=='all' && view!=='Applications'}><ApplicationDashboard key={me.id} applications={applications} jobs={jobs} locale={locale} csrf={me.csrf_token}
            staff={me.aal==='aal2' && me.memberships.some(m=>['hm','admin','recruiter'].includes(m.role))} reload={reload} /></DesktopPanel>
          <DesktopPanel locale={locale} name="Identity" hidden={view!=='all' && view!=='Identity'}><IdentityWorkspace key={'identity-'+me.id} applications={applications} locale={locale} csrf={me.csrf_token}
            reviewer={me.aal==='aal2' && me.memberships.some(m=>['hm','admin','reviewer'].includes(m.role))} reload={reload} /></DesktopPanel>
          <DesktopPanel locale={locale} name="Quiz" hidden={view!=='all' && view!=='Quiz'}><QuizWorkspace key={'quiz-'+me.id} applications={applications} jobs={jobs} locale={locale} csrf={me.csrf_token}
            staff={me.aal==='aal2' && me.memberships.some(m=>['hm','admin'].includes(m.role))} /></DesktopPanel>
          <DesktopPanel locale={locale} name="Interview Results" hidden={view!=="Interview Results"}><QuizWorkspace key={"feedback-"+me.id} applications={applications} jobs={jobs} locale={locale} csrf={me.csrf_token} staff={false}/></DesktopPanel>
          <DesktopPanel locale={locale} name="Background" hidden={view!=='all' && view!=='Background'}><BackgroundWorkspace key={'background-'+me.id} applications={applications} jobs={jobs} locale={locale} csrf={me.csrf_token} reload={reload}
            staff={me.aal==='aal2' && me.memberships.some(m=>['hm','admin'].includes(m.role))} admin={me.aal==='aal2' && me.memberships.some(m=>m.role==='admin')} /></DesktopPanel>
          <DesktopPanel locale={locale} name="Discover" hidden={view!=='all' && view!=='Discover'}><DiscoverWorkspace key={'discover-'+me.id} locale={locale} csrf={me.csrf_token}/></DesktopPanel>
          <DesktopPanel locale={locale} name="Assistant" hidden={view!=='all' && view!=='Assistant'}><ChatWorkspace key={'chat-'+me.id} locale={locale} csrf={me.csrf_token}
            staff={me.aal==='aal2' && me.memberships.some(m=>['hm','admin'].includes(m.role))} /></DesktopPanel>
          <DesktopPanel locale={locale} name="Interviews" hidden={view!=='all' && view!=='Interviews'}><InterviewWorkspace locale={locale} csrf={me.csrf_token} reload={reload} staff={me.aal==='aal2' && me.memberships.some(m=>['hm','admin','reviewer','recruiter'].includes(m.role))}/></DesktopPanel>
          <DesktopPanel locale={locale} name="Tracker" hidden={view!=='all' && view!=='Tracker'}><TrackerWorkspace locale={locale} csrf={me.csrf_token} applications={applications} reload={reload}/></DesktopPanel>
          <DesktopPanel locale={locale} name="Analytics" hidden={view!=='all' && view!=='Analytics'}><AnalyticsWorkspace key={'analytics-'+me.id} locale={locale} staff={me.aal==='aal2' && me.memberships.some(m=>['hm','admin','recruiter'].includes(m.role))}/></DesktopPanel>
          <DesktopPanel locale={locale} name="Reminders" hidden={view!=='all' && view!=='Reminders'}><ReminderWorkspace key={'reminders-'+me.id} locale={locale} csrf={me.csrf_token}/></DesktopPanel>
          <DesktopPanel locale={locale} name="Privacy" hidden={view!=='all' && view!=='Privacy'}><PrivacyWorkspace locale={locale} csrf={me.csrf_token}/></DesktopPanel>
          <p>{locale==='ms'?'Kemas kini pada fokus dan tindakan; semakan automatik dihadkan kepada enam kali setiap sesi.':'Updates on focus and actions; automatic checks are limited to six per session.'}</p>
          <h3>{locale==='ms'?'Resume untuk saringan':'Resumes for screening'}</h3>
          <ul>{applications.filter(a=>['P0','P1'].includes(a.stage) && !['withdrawn','rejected','job_closed'].includes(a.status)).map(application => <li key={application.id}>
            <strong>{jobs.find(j => j.id === application.job_id)?.title || 'Application'}</strong>
            <label>{t.resume}<input type="file" accept="application/pdf" disabled={busy} onChange={e => {
              const file = e.target.files?.[0]; if (!file) return;
              void action(async () => {
                const body = new FormData(); body.append('file', file);
                const document = await api<{id: string}>('/applications/' + application.id + '/resume', { method: 'POST', body }, me.csrf_token);
                const access = await api<{url: string}>('/documents/access', { method: 'POST', body: JSON.stringify({document_id: document.id}) }, me.csrf_token);
                // Link stays in memory, expires in 60 seconds and requires this session.
                setMessage('Resume saved privately. Open it within 60 seconds.');
                const link = documentLinks(application.id, access.url); setLinks(current => ({...current, ...link}));
              });
              e.target.value = '';
            }} /></label>
            {links[application.id] && <a href={links[application.id]} target="_blank" rel="noreferrer">Open private resume</a>}
          </li>)}</ul>
        </>}
      </div>
    </section>
    </div>
    {me&&<FloatingAssistant key={me.id} locale={locale}><ChatWorkspace locale={locale} csrf={me.csrf_token} staff={recruiter} localReply={q=>workspaceAnswer(q,locale,overview)}/></FloatingAssistant>}
  </main>;

  function documentLinks(id: string, url: string) { return {[id]: url}; }
}
