export async function api<T>(path: string, options: RequestInit = {}, csrf?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (csrf) headers.set('X-CSRF-Token', csrf);
  const response = await fetch(`/api/v1${path}`, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || `Request failed (${response.status})`);
  }
  return response.json();
}

export async function agentStream<T>(payload:unknown,csrf:string,onProgress:(node:string)=>void):Promise<T>{
  const response=await fetch('/api/v1/recruiting/stream',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(payload)});
  if(!response.ok)throw Error((await response.json().catch(()=>({}))).detail||'Agent review unavailable');
  if(!response.body)throw Error('Agent stream unavailable');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result:T|undefined;
  while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;
    while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const event=block.split('\n').find(l=>l.startsWith('event: '))?.slice(7);const line=block.split('\n').find(l=>l.startsWith('data: '));if(!line)continue;const data=JSON.parse(line.slice(6));if(event==='progress')onProgress(data.node);if(event==='result')result=data as T;}
  }
  if(!result)throw Error('Agent review interrupted; no result saved');return result;
}
