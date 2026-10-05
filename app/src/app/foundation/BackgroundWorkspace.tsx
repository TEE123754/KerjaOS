import {useEffect,useState} from 'react';
import {api} from './api';
type Kind='ctos_basic'|'ccris'|'criminal';
type Check={kind:Kind;provider:'mock'|'manual'|'official';necessity:string;exception_allowed:boolean};
type App={id:string;job_id:string;stage:string;status:string;title:string;background_policy?:{checks:Check[];stage:string;legal_approved:boolean}};
type Case={id:string;application_id:string;kind:Kind;provider:string;synthetic:boolean;state:string;version:number;result_code?:string;coverage:string;expires_at?:string;document_id?:string;review_decision?:string;review_reason?:string;disputes:{id:string;explanation:string;resolved:boolean}[]};
type Policy={official_provider:string;real_capture_enabled:boolean;checks:{kind:Kind;label:string;version:string;text:{en:string;ms:string}}[]};
type Props={jobs:{id:string;title:string}[];locale:'en'|'ms';csrf:string;staff:boolean;admin:boolean;applications:unknown[];reload:()=>Promise<void>};
const labels:Record<Kind,string>={ctos_basic:'CTOS Basic',ccris:'CCRIS',criminal:'Criminal evidence / Bukti jenayah'};
export function BackgroundWorkspace({jobs,locale,csrf,staff,admin,applications,reload}:Props){
 const ms=locale==='ms';const [policy,setPolicy]=useState<Policy|null>(null),[apps,setApps]=useState<App[]>([]),[cases,setCases]=useState<Case[]>([]),[queue,setQueue]=useState<Case[]>([]);
 const [appId,setAppId]=useState(''),[kind,setKind]=useState<Kind>('ctos_basic'),[agree,setAgree]=useState(false),[scenario,setScenario]=useState('ambiguous');
 const [selected,setSelected]=useState<Case|null>(null),[selectedStaff,setSelectedStaff]=useState(false),[reason,setReason]=useState(''),[attested,setAttested]=useState(false),[considered,setConsidered]=useState(false),[decision,setDecision]=useState('satisfied');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[links,setLinks]=useState<Record<string,string>>({}),[jobId,setJobId]=useState(''),[draft,setDraft]=useState<Check[]>([]);
 const app=apps.find(a=>a.id===appId),checks=app?.background_policy?.checks||[],text=policy?.checks.find(c=>c.kind===kind);
 async function load(){try{const [p,a,c]=await Promise.all([api<Policy>('/background/policy'),api<App[]>('/background/applications'),api<Case[]>('/background/cases')]);setPolicy(p);setApps(a);setCases(c);if(staff)setQueue(await api<Case[]>('/background/review-queue'));}catch(e){setMessage(String(e));}}
 useEffect(()=>{void load();},[staff,applications]);
 async function work(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(e){setMessage(String(e));}finally{setBusy(false);}}
 async function changed(){await load();await reload();}
 function choose(c:Case,asStaff=false){setSelectedStaff(asStaff);setSelected(c);setReason('');setAttested(false);setConsidered(false);setDecision('satisfied');}
 function checkDraft(k:Kind,enabled:boolean){setDraft(old=>enabled?[...old,{kind:k,provider:'mock',necessity:'',exception_allowed:false}]:old.filter(c=>c.kind!==k));}
 return <section aria-label={ms?'Bukti latar belakang':'Background evidence'}>
  <h2>{ms?'Semakan latar belakang manual/mock':'Manual/mock background checks'}</h2>
  <p>{ms?'CTOS Basic, CCRIS dan bukti jenayah berasingan. Tiada pelepasan rasmi atau skor kedudukan calon. Penyedia rasmi belum dikonfigurasi; tangkapan laporan sebenar dimatikan.':'CTOS Basic, CCRIS and criminal evidence are separate. No official clearance or candidate ranking score. Official providers are not configured; real report capture is off.'}</p>
  <p role="status">{message}</p>
  <label>{ms?'Permohonan latar belakang':'Background application'}<select value={appId} onChange={e=>{setAppId(e.target.value);setKind(apps.find(a=>a.id===e.target.value)?.background_policy?.checks[0]?.kind||'ctos_basic');setAgree(false);}}><option value="">{ms?'Pilih permohonan P4':'Select a P4 application'}</option>{apps.filter(a=>a.stage==='P4'&&['under_review','on_hold'].includes(a.status)).map(a=><option key={a.id} value={a.id}>{a.title||a.id}</option>)}</select></label>
  <label>{ms?'Jenis semakan':'Check type'}<select value={kind} onChange={e=>{setKind(e.target.value as Kind);setAgree(false);}}>{(checks.length?checks:[{kind:'ctos_basic' as Kind}]).map(c=><option key={c.kind} value={c.kind}>{labels[c.kind]}</option>)}</select></label>
  {app&&checks.length===0&&<p>{ms?'Tiada semakan diperlukan dalam polisi permohonan ini.':'This application policy requires no background checks.'}</p>}
  {checks.find(c=>c.kind===kind)&&<p>{ms?'Keperluan jawatan':'Role necessity'}: {checks.find(c=>c.kind===kind)?.necessity} · {checks.find(c=>c.kind===kind)?.provider}</p>}
  {text&&<p>{text.text[locale]}</p>}
  <label><input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)}/>{ms?'Saya bersetuju untuk semakan dipilih dan majikan ini':'I consent to this selected check and employer'}</label>
  <label>{ms?'Senario demo':'Demo scenario'}<select value={scenario} onChange={e=>setScenario(e.target.value)}><option value="ambiguous">{ms?'Kabur / perlu penjelasan':'Ambiguous / needs explanation'}</option><option value="consistent">{ms?'Bukti sintetik konsisten':'Consistent synthetic evidence'}</option><option value="unavailable">{ms?'Tidak tersedia':'Unavailable'}</option></select></label>
  <button disabled={busy||!appId||!agree||!checks.some(c=>c.kind===kind)||!text} onClick={()=>void work(async()=>{
   await api('/background/consents',{method:'POST',body:JSON.stringify({application_id:appId,kind,version:text!.version,agree})},csrf);
   await api('/background/cases',{method:'POST',body:JSON.stringify({application_id:appId,kind,idempotency_key:crypto.randomUUID(),synthetic:true,scenario})},csrf);
   setAgree(false);await changed();
  })}>{ms?'Benarkan dan minta semakan demo':'Consent and request demo check'}</button>
  <button disabled={busy} onClick={()=>void work(load)}>{ms?'Muat semula bukti':'Refresh background'}</button>
  <ul>{cases.map(c=><li key={c.id}><strong>{labels[c.kind]}</strong> — {c.provider==='mock'?'MOCK / SIMULATION':c.provider==='official'?'NOT CONFIGURED':c.synthetic?'SYNTHETIC MANUAL EVIDENCE':'UNVERIFIED MANUAL EVIDENCE'} · {c.state} · {c.coverage} · {c.result_code}
   {c.expires_at&&<p>{ms?'Luput':'Expires'}: {new Date(c.expires_at).toLocaleString()}</p>}
   {c.review_reason&&<p>{c.review_decision}: {c.review_reason}</p>}
   {c.provider==='manual'&&['awaiting_document','needs_review','on_hold'].includes(c.state)&&<label>{ms?'Muat naik laporan sintetik sedia ada (PDF, 3 MB)':'Upload existing synthetic report (PDF, 3 MB)'}<input type="file" accept="application/pdf" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void work(async()=>{const body=new FormData();body.append('file',file);await api('/background/cases/'+c.id+'/document',{method:'POST',body},csrf);await changed();});e.target.value='';}}/></label>}
   {['needs_review','evidence_consistent','unavailable','reviewed','on_hold'].includes(c.state)&&<button disabled={busy} onClick={()=>choose(c)}>{ms?'Beri penjelasan / pertikaikan':'Explain / dispute'}</button>}
   {c.document_id&&<button disabled={busy} onClick={()=>void work(async()=>{const a=await api<{url:string}>('/background/cases/'+c.id+'/access',{method:'POST'},csrf);setLinks(old=>({...old,[c.id]:a.url}));})}>{ms?'Dapatkan pautan laporan peribadi':'Get private report link'}</button>}
   {links[c.id]&&<a href={links[c.id]} target="_blank" rel="noreferrer">{ms?'Muat turun dalam 60 saat':'Download within 60 seconds'}</a>}
   {c.state!=='cancelled'&&<button disabled={busy} onClick={()=>void work(async()=>{await api('/background/cases/'+c.id+'/revoke',{method:'POST'},csrf);setLinks(old=>{const copy={...old};delete copy[c.id];return copy;});await changed();})}>{ms?'Tarik balik persetujuan semakan':'Revoke check consent'}</button>}
   <ul>{c.disputes.map(d=><li key={d.id}>{d.explanation} — {d.resolved?'reviewed':'awaiting human review'}</li>)}</ul>
  </li>)}</ul>
  {selected&&!selectedStaff&&<form onSubmit={e=>{e.preventDefault();void work(async()=>{await api(`/background/cases/${selected.id}/dispute`,{method:'POST',body:JSON.stringify({expected_version:selected.version,explanation:reason})},csrf);setSelected(null);setReason('');await changed();});}}><h3>{ms?'Penjelasan calon':'Candidate explanation'} — {labels[selected.kind]}</h3><label>{ms?'Penjelasan (elakkan nombor identiti/akaun)':'Explanation (avoid identity/account numbers)'}<textarea required minLength={5} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy}>{ms?'Hantar penjelasan dan tangguh semakan':'Send explanation and hold review'}</button></form>}
  {staff&&<><h3>{ms?'Barisan semakan manusia':'Human background review queue'}</h3><ul>{queue.map(c=><li key={c.id}>{labels[c.kind]} · {c.provider} · {c.state} · {c.coverage}
   {c.state==='queued'&&<button disabled={busy} onClick={()=>void work(async()=>{await api(`/background/cases/${c.id}/process`,{method:'POST'},csrf);await changed();})}>{ms?'Proses item demo tempatan':'Process local demo item'}</button>}
   {['needs_review','evidence_consistent','on_hold','unavailable'].includes(c.state)&&<button disabled={busy} onClick={()=>choose(c,true)}>{ms?'Semak bukti latar belakang':'Review background evidence'}</button>}
   {c.document_id&&<button disabled={busy} onClick={()=>void work(async()=>{const a=await api<{url:string}>(`/background/cases/${c.id}/access`,{method:'POST'},csrf);setLinks(old=>({...old,[c.id]:a.url}));})}>{ms?'Dapatkan pautan laporan untuk semakan':'Get report review link'}</button>}{links[c.id]&&<a href={links[c.id]} target="_blank" rel="noreferrer">Download report</a>}
  </li>)}</ul>
   {selected&&selectedStaff&&<form onSubmit={e=>{e.preventDefault();void work(async()=>{await api(`/background/cases/${selected.id}/review`,{method:'POST',body:JSON.stringify({expected_version:selected.version,decision,reason,attested,explanation_considered:considered})},csrf);setSelected(null);await changed();setMessage(ms?'Semakan direkodkan; sambung/majukan/keputusan ialah tindakan manusia berasingan.':'Review recorded; resume/progression/decision requires a separate human action.');});}}>
    <h3>{ms?'Semakan bukti':'Evidence review'} — {labels[selected.kind]} · {selected.provider} · {selected.coverage}</h3>
    <ul>{selected.disputes.map(d=><li key={d.id}>{d.explanation}</li>)}</ul>
    <label>{ms?'Hasil semakan':'Review outcome'}<select value={decision} onChange={e=>setDecision(e.target.value)}><option value="satisfied">{ms?'Bukti disemak bagi keperluan jawatan':'Evidence reviewed for role requirement'}</option><option value="adverse_reviewed">{ms?'Kebimbangan disemak manusia':'Human reviewed concern'}</option>{admin&&<option value="exception">{ms?'Pengecualian polisi diluluskan':'Approved policy exception'}</option>}</select></label>
    <label>{ms?'Sebab berkaitan jawatan':'Role-related review reason'}<textarea required minLength={15} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <label><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/>{ms?'Saya menyemak bukti; ini bukan pelepasan rasmi atau penalti kedudukan.':'I reviewed the evidence; this is no official clearance or ranking penalty.'}</label>
    <label><input type="checkbox" checked={considered} onChange={e=>setConsidered(e.target.checked)}/>{ms?'Saya mempertimbangkan penjelasan calon.':'I considered the candidate explanation.'}</label><button disabled={busy||!attested||selected.disputes.some(d=>!d.resolved)&&!considered}>{ms?'Rekod semakan manusia':'Record human review'}</button>
   </form>}
   <details><summary>{ms?'Polisi semakan untuk permohonan baharu':'Check policy for new applications'}</summary><form onSubmit={e=>{e.preventDefault();void work(async()=>{await api('/background/policies',{method:'POST',body:JSON.stringify({job_id:jobId,checks:draft})},csrf);setMessage(ms?'Polisi disimpan untuk permohonan baharu sahaja; kelulusan undang-undang kekal dimatikan.':'Policy saved for new applications only; real-data legal activation remains off.');});}}>
    <label>{ms?'Jawatan polisi':'Policy role'}<select required value={jobId} onChange={e=>setJobId(e.target.value)}><option value="">—</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.title}</option>)}</select></label>
    {(Object.keys(labels) as Kind[]).map(k=><fieldset key={k}><legend><label><input type="checkbox" checked={draft.some(c=>c.kind===k)} onChange={e=>checkDraft(k,e.target.checked)}/>{labels[k]}</label></legend>{draft.filter(c=>c.kind===k).map(c=><div key={k}>
     <label>{ms?'Kaedah bukti':'Evidence method'}<select value={c.provider} onChange={e=>setDraft(old=>old.map(x=>x.kind===k?{...x,provider:e.target.value as Check['provider']}:x))}><option value="mock">Mock / simulation</option><option value="manual">Manual existing report</option><option value="official">Official — not configured</option></select></label><label>{ms?'Keperluan dan justifikasi':'Necessity and justification'}<textarea required minLength={15} maxLength={1000} value={c.necessity} onChange={e=>setDraft(old=>old.map(x=>x.kind===k?{...x,necessity:e.target.value}:x))}/></label>
     {admin&&<label><input type="checkbox" checked={c.exception_allowed} onChange={e=>setDraft(old=>old.map(x=>x.kind===k?{...x,exception_allowed:e.target.checked}:x))}/>{ms?'Benarkan pengecualian dengan kelulusan pentadbir':'Allow an exception with admin approval'}</label>}
    </div>)}</fieldset>)}<button disabled={busy||!jobId}>{ms?'Simpan polisi untuk permohonan baharu':'Save policy for new applications'}</button>
   </form></details></>}
 </section>;
}
