import re
from dataclasses import dataclass
from typing import Literal
from uuid import UUID
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,ConfigDict,Field
from .auth import Principal,require_user,require_write
from .gateway import gateway
from .config import get_settings
from .chat_tools import invoke,ToolArguments
from .chat_providers import Wording
from .morpheus_provider import configured_wording_provider as wording_provider
router=APIRouter(prefix='/chat',tags=['Authorized progress assistant'])
FAQ={
 'help':{'en':['I can show your application progress or explain privacy, practice, background review and interview scheduling. Select an application for progress.','Select an application to view progress. You can also ask about privacy, practice, background review or interviews.'], 'ms':['Saya boleh menunjukkan kemajuan permohonan atau menerangkan privasi, latihan, semakan latar belakang dan penjadualan temu duga. Pilih permohonan untuk kemajuan.','Pilih permohonan untuk melihat kemajuan. Anda juga boleh bertanya tentang privasi, latihan, semakan latar belakang atau temu duga.']},
 'privacy':{'en':['Reports are private and encrypted. Identity/background raw evidence is due for deletion within 24 hours; consent can be revoked. Service operations still require configured retention checks.','You may revoke check consent. Identity/background reports are encrypted and due for deletion within 24 hours; hosted deletion must be verified before real use.'], 'ms':['Laporan peribadi disulitkan. Bukti mentah identiti/latar belakang perlu dipadam dalam 24 jam; persetujuan boleh ditarik balik. Operasi pengekalan memerlukan pengesahan perkhidmatan.','Anda boleh menarik balik persetujuan semakan. Laporan identiti/latar belakang disulitkan dan perlu dipadam dalam 24 jam; pemadaman dihos mesti disahkan sebelum penggunaan sebenar.']},
 'practice':{'en':['Practice stays private from employers and cannot advance an application. Its objective readiness index is not a hiring probability.','Private practice produces a learning roadmap. It cannot unlock screening stages or predict acceptance.'], 'ms':['Latihan kekal peribadi daripada majikan dan tidak memajukan permohonan. Indeks kesediaan objektif bukan kebarangkalian diterima.','Latihan peribadi menghasilkan pelan pembelajaran. Ia tidak membuka peringkat saringan atau meramal penerimaan.']},
 'background':{'en':['CTOS Basic, CCRIS and criminal evidence have separate consent. Official providers are not configured; mock/manual evidence needs human review. An unavailable provider is not adverse evidence.','Background checks use labelled mocks or unverified manual evidence. Official checks are unavailable, consent is specific to each purpose, and people review outcomes.'], 'ms':['CTOS Basic, CCRIS dan bukti jenayah mempunyai persetujuan berasingan. Penyedia rasmi belum dikonfigurasi; bukti mock/manual memerlukan semakan manusia. Penyedia tidak tersedia bukan bukti buruk.','Semakan latar belakang menggunakan mock berlabel atau bukti manual belum disahkan. Semakan rasmi tidak tersedia, persetujuan khusus bagi setiap tujuan, dan hasil disemak manusia.']},
 'interview':{'en':['Shortlisting is separate from hiring. Interview entry requires current evidence and a human action; scheduling is available after human entry.','A human decides whether to shortlist and enter an interview. Online/physical scheduling uses assigned real interviewers.'], 'ms':['Senarai pendek berasingan daripada pengambilan. Kemasukan temu duga memerlukan bukti semasa dan tindakan manusia; penjadualan tersedia selepas kemasukan manusia.','Manusia memutuskan senarai pendek dan kemasukan temu duga. Penjadualan dalam talian/fizikal menggunakan penemu duga manusia ditugaskan.']}}
@dataclass(frozen=True)
class Decision:
 action:Literal['progress','staff_summary','schedule','faq','unsupported','denied']
 faq:str='help'
class RuleDecisionProvider:
 def decide(self,message,scope):
  text=message.casefold()
  if re.match(r'\s*(set|update|change|reject|accept|hire|send|ubah|tetapkan|tolak|terima|hantar)\b',text):return Decision('unsupported')
  if re.search(r'[\w.+-]+@[\w.-]+|other candidate|another candidate|calon lain|someone else',text):return Decision('denied')
  if scope=='candidate' and any(t in text for t in ['scheduled interview','when is my interview','jadual temu duga','bila temu duga']):return Decision('schedule')
  for code,terms in [('privacy',['privacy','privasi','delete','padam','data']),('practice',['practice','latihan','probability','kebarangkalian']),('background',['ctos','ccris','criminal','background','latar belakang']),('interview',['interview','temu duga'])]:
   if any(t in text for t in terms):return Decision('faq',code)
  if any(t in text for t in ['progress','status','where','kemajuan','peringkat','di mana','queue','pipeline']):return Decision('staff_summary' if scope=='staff' else 'progress')
  if text.strip() in ('help','bantuan','hello','hi','hai'):return Decision('faq')
  return Decision('unsupported')
class ChatRequest(BaseModel):
 model_config=ConfigDict(extra='forbid')
 message:str=Field(min_length=1,max_length=1000)
 locale:Literal['en','ms']='en'
 scope:Literal['candidate','staff']='candidate'
 application_id:UUID|None=None
 job_id:UUID|None=None
class ToolRequest(ToolArguments):
 scope:Literal['candidate','staff']='candidate'

def options(scope,user,store=gateway):
 return invoke('staff_jobs' if scope=='staff' else 'candidate_applications',{},user,store)

def answer(payload:ChatRequest,user:Principal,store=gateway,provider=wording_provider):
 if payload.scope=='staff' and user.aal!='aal2':raise HTTPException(403,'Staff MFA verification is required')
 if (payload.scope=='candidate' and payload.job_id) or (payload.scope=='staff' and payload.application_id):raise HTTPException(422,'Invalid assistant selection')
 decision=RuleDecisionProvider().decide(payload.message,payload.scope)
 external=decision.action=='faq' and get_settings().EXTERNAL_LLM_ENABLED
 requested=get_settings().MORPHEUS_MODEL if get_settings().LLM_PROVIDER=='morpheus' else 'typesafe/jev-router'
 begin_payload={'p_scope':payload.scope,'p_external':external}
 begin_rpc='m6_begin'
 if external and get_settings().LLM_PROVIDER=='morpheus':
  begin_rpc='m6_begin_provider';begin_payload['p_requested_model']=requested
 event=store.rpc(begin_rpc,token=user.token,payload=begin_payload)
 ms=payload.locale=='ms';tool='unsupported';warning=None;wording=Wording();citations=[];selection=[];data=None
 try:
  if decision.action=='denied':raise HTTPException(403,'Access denied')
  if decision.action=='faq':
   tool='faq'
   if external:
    wording=provider.choose_wording(decision.faq,payload.locale) if event['external_reserved'] else Wording(fallback_warning=event.get('fallback_warning') or 'quota_exhausted')
   else:wording=Wording(fallback_warning='external_disabled')
   text=FAQ[decision.faq][payload.locale][wording.variant]
   citations=[{'source':'faq-v1','id':decision.faq,'updated_at':'2026-10-02','url':None}]
  elif decision.action=='schedule':
   tool='my_interviews'
   mentioned=re.search(r'\b[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\b',payload.message)
   target=payload.application_id or (UUID(mentioned.group(0)) if mentioned else None)
   if mentioned and target and str(target).lower()!=mentioned.group(0).lower():raise HTTPException(403,'Access denied')
   if target:invoke('candidate_progress',{'application_id':str(target)},user,store)
   data=[{'id':b['id'],'application_id':b['application_id'],'state':b['state'],'revision':b['revision'],'slot':{k:b['slot'][k] for k in ('starts_at','ends_at','timezone','mode','location')},'updated_at':b['updated_at']} for b in invoke(tool,{},user,store) if not target or b['application_id']==str(target)]
   text=('Temu duga anda: ' if ms else 'Your interviews: ')+('; '.join(b['slot']['starts_at']+' / '+b['state'] for b in data) or ('Tiada jadual tersedia.' if ms else 'No schedule available.'))
   citations=[{'source':'my_interviews','id':b['id'],'updated_at':b['updated_at'],'url':None} for b in data]
  elif decision.action in ('progress','staff_summary'):
   # An explicitly mentioned UUID is authorized as a target, never as an actor.
   mentioned=re.search(r'\b[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\b',payload.message)
   target=payload.job_id if payload.scope=='staff' else payload.application_id
   if mentioned:
    if target and str(target).lower()!=mentioned.group(0).lower():raise HTTPException(403,'Access denied')
    target=UUID(mentioned.group(0))
   if target is None:
    selection=options(payload.scope,user,store)
    # Multiple applications/jobs always need explicit selection; never guess by partial title.
    if len(selection)==1:target=UUID(selection[0]['id'])
   if target is None:
    tool='staff_jobs' if payload.scope=='staff' else 'candidate_applications'
    text='Pilih permohonan atau jawatan untuk jawapan tepat.' if ms else 'Select an application or assigned role for an exact answer.'
   else:
    tool='staff_summary' if payload.scope=='staff' else 'candidate_progress'
    data=invoke(tool,{'job_id' if payload.scope=='staff' else 'application_id':str(target)},user,store)
    if payload.scope=='staff':text=('Jumlah permohonan jawatan ditugaskan: ' if ms else 'Assigned-role application totals: ')+', '.join(f"{c['stage']} / {c['status']}: {c['count']}" for c in data['counts'])
    else:text=f"{data['title']} — {data['stage']} / {data['status']}. "+('Tindakan seterusnya: ' if ms else 'Next action: ')+data['next_action']+'.'
    citations=[{'source':tool,'id':str(target),'updated_at':data['updated_at'],'url':'/foundation?application='+str(target) if payload.scope=='candidate' else None}]
  else:
   warning='unsupported_request';text='Saya hanya boleh membaca kemajuan dan menjawab FAQ diluluskan. Keputusan dan tindakan memerlukan manusia.' if ms else 'I can only read progress and answer approved FAQs. Decisions and changes require a human.'
 except HTTPException as e:
  warning='access_denied' if e.status_code in (401,403,404) else 'data_unavailable';tool='denied' if warning=='access_denied' else tool
  # Never fabricate progress when authorized data service fails.
  text='Akses ditolak.' if warning=='access_denied' and ms else 'Access denied.' if warning=='access_denied' else 'Kemajuan tidak tersedia; cuba semula.' if ms else 'Progress unavailable; try again.'
  data=None;selection=[];citations=[]
 warning=warning or wording.fallback_warning
 store.rpc('m6_complete',token=user.token,payload={'p_event':event['id'],'p_tool':tool,'p_warning':warning,'p_actual':wording.actual_model,'p_provider':wording.provider})
 return {'answer':text,'data':data,'choices':selection,'citations':citations,'fallback_warning':warning,'read_only':True,
 'provenance':{'requested_model':requested if external else 'rules','actual_model':wording.actual_model,'provider':wording.provider,'plan':'rules-v1','input_scope':'public_faq_code_only' if external else 'authorized_views_only'}}

@router.get('/options')
def get_options(scope:Literal['candidate','staff']='candidate',user:Principal=Depends(require_user)):
 return options(scope,user,gateway)
@router.post('/messages')
def message(payload:ChatRequest,user:Principal=Depends(require_write)):
 return answer(payload,user,gateway)
@router.post('/tools/{name}')
def tool(name:str,payload:ToolRequest,user:Principal=Depends(require_write)):
 allowed=['staff_jobs','staff_summary'] if payload.scope=='staff' else ['candidate_applications','candidate_progress','my_interviews']
 if name not in allowed:raise HTTPException(403,'Tool unavailable')
 return invoke(name,payload.model_dump(exclude={'scope'},exclude_none=True),user,gateway)
