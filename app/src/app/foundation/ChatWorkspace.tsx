import {useEffect,useState} from 'react';
import {api} from './api';
type Reply={answer:string;fallback_warning:string|null;read_only:boolean;choices:{id:string;title:string}[];citations:{source:string;id:string;updated_at:string;url:string|null}[];provenance:{requested_model:string;actual_model:string;provider:string;plan:string}};
export function ChatWorkspace({locale,csrf,staff}:{locale:'en'|'ms';csrf:string;staff:boolean}){
 const ms=locale==='ms';const [scope,setScope]=useState<'candidate'|'staff'>('candidate'),[options,setOptions]=useState<{id:string;title:string}[]>([]),[selected,setSelected]=useState('');
 const [message,setMessage]=useState(''),[reply,setReply]=useState<Reply|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setSelected('');setReply(null);setError('');void api<typeof options>('/chat/options?scope='+scope).then(setOptions).catch(e=>{setOptions([]);setError(String(e));});},[scope]);
 async function send(text:string){setBusy(true);setReply(null);setError('');try{const r=await api<Reply>('/chat/messages',{method:'POST',body:JSON.stringify({message:text,locale,scope,application_id:scope==='candidate'&&selected?selected:null,job_id:scope==='staff'&&selected?selected:null})},csrf);setReply(r);if(r.choices.length)setOptions(r.choices);setMessage('');}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <section aria-label={ms?'Pembantu kemajuan':'Progress assistant'}><h2>{ms?'Pembantu kemajuan dan FAQ':'Progress assistant and FAQ'}</h2>
  <p>{ms?'Pembantu hanya membaca maklumat dibenarkan. Ia tidak mengubah permohonan, membuat keputusan atau melihat laporan peribadi. Mesej tidak disimpan sebagai sejarah chat.':'The assistant reads authorized information only. It cannot change applications, decide outcomes or inspect private reports. Messages are not saved as chat history.'}</p>
  {staff&&<label>{ms?'Skop pembantu':'Assistant scope'}<select value={scope} onChange={e=>setScope(e.target.value as 'candidate'|'staff')}><option value="candidate">{ms?'Permohonan saya':'My applications'}</option><option value="staff">{ms?'Jumlah jawatan ditugaskan':'Assigned role totals'}</option></select></label>}
  <label>{ms?'Pilihan kemajuan':'Progress selection'}<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{ms?'Pilih permohonan/jawatan':'Select an application/role'}</option>{options.map(o=><option key={o.id} value={o.id}>{o.title||o.id} — {o.id.slice(0,8)}</option>)}</select></label>
  <form onSubmit={e=>{e.preventDefault();void send(message);}}><label>{ms?'Pertanyaan pembantu':'Assistant question'}<textarea required minLength={1} maxLength={1000} value={message} onChange={e=>setMessage(e.target.value)}/></label><button disabled={busy||!message.trim()}>{ms?'Tanya pembantu':'Ask assistant'}</button></form>
  <button disabled={busy} onClick={()=>void send(ms?'Di mana kemajuan permohonan?':'Where is my progress?')}>{ms?'Semak kemajuan':'Check progress'}</button>
  {(['privacy','practice','background','interview'] as const).map(code=><button key={code} disabled={busy} onClick={()=>void send(code)}>{ms?({privacy:'Privasi',practice:'Latihan',background:'Latar belakang',interview:'Temu duga'}[code]):code[0].toUpperCase()+code.slice(1)}</button>)}
  <p role="status">{error}</p>{reply&&<div aria-live="polite"><p>{reply.answer}</p>
   {reply.fallback_warning&&<p>{ms?'Jawapan menggunakan kaedah tempatan jika laluan pilihan tidak tersedia':'Local answers remain available when the optional route is unavailable'} ({reply.fallback_warning})</p>}
   <ul>{reply.citations.map(c=><li key={c.source+c.id}>{c.source}: {c.url?<a href={c.url}>{c.id}</a>:c.id} · {ms?'Dikemas kini':'Updated'} {c.updated_at}</li>)}</ul>
   <p>{reply.provenance.plan} · {reply.provenance.actual_model} · {reply.provenance.provider}</p>
  </div>}
 </section>;
}
