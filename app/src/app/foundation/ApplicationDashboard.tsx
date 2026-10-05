import { useEffect, useState } from 'react';
import { api } from './api';

export type ApplicationRow = { id: string; job_id: string; job_title?: string; stage: string; status: string; version: number; next_action?: string; deadline_at?: string | null; created_at?: string; policy_version?: number };
type Detail = ApplicationRow & { events: {id:string; event_type:string; reason:string; created_at:string}[] };
type Props = { applications: ApplicationRow[]; jobs: {id:string;title:string;department:string}[]; locale:'en'|'ms'; csrf:string; staff:boolean; reload:()=>Promise<void> };
const stages = {
 en:['Apply / approach','Resume screening','Identity review','Quiz interview','Background review','Human decision','Human interview scheduling'],
 ms:['Mohon / pendekatan','Saringan resume','Semakan identiti','Temu duga kuiz','Semakan latar belakang','Keputusan manusia','Penjadualan temu duga manusia'],
};
const actions: Record<string,[string,string]> = {
 await_resume_review:['Await resume review','Menunggu semakan resume'],complete_identity:['Complete identity review','Lengkapkan semakan identiti'],complete_quiz:['Complete quiz interview','Lengkapkan temu duga kuiz'],
 await_background_review:['Await background review','Menunggu semakan latar belakang'],await_human_decision:['Await human decision','Menunggu keputusan manusia'],await_human_review:['Await human review','Menunggu semakan manusia'],schedule_human_interview:['Arrange a real human interview','Atur temu duga dengan manusia'],none:['No action required','Tiada tindakan diperlukan'],
};
export function ApplicationDashboard({applications,jobs,locale,csrf,staff,reload}:Props) {
 const bm=locale==='ms';
 const [rows,setRows]=useState(applications); const [queue,setQueue]=useState<ApplicationRow[]>([]);
 const [filter,setFilter]=useState('all'); const [sort,setSort]=useState('newest'); const [tab,setTab]=useState<'candidate'|'staff'>('candidate');
 const [detail,setDetail]=useState<Detail|null>(null); const [notes,setNotes]=useState<{id:string;note:string}[]>([]);
 const [dialog,setDialog]=useState<{row:ApplicationRow;action:string;key:string}|null>(null);
 const [reason,setReason]=useState(''); const [evidence,setEvidence]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 const [resumeUrl,setResumeUrl]=useState(''); const [more,setMore]=useState(applications.length===50); const [staffMore,setStaffMore]=useState(false);
 async function refreshQueue(){if(staff){const data=await api<ApplicationRow[]>('/staff/queue');setQueue(data);setStaffMore(data.length===50);}}
 useEffect(()=>{setRows(applications);setMore(applications.length===50);void refreshQueue().catch(e=>setError(String(e)));},[applications,staff]);
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get('application'); if(id && /^[a-f0-9-]{36}$/.test(id)) void open(id);},[]);
 async function open(id:string){setBusy(true);setError('');setNotes([]);setResumeUrl('');try{
   const data=await api<Detail>('/applications/'+id);setDetail(data);
   window.history.replaceState(null,'','/foundation?application='+encodeURIComponent(id));
   if(tab==='staff' && staff) setNotes(await api('/staff/applications/'+id+'/notes'));
 }catch(e){setDetail(null);setError(String(e));}finally{setBusy(false);}}
 function start(row:ApplicationRow,action:string){setDialog({row,action,key:crypto.randomUUID()});setReason(action==='withdraw'?(bm?'Saya menarik balik permohonan ini':'I withdraw this application'):'');setEvidence(row.id);setError('');}
 async function submit(){if(!dialog)return;setBusy(true);setError('');try{
   if(dialog.action==='close_job') await api('/staff/jobs/'+dialog.row.job_id+'/close',{method:'POST',body:JSON.stringify({reason,idempotency_key:dialog.key})},csrf);
   else await api('/applications/'+dialog.row.id+'/transitions',{method:'POST',body:JSON.stringify({action:dialog.action,expected_version:dialog.row.version,idempotency_key:dialog.key,reason,evidence_ids:dialog.action==='withdraw'?[]:evidence.split(',').map(v=>v.trim()).filter(Boolean)})},csrf);
   const id=dialog.row.id;setDialog(null);await reload();await refreshQueue();await open(id);
 }catch(e){setError(String(e));}finally{setBusy(false);}}
 const visible=(tab==='staff'?queue:rows).filter(row=>filter==='all'||row.status===filter).sort((a,b)=>sort==='stage'?a.stage.localeCompare(b.stage):sort==='deadline'?(a.deadline_at||'9999').localeCompare(b.deadline_at||'9999'):(b.created_at||'').localeCompare(a.created_at||''));
 const text=(en:string,ms:string)=>bm?ms:en;
 const stage=(s:string)=>s+' · '+(stages[locale][Number(s.slice(1))]||s);
 return <section aria-label={text('Application dashboard','Papan pemuka permohonan')}>
  <h2>{text('My applications','Permohonan saya')}</h2>
  <p>{text('Each application has its own progress. Shortlisted means invited to a human interview; it is not a hiring outcome.','Setiap permohonan mempunyai kemajuan sendiri. Disenarai pendek bermaksud dijemput ke temu duga manusia; belum diambil bekerja.')}</p>
  {staff && <div><button onClick={()=>{setTab('candidate');setDetail(null);setNotes([]);}} aria-pressed={tab==='candidate'}>{text('My applications','Permohonan saya')}</button><button onClick={()=>{setTab('staff');setDetail(null);setNotes([]);}} aria-pressed={tab==='staff'}>{text('Assigned job queue','Barisan jawatan ditugaskan')}</button></div>}
  <label>{text('Status filter','Tapis status')}<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">{text('All','Semua')}</option>{['applied','under_review','on_hold','shortlisted','interview_ready','rejected','withdrawn','job_closed'].map(s=><option key={s}>{s}</option>)}</select></label>
  <label>{text('Sort applications','Susun permohonan')}<select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">{text('Newest','Terbaharu')}</option><option value="stage">{text('Stage','Peringkat')}</option><option value="deadline">{text('Deadline','Tarikh akhir')}</option></select></label>
  <p role="alert">{error}</p>
  <ul>{visible.map(row=><li key={row.id} className="application-card">
   <h3>{row.job_title&&row.job_title!=='Application'?row.job_title:jobs.find(j=>j.id===row.job_id)?.title||text('Application','Permohonan')}</h3>
   <p>{stage(row.stage)} · {row.status}</p><p>{actions[row.next_action||'await_resume_review']?.[bm?1:0]||row.next_action}</p>
   {row.deadline_at && <p>{text('Review / action deadline: ','Tarikh akhir semakan / tindakan: ')}<time dateTime={row.deadline_at}>{new Date(row.deadline_at).toLocaleString(bm?'ms-MY':'en-MY')}</time></p>}
   <a href={'/foundation?application='+row.id} onClick={e=>{e.preventDefault();void open(row.id);}}>{text('View history','Lihat sejarah')}</a> <small>{row.id}</small>
   {tab==='candidate' && !['rejected','withdrawn','hired','job_closed'].includes(row.status) && <button disabled={busy} onClick={()=>start(row,'withdraw')}>{text('Withdraw','Tarik balik')}</button>}
   {tab==='staff' && !['rejected','hired','job_closed'].includes(row.status) && <div>
    {(row.status==='withdrawn'?row.stage==='P0'?['reopen']:[]:row.status==='on_hold'?['resume','reject','note']:row.status==='shortlisted'?['interview_entry','reject','note']:row.status==='interview_ready'?['reject','note']:['advance','pause','skip',...(row.stage==='P5'?['shortlist']:[]),'reject','note']).map(action=><button disabled={busy} key={action} onClick={()=>start(row,action)}>{({advance:text('Advance','Teruskan'),pause:text('Pause','Tangguh'),resume:text('Resume review','Sambung semakan'),skip:text('Policy-approved skip','Langkau mengikut polisi'),shortlist:text('Shortlist for interview','Senarai pendek temu duga'),reject:text('Reject','Tolak'),note:text('Private note','Nota peribadi'),reopen:text('Reopen','Buka semula'),interview_entry:text('Open interview scheduling','Buka penjadualan temu duga')} as Record<string,string>)[action]}</button>)}
   </div>}
  </li>)}</ul>
  {visible.length===0 && <p>{text('No applications in this view.','Tiada permohonan dalam paparan ini.')}</p>}
  {(tab==='staff'?staffMore:more) && <button disabled={busy} onClick={()=>{setBusy(true);void (tab==='staff'?api<ApplicationRow[]>('/staff/queue?offset='+queue.length):api<ApplicationRow[]>('/applications?offset='+rows.length)).then(data=>{if(tab==='staff'){setQueue(q=>[...q,...data]);setStaffMore(data.length===50);}else{setRows(q=>[...q,...data]);setMore(data.length===50);}}).catch(e=>setError(String(e))).finally(()=>setBusy(false));}}>{text('Load more','Muat lagi')}</button>}
  {detail && <section aria-label={text('Application history','Sejarah permohonan')}>
   <h3>{text('Application history','Sejarah permohonan')} · {detail.id}</h3><p>{stage(detail.stage)} · {detail.status} · {text('Policy version','Versi polisi')} {detail.policy_version}</p>
   <ol>{(detail.events||[]).map(event=><li key={event.id}><time>{new Date(event.created_at).toLocaleString(bm?'ms-MY':'en-MY')}</time> · {event.event_type}<p>{event.reason}</p></li>)}</ol>
   {tab==='staff' && staff && <><h4>{text('Private reviewer notes','Nota peribadi penyemak')}</h4><ul>{notes.map(n=><li key={n.id}>{n.note}</li>)}</ul><button disabled={busy} onClick={()=>{void api<{url:string}>('/staff/applications/'+detail.id+'/resume-access',{method:'POST'},csrf).then(r=>setResumeUrl(r.url)).catch(e=>setError(String(e)));}}>{text('Open reviewed resume','Buka resume semakan')}</button>{resumeUrl&&<a href={resumeUrl} target="_blank" rel="noreferrer">{text('Private resume · 60 seconds','Resume peribadi · 60 saat')}</a>}
   <button disabled={busy} onClick={()=>start(detail,'close_job')}>{text('Close this job and active applications','Tutup jawatan dan permohonan aktif')}</button></>}
  </section>}
  {dialog && <section role="dialog" aria-modal="true" aria-label={text('Confirm human action','Sahkan tindakan manusia')} className="decision-dialog">
   <h3>{dialog.action} · {dialog.row.id}</h3><p>{dialog.action==='note'?text('Private reviewer note. The candidate will not receive this text.','Nota peribadi penyemak. Calon tidak akan menerima teks ini.'):text('This reason is visible to the candidate. Required evidence and role permissions are checked on the server.','Sebab ini boleh dilihat oleh calon. Bukti wajib dan kebenaran peranan disemak pada pelayan.')}</p>
   <label>{text('Reason / note','Sebab / nota')}<textarea minLength={5} maxLength={1000} value={reason} onChange={e=>{setReason(e.target.value);setDialog({...dialog,key:crypto.randomUUID()});}} /></label>
   {dialog.action!=='withdraw' && <label>{text('Evidence IDs (submission / document / review; comma separated)','ID bukti (penyerahan / dokumen / semakan; dipisahkan koma)')}<input value={evidence} onChange={e=>{setEvidence(e.target.value);setDialog({...dialog,key:crypto.randomUUID()});}} /></label>}
   <button disabled={busy||reason.trim().length<5} onClick={()=>void submit()}>{text('Confirm action','Sahkan tindakan')}</button><button disabled={busy} onClick={()=>setDialog(null)}>{text('Cancel','Batal')}</button>
  </section>}
 </section>;
}
