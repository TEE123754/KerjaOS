import { useEffect, useRef, useState } from 'react';
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
import './foundation.css';

type Me = { id: string; email: string; aal: string; password_recovery: boolean; csrf_token: string; memberships: { role: string; employer_id: string }[] };
type Job = { id: string; title: string; department: string };
type Application = { id: string; job_id: string; stage: string; status: string; version: number };
const words = {
  en: { title: 'Recruitment workspace', login: 'Sign in', logout: 'Sign out', jobs: 'Available roles', applications: 'My applications', apply: 'Apply', empty: 'No applications yet.', email: 'Email', password: 'Password', google: 'Continue with Google', refresh: 'Refresh', resume: 'Upload PDF resume', warning: 'Manual identity and versioned quiz/practice are available for synthetic demos. Background evidence now supports labelled mocks/manual review. Human interview scheduling is available after shortlist and human entry. Required gates remain blocked until valid evidence is supplied.' },
  ms: { title: 'Ruang kerja pengambilan pekerja', login: 'Log masuk', logout: 'Log keluar', jobs: 'Jawatan tersedia', applications: 'Permohonan saya', apply: 'Mohon', empty: 'Belum ada permohonan.', email: 'E-mel', password: 'Kata laluan', google: 'Teruskan dengan Google', refresh: 'Muat semula', resume: 'Muat naik resume PDF', warning: 'Semakan identiti manual serta kuiz/latihan berversi tersedia untuk demo sintetik. Bukti latar belakang kini menyokong mock/semakan manual berlabel. Penjadualan temu duga manusia tersedia selepas senarai pendek dan kemasukan manusia. Syarat wajib kekal disekat sehingga bukti sah dibekalkan.' },
};

export function FoundationWorkspace() {
  const [locale, setLocale] = useState<'en' | 'ms'>('en');
  const [theme,setTheme]=useState<'classic'|'luna'>(()=>{try{return localStorage.getItem('kerjaos-theme')==='luna'?'luna':'classic';}catch{return 'classic';}});
  const [view,setView]=useState(()=>{const v=new URLSearchParams(window.location.search).get('view');return v&&['Reminders','Interviews'].includes(v)?v:'all';});
  useEffect(()=>{document.documentElement.lang=locale;},[locale]);
  const [me, setMe] = useState<Me | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      setApplications(await api<Application[]>('/applications'));
    } catch (error) {
      setMe(null); setApplications([]); setLinks({}); setQr(''); setFactorId(''); setCode('');
      if (!String(error).includes('Sign in')) setMessage(String(error));
    }
    try { setJobs(await api<Job[]>('/jobs')); }
    catch (error) { setJobs([]); setMessage(String(error)); }
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

  return <main className="foundation" data-theme={theme}>
    <div className="brand-strip"><img src="/kerjaos-mark.svg" alt=""/><div><h1>KerjaOS</h1><p>{locale==='ms'?'404 → 200: laluan seterusnya, dengan manusia. Nama sementara.':'404 → 200: your next path, with people. Provisional name.'}</p></div><img src="/kerjaos-mascot.svg" alt={locale==='ms'?'Signal, maskot KerjaOS':'Signal, KerjaOS mascot'}/><label>{locale==='ms'?'Tema':'Theme'}<select aria-label="Desktop theme" value={theme} onChange={e=>{const value=e.target.value as 'classic'|'luna';setTheme(value);try{localStorage.setItem('kerjaos-theme',value);}catch{}}}><option value="classic">Classic</option><option value="luna">Luna</option></select></label></div>
    <section className="foundation-window" aria-label={t.title}>
      <header><strong>KerjaOS — {t.title}</strong><select aria-label="Language / Bahasa" value={locale} onChange={e => setLocale(e.target.value as 'en' | 'ms')}><option value="en">English</option><option value="ms">Bahasa Malaysia</option></select></header>
      <div className="foundation-content">
        <p className="notice">{locale==='ms'?'Demo sintetik sahaja — gunakan data rekaan. Pelepasan awam belum diluluskan.':'Synthetic demo only — use invented data. Public release is not approved.'}</p>
        <p className="notice">{t.warning}</p>
        <p role="status" aria-live="polite">{message}</p>
        {!me ? <form onSubmit={e => { e.preventDefault(); void action(async () => {
          await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
          setPassword(''); await reload();
        }); }}>
          <label>{t.email}<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>{t.password}<input type="password" required minLength={8} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          <button disabled={busy}>{t.login}</button> <a href="/api/v1/auth/google">{t.google}</a>
          <button type="button" disabled={busy || !email} onClick={() => void action(async () => {
            const result = await api<{message: string}>('/auth/recover', {method: 'POST', body: JSON.stringify({email})}); setMessage(result.message);
          })}>Request password recovery</button>
          <p>Use a verified Supabase account. Existing accounts require a verified migration; demo credentials are disabled.</p>
        </form> : <>
          <p>{me.email} <button disabled={busy} onClick={() => void action(async () => {
            await api('/auth/logout', { method: 'POST' }, me.csrf_token); setMe(null); setApplications([]); setLinks({}); setQr(''); setFactorId(''); setCode('');
          })}>{t.logout}</button> <button disabled={busy} onClick={() => void action(reload)}>{t.refresh}</button></p>
          {me.password_recovery && <form onSubmit={e => {e.preventDefault(); void action(async () => {
            await api('/auth/recovery-password', {method: 'POST', body: JSON.stringify({new_password: newPassword})}, me.csrf_token);
            setNewPassword(''); setMe(null); setApplications([]); setLinks({}); setQr(''); setMessage('Password updated. Sign in again.');
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
    {me&&<nav className="taskbar" aria-label="Workspace taskbar">{['all','Applications','Identity','Quiz','Background','Discover','Assistant','Interviews','Privacy','Tracker','Analytics','Reminders'].map(name=><button key={name} aria-pressed={view===name} onClick={()=>setView(name)}>{locale==='ms'?({all:'Semua tetingkap',Applications:'Permohonan',Identity:'Identiti',Quiz:'Kuiz',Background:'Latar belakang',Discover:'Temui',Assistant:'Pembantu',Interviews:'Temu duga',Privacy:'Privasi',Tracker:'Penjejak',Analytics:'Analitik',Reminders:'Peringatan'} as Record<string,string>)[name]:name==='all'?'All windows':name}</button>)}</nav>}
  </main>;

  function documentLinks(id: string, url: string) { return {[id]: url}; }
}
