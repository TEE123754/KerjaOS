import {useId,useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
export function DesktopPanel({name,children,hidden=false,locale='en'}:{name:string;children:ReactNode;hidden?:boolean;locale?:'en'|'ms'}){
 const [collapsed,setCollapsed]=useState(false),contentId=useId();
 return <section className="workspace-panel" hidden={hidden} aria-label={name+' workspace'}><div className="panel-heading"><strong>{name}</strong><button type="button" aria-controls={contentId} aria-expanded={!collapsed} onClick={()=>setCollapsed(v=>!v)}>{locale==='ms'?(collapsed?'Buka':'Tutup'):(collapsed?'Expand':'Collapse')} {name}<ChevronDown size={16} aria-hidden="true"/></button></div><div id={contentId} className="panel-content" hidden={collapsed}>{children}</div></section>;
}
