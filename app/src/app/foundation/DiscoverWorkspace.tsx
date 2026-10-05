import {useEffect,useState} from 'react';
import {api} from './api';
type Listing={id:string;title:string;company:string;location:string;category:string;seniority:string;region:string;classification:string;url:string;source:string;synthetic:boolean;state:string;saved:boolean;fetched_at:string;expires_at:string;external_status:string|null;note:string|null;clicked_at:string|null};
type Progress={enabled:boolean;sources:{id:string;name:string;enabled:boolean;synthetic:boolean;last_run_at:string|null;warning:string|null}[]};
const status=['considering','applied','interview','offer','rejected','withdrawn'];
const enStatus=['Considering','Applied (self-reported)','Interview (self-reported)','Offer (self-reported)','Rejected (self-reported)','Withdrawn (self-reported)'];
const msStatus=['Mempertimbangkan','Dimohon (laporan sendiri)','Temu duga (laporan sendiri)','Tawaran (laporan sendiri)','Ditolak (laporan sendiri)','Ditarik balik (laporan sendiri)'];
function safeLink(url:string){try{const p=new URL(url);return p.protocol==='https:'&&!p.username&&!p.password&&(!p.port||p.port==='443')&&!['localhost','127.0.0.1','::1','[::1]'].includes(p.hostname)&&!/[\\\s]/.test(url);}catch{return false;}}
export function DiscoverWorkspace({locale,csrf}:{locale:'en'|'ms';csrf:string}){
 const ms=locale==='ms';const [rows,setRows]=useState<Listing[]>([]),[progress,setProgress]=useState<Progress|null>(null),[query,setQuery]=useState(''),[region,setRegion]=useState('all'),[category,setCategory]=useState('all'),[saved,setSaved]=useState(false),[stale,setStale]=useState(false),[synthetic,setSynthetic]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function load(){const p=new URLSearchParams({q:query,region,category,saved:String(saved),stale:String(stale),synthetic:String(synthetic)});setRows(await api<Listing[]>('/discover/listings?'+p));setProgress(await api<Progress>('/discover/progress'));}
 async function work(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(e){setMessage(String(e));}finally{setBusy(false);}}
 useEffect(()=>{let active=true;setRows([]);setMessage('');void api<Listing[]>('/discover/listings?synthetic='+synthetic+'&saved='+saved+'&stale='+stale).then(r=>{if(active)setRows(r);}).catch(e=>{if(active)setMessage(String(e));});void api<Progress>('/discover/progress').then(p=>{if(active)setProgress(p);}).catch(e=>{if(active)setMessage(String(e));});return()=>{active=false;};},[synthetic,saved,stale]);
 return <section className="foundation-window" aria-label={ms?'Temui jawatan':'Discover jobs'}><header><strong>{ms?'Temui jawatan':'Discover jobs'}</strong></header><div className="foundation-content">
 <p>{ms?'Jawatan luaran berasingan daripada permohonan KerjaOS. Membuka pautan tidak menghantar permohonan. Status luaran ialah laporan sendiri, bukan pengesahan majikan.':'External roles are separate from KerjaOS applications. Opening a link does not submit an application. External status is self-reported, not employer-confirmed.'}</p>
 <form onSubmit={e=>{e.preventDefault();void work(load);}}>
 <label>{ms?'Cari jawatan':'Search roles'}<input aria-label="Discovery search" maxLength={120} value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <label>{ms?'Lokasi':'Location'}<select aria-label="Discovery location" value={region} onChange={e=>setRegion(e.target.value)}>{['all','malaysia','remote','unknown','other'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label>{ms?'Kategori':'Category'}<select aria-label="Discovery category" value={category} onChange={e=>setCategory(e.target.value)}>{['all','technology','business','other'].map(v=><option key={v}>{v}</option>)}</select></label>
 <button disabled={busy}>{ms?'Cari / muat semula':'Search / refresh'}</button>
 </form>
 <label><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>{ms?'Disimpan dan penjejak saya':'My saved jobs and tracker'}</label>
 <label><input type="checkbox" checked={stale} onChange={e=>setStale(e.target.checked)}/>{ms?'Tunjukkan lapuk / sumber dijeda':'Include stale / paused sources'}</label>
 <label><input type="checkbox" checked={synthetic} onChange={e=>setSynthetic(e.target.checked)}/>{ms?'Demo sintetik sahaja':'Synthetic demo only'}</label>
 <p role="status">{message}</p>
 {progress&&!progress.enabled&&<p className="notice">{ms?'Pengumpulan jawatan dijeda. Sumber memerlukan kelulusan sebelum diaktifkan. Pautan disimpan masih tersedia.':'Job collection is paused. Sources require approval before activation. Saved links remain available.'}</p>}
 <details><summary>{ms?'Sumber dan kesegaran':'Sources and freshness'}</summary>{progress?.sources.map(s=><p key={s.id}>{s.name} — {s.enabled?(ms?'aktif':'enabled'):(ms?'dijeda':'paused')} · {s.last_run_at||'—'} {s.warning}</p>)}</details>
 {!rows.length&&<p>{ms?'Tiada jawatan dalam penapis ini. Liputan pasaran tidak dijamin.':'No roles match these filters. Market coverage is not guaranteed.'}</p>}
 {rows.map(row=><ListingCard key={row.id} row={row} ms={ms} csrf={csrf} busy={busy} act={fn=>work(async()=>{await fn();await load();})}/>)}
 </div></section>;
}
function ListingCard({row,ms,csrf,busy,act}:{row:Listing;ms:boolean;csrf:string;busy:boolean;act:(fn:()=>Promise<void>)=>Promise<void>}){
 const [selected,setSelected]=useState(row.external_status||'considering'),[note,setNote]=useState(row.note||'');
 useEffect(()=>{setSelected(row.external_status||'considering');setNote(row.note||'');},[row.external_status,row.note]);
 const labels=ms?msStatus:enStatus;const safe=safeLink(row.url);
 return <article className="application-card" aria-label={row.title}><h3>{row.title}</h3><p>{row.company} · {row.location||'—'} · {row.category} · {row.seniority}</p><p>{row.source} · {row.synthetic?(ms?'SINTETIK':'SYNTHETIC'):(ms?'Sumber luaran':'External source')} · {row.state}</p><p>{ms?'Diambil':'Fetched'}: {row.fetched_at} · {ms?'Tamat kesegaran':'Fresh until'}: {row.expires_at}</p>
 <p className="notice">{row.classification==='flagged'?(ms?'Perlu perhatian: kata-kata berisiko dikesan. Ini bukan keputusan penipuan.':'Review carefully: potentially risky wording detected. This is not a fraud determination.'):(ms?'Belum disahkan. Semak majikan dan kelayakan lokasi sebelum memohon.':'Unverified. Check the employer and location eligibility before applying.')}</p>
 <button disabled={busy} onClick={()=>void act(async()=>{await api('/discover/saved',{method:'POST',body:JSON.stringify({listing_id:row.id,saved:!row.saved})},csrf);})}>{row.saved?(ms?'Nyahsimpan':'Unsave'):(ms?'Simpan jawatan':'Save job')}</button>
 {safe&&<a href={row.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={()=>void act(async()=>{await api('/discover/tracker',{method:'POST',body:JSON.stringify({listing_id:row.id,click:true})},csrf);})}>{ms?'Mohon di sumber':'Apply on source'}</a>}
 <button disabled={busy||!safe} onClick={()=>void act(async()=>{await api('/discover/tracker',{method:'POST',body:JSON.stringify({listing_id:row.id,click:true})},csrf);})}>{ms?'Catat pautan dibuka sahaja':'Record source visit only'}</button>
 <p>{row.clicked_at&&(ms?'Lawatan dicatat; permohonan belum disahkan.':'Visit recorded; application not confirmed.')}</p>
 <form onSubmit={e=>{e.preventDefault();void act(async()=>{await api('/discover/tracker',{method:'POST',body:JSON.stringify({listing_id:row.id,status:selected,note,click:false})},csrf);});}}>
 <label>{ms?'Status luaran (laporan sendiri)':'External status (self-reported)'}<select aria-label={ms?'Status luaran (laporan sendiri)':'External status (self-reported)'} value={selected} onChange={e=>setSelected(e.target.value)}>{status.map((s,i)=><option key={s} value={s}>{labels[i]}</option>)}</select></label>
 <label>{ms?'Nota peribadi (tanpa dokumen sensitif)':'Private note (no sensitive documents)'}<textarea aria-label={ms?'Nota peribadi (tanpa dokumen sensitif)':'Private note (no sensitive documents)'} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <button disabled={busy}>{ms?'Simpan laporan sendiri':'Save self-reported update'}</button>
 </form><button disabled={busy} onClick={()=>void act(async()=>{await api('/discover/forget',{method:'POST',body:JSON.stringify({listing_id:row.id})},csrf);})}>{ms?'Padam penjejak dan simpanan':'Delete tracker and saved entry'}</button></article>;
}
