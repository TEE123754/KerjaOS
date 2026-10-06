import {useEffect,useRef,useState,type ReactNode} from 'react';
import {MessageCircle,X} from 'lucide-react';

export function FloatingAssistant({locale,children}:{locale:'en'|'ms';children:ReactNode}) {
  const [open,setOpen]=useState(false),[visited,setVisited]=useState(false);
  const launcher=useRef<HTMLButtonElement>(null),box=useRef<HTMLElement>(null);
  const ms=locale==='ms';
  function close(){setOpen(false);launcher.current?.focus()}
  useEffect(()=>{
    if(!open)return;
    box.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);launcher.current?.focus()}};
    window.addEventListener('keydown',escape);
    return()=>window.removeEventListener('keydown',escape);
  },[open]);
  return <div className="floating-assistant">
    {visited&&<section ref={box} id="floating-assistant-box" role="dialog" aria-modal="false" aria-label={ms?'Pembantu KerjaOS':'KerjaOS assistant'} hidden={!open} className="floating-chatbox">
      <header><div><strong>{ms?'Pembantu KerjaOS':'KerjaOS assistant'}</strong><small>{ms?'Kemajuan, semakan dan bantuan':'Progress, reviews and help'}</small></div><button type="button" aria-label={ms?'Tutup pembantu':'Close assistant'} onClick={close}><X size={19} aria-hidden="true"/></button></header>
      <div className="floating-chat-content">{children}</div>
    </section>}
    <button type="button" ref={launcher} className="assistant-launcher" aria-label={ms?'Buka pembantu':'Open assistant'} aria-expanded={open} aria-controls={visited?'floating-assistant-box':undefined} onClick={()=>{setVisited(true);setOpen(v=>!v)}}><MessageCircle size={25} aria-hidden="true"/></button>
  </div>;
}
