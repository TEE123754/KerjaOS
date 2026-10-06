import {useState} from 'react';
import {workspaceAnswer,type OverviewData} from './MainOverview';

export function DemoAssistant({locale,data}:{locale:'en'|'ms';data:OverviewData}) {
  const [question,setQuestion]=useState(''),[messages,setMessages]=useState<{question:string;answer:string}[]>([]);
  const ms=locale==='ms';
  function send(text:string){
    const q=text.toLowerCase();
    const denied=/\b(approve|reject|hire|accept|send|update|change|delete|pay|lulus|tolak|ubah|hantar)\b|other candidate|salary|bank|password|calon lain|gaji peribadi/.test(q);
    const answer=denied?(ms?'Saya hanya membaca ringkasan dibenarkan. Keputusan dan tindakan memerlukan manusia.':'I can only read authorized summaries. Decisions and changes require a human.'):
      workspaceAnswer(text,locale,data)||(/progress|status|pipeline|kemajuan/.test(q)?(ms?`${data.ongoing} permohonan sedang berjalan; ${data.resume} dalam semakan awal dan ${data.decisions} di peringkat keputusan.`:`${data.ongoing} applications are ongoing; ${data.resume} are in early review and ${data.decisions} are at the decision stage.`):
      /privacy|privasi/.test(q)?(ms?'Demo menggunakan data rekaan dan ditetapkan semula apabila log keluar.':'The demo uses invented data and resets when you sign out.'):
      /practice|quiz|latihan/.test(q)?(ms?'Latihan adalah peribadi dan tidak menentukan pengambilan.':'Practice stays private and does not determine a hiring outcome.'):
      /interview|calendar|temu duga/.test(q)?(ms?'Buka kalendar Pengambilan untuk temu duga manusia, atau kalendar Pengurusan untuk acara syarikat.':'Open the Recruitment calendar for human interviews or the Management calendar for company events.'):
      (ms?'Tanya tentang gambaran, kemajuan, onboarding, masa, cuti atau privasi.':'Ask about your overview, progress, onboarding, timesheets, leave or privacy.'));
    setMessages(v=>[...v.slice(-7),{question:text,answer}]);setQuestion('');
  }
  return <section aria-label={ms?'Pembantu demo':'Demo assistant'}><p className="assistant-context-note">{ms?'Ringkasan demo semasa · Baca sahaja · Tiada penghantaran luaran':'Current demo summaries · Read-only · No external requests'}</p><div className="chat-messages" aria-live="polite">{messages.map((m,i)=><article key={i}><p className="chat-question">{m.question}</p><p>{m.answer}</p></article>)}</div><form onSubmit={e=>{e.preventDefault();if(question.trim())send(question)}}><label>{ms?'Pertanyaan pembantu':'Assistant question'}<textarea maxLength={1000} required value={question} onChange={e=>setQuestion(e.target.value)}/></label><button disabled={!question.trim()}>{ms?'Tanya pembantu':'Ask assistant'}</button></form><div className="assistant-prompts">{[[ms?'Gambaran utama':'Main overview',ms?'Gambaran utama':'Main overview'],[ms?'Kemajuan':'Progress',ms?'kemajuan':'progress'],[ms?'Onboarding':'Onboarding','onboarding']].map(([label,text])=><button key={text} onClick={()=>send(text)}>{label}</button>)}</div></section>;
}
