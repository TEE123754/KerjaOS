import {ReactNode,useState} from 'react';
export function DesktopPanel({name,children,hidden=false,locale='en'}:{name:string;children:ReactNode;hidden?:boolean;locale?:'en'|'ms'}){
 const ms=locale==='ms';
 const [minimized,setMinimized]=useState(false),[full,setFull]=useState(false),[x,setX]=useState(0),[y,setY]=useState(0);
 function move(dx:number,dy:number){const max=Math.max(0,Math.min(60,(window.innerWidth-1000)/2));setX(v=>Math.max(-max,Math.min(max,v+dx)));setY(v=>Math.max(-30,Math.min(30,v+dy)));}
 return <div className={'desktop-panel'+(full?' panel-full':'')} hidden={hidden} style={{transform:`translate(${x}px,${y}px)`}}><div className="panel-controls" role="toolbar" aria-label={name+' window controls'}>
 <span onPointerDown={e=>{if(window.innerWidth<1000)return;const startX=e.clientX,startY=e.clientY,originX=x,originY=y;const t=e.currentTarget;t.setPointerCapture(e.pointerId);t.onpointermove=ev=>{const max=Math.max(0,Math.min(60,(window.innerWidth-1000)/2));setX(Math.max(-max,Math.min(max,originX+ev.clientX-startX)));setY(Math.max(-30,Math.min(30,originY+ev.clientY-startY)));};t.onpointerup=()=>{t.onpointermove=null;t.onpointerup=null;};}} className="move-handle">{name}</span>
 <button type="button" onClick={()=>setMinimized(v=>!v)} aria-expanded={!minimized}>{minimized?(ms?'Pulihkan':'Restore'):(ms?'Minimumkan':'Minimize')} {name}</button><button type="button" aria-pressed={full} onClick={()=>setFull(v=>!v)}>{full?(ms?'Saiz biasa':'Normal size'):(ms?'Maksimumkan':'Maximize')} {name}</button>
 <button type="button" aria-label={'Move '+name+' left'} onClick={()=>move(-12,0)}>←</button><button type="button" aria-label={'Move '+name+' right'} onClick={()=>move(12,0)}>→</button><button type="button" aria-label={'Move '+name+' up'} onClick={()=>move(0,-12)}>↑</button><button type="button" aria-label={'Move '+name+' down'} onClick={()=>move(0,12)}>↓</button><button type="button" onClick={()=>{setX(0);setY(0);setFull(false);setMinimized(false);}}>{ms?'Tetapkan semula':'Reset'} {name}</button>
 </div><div hidden={minimized}>{children}</div></div>;
}
