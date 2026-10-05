import {useEffect,useRef,useState} from 'react';
import {api} from './api';
type Mode='real'|'practice';
type Bank={id:string;job_id:string;title:string;competencies:string[];duration_minutes:number;sample_count:number};
type Question={id:string;kind:'objective'|'subjective';prompt:string;competency:string;rubric:string;max_points:number;options?:string[];correct?:number};
type Attempt={id:string;mode:Mode;bank_id:string;application_id?:string;questions:Question[];answers:Record<string,string|number>;revision:number;state:string;deadline_at:string;server_now:string;objective_result?:{earned:number;possible:number;subjective_pending:number};review?:{decision:string;reason:string}};
type Summary=Pick<Attempt,'id'|'mode'|'state'|'revision'|'application_id'|'deadline_at'>;
type Report={index:number|null;band:string;summary:string;missing_inputs:string[];weak_pillars:string[];roadmap:{competency:string;action:string}[];components:{pillars:{competency:string;earned:number;possible:number;percent:number|null}[]};provenance:{scorer:string;report:string}};
type Props={applications:{id:string;job_id:string;stage:string;status:string}[];jobs:{id:string;title:string}[];locale:'en'|'ms';csrf:string;staff:boolean};
const blank=():Question=>({id:crypto.randomUUID(),kind:'objective',prompt:'',competency:'',rubric:'',max_points:1,options:['',''],correct:0});
export function QuizWorkspace({applications,jobs,locale,csrf,staff}:Props){
 const ms=locale==='ms';
 const [mode,setMode]=useState<Mode>('practice'),[banks,setBanks]=useState<Bank[]>([]),[bankId,setBankId]=useState(''),[appId,setAppId]=useState('');
 const [rows,setRows]=useState<Summary[]>([]),[queue,setQueue]=useState<Summary[]>([]),[adjustments,setAdjustments]=useState<{id:string;action:string;reason:string;application_id:string}[]>([]);
 const [attempt,setAttempt]=useState<Attempt|null>(null),[staffView,setStaffView]=useState(false),[answers,setAnswers]=useState<Record<string,string|number>>({}),[report,setReport]=useState<Report|null>(null);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[remaining,setRemaining]=useState(0),[saved,setSaved]=useState('');
 const revision=useRef(0),dirty=useRef(false),chain=useRef(Promise.resolve()),live=useRef<Attempt|null>(null),answerRef=useRef(answers),expired=useRef(false);
 const [reason,setReason]=useState(''),[scores,setScores]=useState<Record<string,number>>({}),[attested,setAttested]=useState(false),[minutes,setMinutes]=useState(15);
 const [publishJob,setPublishJob]=useState(''),[publishMode,setPublishMode]=useState<Mode>('practice'),[title,setTitle]=useState(''),[duration,setDuration]=useState(20),[sample,setSample]=useState(3),[draft,setDraft]=useState<Question[]>([blank()]);
 live.current=attempt;answerRef.current=answers;
 const eligible=applications.filter(a=>a.stage==='P3'&&a.status==='under_review');
 async function load(){
  try{const [b,r,a]=await Promise.all([api<Bank[]>('/quiz/banks/'+mode),api<Summary[]>('/quiz/attempts'),api<typeof adjustments>('/quiz/adjustments')]);setBanks(b);setRows(r);setAdjustments(a);
   if(staff)setQueue(await api<Summary[]>('/quiz/review-queue'));
  }catch(e){setMessage(String(e));}
 }
 useEffect(()=>{setBankId('');void load();},[mode,staff,applications]);
 async function work(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(e){setMessage(String(e));}finally{setBusy(false);}}
 function accept(a:Attempt){revision.current=a.revision;dirty.current=false;expired.current=false;setAttempt(a);setAnswers(a.answers||{});setSaved(a.state==='active'?(ms?'Disimpan di pelayan':'Saved on server'):a.state);}
 async function open(row:Summary,asStaff=false){await chain.current;setStaffView(asStaff);setReport(null);setScores({});setReason('');setAttested(false);accept(await api<Attempt>(`/quiz/attempts/${row.mode}/${row.id}`));}
 function save(submit=false){
  const id=attempt?.id;
  const next=chain.current.then(async()=>{
   const a=live.current;if(!a||a.id!==id||a.state!=='active'||staffView)return;
   const snapshot={...answerRef.current};
   const result=await api<Attempt>(`/quiz/attempts/${a.mode}/${a.id}`,{method:'POST',body:JSON.stringify({expected_revision:revision.current,answers:snapshot,submit})},csrf);
   revision.current=result.revision;setAttempt(result);
   // Keep edits entered while an earlier autosave was in flight.
   const clean=JSON.stringify(snapshot)===JSON.stringify(answerRef.current);
   dirty.current=!clean;setSaved(clean?(ms?'Disimpan di pelayan':'Saved on server'):(ms?'Belum disimpan':'Unsaved changes'));
   if(result.state!=='active'){dirty.current=false;setAnswers(result.answers);await load();}
  });
  chain.current=next.catch(e=>{setMessage(String(e)+(ms?' — jawapan belum disimpan. Sambung semula atau cuba simpan.':' — changes may be unsaved. Reconnect or retry saving.'));setSaved(ms?'Belum disimpan':'Unsaved changes');});
  return chain.current;
 }
 useEffect(()=>{if(!dirty.current||staffView)return;const timer=window.setTimeout(()=>void save(),900);return()=>window.clearTimeout(timer);},[answers]);
 useEffect(()=>{
  if(!attempt||attempt.state!=='active'||staffView)return;
  const start=performance.now(),seconds=Math.max(0,(Date.parse(attempt.deadline_at)-Date.parse(attempt.server_now))/1000);
  const tick=()=>{const left=Math.max(0,Math.ceil(seconds-(performance.now()-start)/1000));setRemaining(left);
   if(left===0&&!expired.current){expired.current=true;void save(true);}};
  tick();const timer=window.setInterval(tick,1000);return()=>window.clearInterval(timer);
 },[attempt?.id,attempt?.revision,staffView]);
 function edit(id:string,value:string|number){dirty.current=true;setSaved(ms?'Belum disimpan':'Unsaved changes');setAnswers(old=>({...old,[id]:value}));}
 function changeQuestion(index:number,patch:Partial<Question>){setDraft(old=>old.map((q,i)=>i===index?{...q,...patch}:q));}
 async function adjustment(action:'request'|'extend'|'retake'){
  const application_id=action==='request'?appId:attempt?.application_id;
  if(!application_id)throw Error(ms?'Pilih permohonan':'Select an application');
  await api('/quiz/adjustments',{method:'POST',body:JSON.stringify({application_id,action,reason,minutes:action==='extend'?minutes:null,expected_revision:action==='request'?null:attempt?.revision})},csrf);
  if(attempt&&action!=='request')accept(await api<Attempt>(`/quiz/attempts/real/${attempt.id}`));
  setReason('');await load();setMessage(ms?'Permintaan/pelarasan direkodkan.':'Request/adjustment recorded.');
 }
 return <section aria-label={ms?'Kuiz dan latihan':'Quiz and practice'}>
  <h2>{ms?'Kuiz sebenar dan latihan peribadi':'Real quiz and private practice'}</h2>
  <p>{ms?'Latihan tidak mengubah status permohonan dan tidak boleh dilihat oleh majikan. Indeks kesediaan bukan kebarangkalian diterima.':'Practice stays private and cannot change application progress. A readiness index is not a hiring probability.'}</p>
  <p role="status">{message}</p>
  <label>{ms?'Mod kuiz':'Quiz mode'}<select value={mode} onChange={e=>setMode(e.target.value as Mode)}><option value="practice">{ms?'Latihan peribadi':'Private practice'}</option><option value="real">{ms?'Kuiz permohonan':'Real application quiz'}</option></select></label>
  <label>{ms?'Versi soalan':'Question version'}<select value={bankId} onChange={e=>setBankId(e.target.value)}><option value="">{ms?'Pilih versi diterbitkan':'Select a published version'}</option>{banks.filter(b=>mode==='practice'||!appId||applications.find(a=>a.id===appId)?.job_id===b.job_id).map(b=><option key={b.id} value={b.id}>{b.title} — {b.duration_minutes} min / {b.sample_count} {ms?'soalan':'questions'}</option>)}</select></label>
  <label>{ms?'Permohonan kuiz':'Quiz application'}<select value={appId} onChange={e=>{setAppId(e.target.value);if(mode==='real')setBankId('');}}><option value="">{ms?'Pilih permohonan P3':'Select a P3 application'}</option>{eligible.map(a=><option key={a.id} value={a.id}>{jobs.find(j=>j.id===a.job_id)?.title||a.id}</option>)}</select></label>
  <button disabled={busy||!bankId||(mode==='real'&&!appId)||attempt?.state==='active'&&!staffView} onClick={()=>void work(async()=>{await chain.current;setStaffView(false);setReport(null);accept(await api<Attempt>('/quiz/attempts/'+mode,{method:'POST',body:JSON.stringify({bank_id:bankId,application_id:mode==='real'?appId:null,idempotency_key:crypto.randomUUID()})},csrf));await load();})}>{ms?'Mulakan kuiz':'Start quiz'}</button>
  <button disabled={busy} onClick={()=>void work(load)}>{ms?'Muat semula kuiz':'Refresh quiz'}</button>
  <ul>{rows.map(r=><li key={r.id}>{r.mode} — {r.state} <button disabled={busy||dirty.current} onClick={()=>void work(()=>open(r))}>{ms?'Buka cubaan':'Open attempt'}</button>{r.mode==='practice'&&r.state==='submitted'&&<button disabled={busy} onClick={()=>void work(async()=>{setReport(await api<Report>(`/quiz/practice/${r.id}/report?locale=${locale}`));})}>{ms?'Lihat laporan latihan':'View practice report'}</button>}</li>)}</ul>
  {attempt&&<fieldset><legend>{attempt.mode==='practice'?(ms?'Cubaan latihan peribadi':'Private practice attempt'):(ms?'Cubaan kuiz sebenar':'Real quiz attempt')}</legend>
   <p>{attempt.state} · {ms?'Tarikh akhir pelayan':'Server deadline'}: {new Date(attempt.deadline_at).toLocaleString()} · {ms?'Baki':'Remaining'} {remaining}s · {saved}</p>
   <button disabled={busy} onClick={()=>void work(async()=>{await chain.current;if(dirty.current&&!window.confirm(ms?'Buang perubahan belum disimpan dan muat jawapan pelayan?':'Discard unsaved changes and reload server answers?'))return;await open(attempt,staffView);})}>{ms?'Sambung semula':'Reconnect attempt'}</button>
   {attempt.questions.map(q=><fieldset key={q.id}><legend>{q.competency}: {q.prompt}</legend><p>{ms?'Rubrik':'Rubric'}: {q.rubric} ({q.max_points})</p>
    {q.kind==='objective'?(q.options||[]).map((o,i)=><label key={i}><input type="radio" name={attempt.id+'-'+q.id} checked={answers[q.id]===i} disabled={staffView||attempt.state!=='active'||remaining===0} onChange={()=>edit(q.id,i)}/>{o}</label>):<label>{ms?'Jawapan bertulis':'Written answer'}<textarea maxLength={2000} value={String(answers[q.id]??'')} disabled={staffView||attempt.state!=='active'||remaining===0} onChange={e=>edit(q.id,e.target.value)}/></label>}
    {staffView&&q.kind==='subjective'&&<label>{ms?'Markah penyemak':'Reviewer points'}<input type="number" min={0} max={q.max_points} value={scores[q.id]??''} onChange={e=>setScores(s=>({...s,[q.id]:Number(e.target.value)}))}/></label>}
   </fieldset>)}
   {!staffView&&attempt.state==='active'&&<><button disabled={busy} onClick={()=>void work(()=>save())}>{ms?'Simpan jawapan':'Save answers'}</button><button disabled={busy} onClick={()=>void work(async()=>{await save(true);})}>{ms?'Hantar kuiz':'Submit quiz'}</button><p>{ms?'Simpan automatik selepas suntingan; jawapan lewat tidak diterima. Cubaan luput menggunakan jawapan disimpan.':'Autosave after edits; late answers are ignored. Expired attempts use saved answers.'}</p></>}
   {attempt.objective_result&&<p>{ms?'Markah objektif':'Objective points'}: {attempt.objective_result.earned}/{attempt.objective_result.possible} · {ms?'Jawapan subjektif untuk semakan manusia':'Subjective answers for human review'}: {attempt.objective_result.subjective_pending}</p>}
   {attempt.review&&<p>{attempt.review.decision}: {attempt.review.reason}</p>}
   {staffView&&<><label>{ms?'Sebab semakan/pelarasan':'Review/adjustment reason'}<textarea minLength={5} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><label><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/>{ms?'Saya menyemak jawapan menggunakan rubrik diterbitkan.':'I reviewed these answers against the published rubric.'}</label>
    {attempt.state==='active'&&<button disabled={busy} onClick={()=>void work(async()=>{accept(await api<Attempt>(`/quiz/attempts/real/${attempt.id}/expire`,{method:'POST'},csrf));await load();})}>{ms?'Muktamadkan jika tarikh akhir luput':'Finalize if deadline expired'}</button>}
    {['submitted','needs_review'].includes(attempt.state)&&(['approve','needs_review'] as const).map(decision=><button key={decision} disabled={busy||!attested||reason.trim().length<5} onClick={()=>void work(async()=>{await api(`/quiz/attempts/real/${attempt.id}/review`,{method:'POST',body:JSON.stringify({expected_revision:attempt.revision,decision,scores,reason,attested})},csrf);await open(attempt,true);await load();setMessage(ms?'Semakan direkodkan; kemajuan memerlukan tindakan manusia berasingan.':'Review recorded; progression requires a separate human action.');})}>{decision==='approve'?(ms?'Luluskan bukti kuiz':'Approve quiz evidence'):(ms?'Perlu semakan lanjut':'Request further review')}</button>)}
    <label>{ms?'Minit tambahan':'Additional minutes'}<input type="number" min={5} max={120} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label>
    <button disabled={busy||reason.trim().length<5||attempt.state!=='active'} onClick={()=>void work(()=>adjustment('extend'))}>{ms?'Luluskan masa tambahan':'Grant extra time'}</button>
    <button disabled={busy||reason.trim().length<5||attempt.state==='active'} onClick={()=>void work(()=>adjustment('retake'))}>{ms?'Benarkan cubaan semula':'Authorize retake'}</button></>}
  </fieldset>}
  {!staff&&eligible.length>0&&<fieldset><legend>{ms?'Permintaan penyesuaian/cubaan semula':'Accommodation/retake request'}</legend><p>{ms?'Nyatakan perubahan diperlukan tanpa diagnosis atau data perubatan.':'Describe the requested change without diagnoses or medical details.'}</p><label>{ms?'Sebab permintaan':'Request reason'}<textarea maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!appId||reason.trim().length<5} onClick={()=>void work(()=>adjustment('request'))}>{ms?'Hantar permintaan':'Request accommodation'}</button></fieldset>}
  {adjustments.length>0&&<ul>{adjustments.map(a=><li key={a.id}>{a.action}: {a.reason}</li>)}</ul>}
  {report&&<section aria-label={ms?'Laporan latihan':'Practice report'}><h3>{ms?'Indeks kesediaan latihan':'Practice readiness index'}: {report.index??'—'}/100</h3><p>{report.band}: {report.summary}</p><ul>{report.components.pillars.map(p=><li key={p.competency}>{p.competency}: {p.earned}/{p.possible} ({p.percent??'—'}%)</li>)}</ul><p>{ms?'Input tiada':'Missing inputs'}: {report.missing_inputs.join(', ')||'—'}</p><h4>{ms?'Pelan pembelajaran':'Learning roadmap'}</h4><ul>{report.roadmap.map(r=><li key={r.competency}>{r.competency}: {r.action}</li>)}</ul><p>{report.provenance.scorer} · {report.provenance.report}</p></section>}
  {staff&&<><h3>{ms?'Semakan kuiz sebenar sahaja':'Real quiz review only'}</h3><ul>{queue.map(r=><li key={r.id}>{r.application_id} — {r.state} <button disabled={busy||dirty.current} onClick={()=>void work(()=>open(r,true))}>{ms?'Semak kuiz':'Review quiz'}</button></li>)}</ul>
   <details><summary>{ms?'Terbitkan versi soalan baharu':'Publish a new question version'}</summary><form onSubmit={e=>{e.preventDefault();void work(async()=>{const competencies=[...new Set(draft.map(q=>q.competency))];await api('/quiz/banks',{method:'POST',body:JSON.stringify({mode:publishMode,job_id:publishJob,title,competencies,questions:draft,duration_minutes:duration,sample_count:sample})},csrf);setDraft([blank()]);setTitle('');await load();setMessage(ms?'Versi diterbitkan dan tidak berubah.':'Immutable question version published.');});}}>
    <label>{ms?'Jawatan untuk versi':'Version role'}<select required value={publishJob} onChange={e=>setPublishJob(e.target.value)}><option value="">—</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.title}</option>)}</select></label>
    <label>{ms?'Bank berasingan':'Separate bank'}<select value={publishMode} onChange={e=>setPublishMode(e.target.value as Mode)}><option value="practice">Practice</option><option value="real">Real</option></select></label>
    <label>{ms?'Tajuk versi':'Version title'}<input required minLength={3} maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>{ms?'Tempoh minit':'Duration minutes'}<input type="number" min={5} max={120} value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label><label>{ms?'Soalan setiap cubaan':'Questions per attempt'}<input type="number" min={1} max={draft.length} value={sample} onChange={e=>setSample(Number(e.target.value))}/></label>
    {draft.map((q,index)=><fieldset key={q.id}><legend>{ms?'Soalan':'Question'} {index+1}</legend><label>{ms?'Kompetensi':'Competency'}<input required minLength={2} maxLength={80} value={q.competency} onChange={e=>changeQuestion(index,{competency:e.target.value})}/></label><label>{ms?'Jenis soalan':'Question type'}<select value={q.kind} onChange={e=>{const kind=e.target.value as Question['kind'];setDraft(old=>old.map((v,i)=>i!==index?v:{id:v.id,prompt:v.prompt,competency:v.competency,rubric:v.rubric,max_points:v.max_points,kind,...(kind==='objective'?{options:['',''],correct:0}:{})}));}}><option value="objective">Objective</option><option value="subjective">Subjective</option></select></label>
     <label>{ms?'Teks soalan':'Question text'}<textarea required minLength={3} maxLength={2000} value={q.prompt} onChange={e=>changeQuestion(index,{prompt:e.target.value})}/></label><label>{ms?'Rubrik kompetensi':'Competency rubric'}<textarea required minLength={3} maxLength={1000} value={q.rubric} onChange={e=>changeQuestion(index,{rubric:e.target.value})}/></label><label>{ms?'Markah maksimum':'Maximum points'}<input type="number" min={1} max={10} value={q.max_points} onChange={e=>changeQuestion(index,{max_points:Number(e.target.value)})}/></label>
     {q.kind==='objective'&&<><label>{ms?'Pilihan (satu setiap baris, 2–6)':'Options (one per line, 2–6)'}<textarea required value={q.options?.join('\n')} onChange={e=>changeQuestion(index,{options:e.target.value.split('\n')})}/></label><label>{ms?'Pilihan jawapan betul':'Correct option'}<select value={q.correct} onChange={e=>changeQuestion(index,{correct:Number(e.target.value)})}>{q.options?.map((o,i)=><option key={i} value={i}>{i+1}: {o}</option>)}</select></label></>}
     <button type="button" disabled={draft.length===1} onClick={()=>setDraft(old=>old.filter((_,i)=>i!==index))}>{ms?'Buang soalan':'Remove question'}</button></fieldset>)}
    <button type="button" disabled={draft.length>=20} onClick={()=>setDraft(old=>[...old,blank()])}>{ms?'Tambah soalan':'Add question'}</button><button disabled={busy}>{ms?'Terbitkan versi':'Publish version'}</button>
   </form></details></>}
 </section>;
}
