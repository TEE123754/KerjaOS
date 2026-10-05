"""Metadata-only source adapters and deterministic listing classifier; no AI/PII."""
import html
import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode
from .job_fetch import FetchFailure,safe_url

@dataclass(frozen=True)
class SourceBatch:
 listings:list
 complete:bool
class JobSourceAdapter(Protocol):
 def load(self,source,fetcher)->SourceBatch:...

def clean(value,limit):
 if not isinstance(value,(str,int)):return ''
 s=html.unescape(str(value));s=re.sub(r'<[^>]*>',' ',s)
 s=''.join(c for c in unicodedata.normalize('NFKC',s) if not unicodedata.category(c).startswith('C'))
 return ' '.join(s.split())[:limit]

def canonical(url,hosts):
 p=urlsplit(safe_url(url,hosts));q=[(k,v) for k,v in parse_qsl(p.query) if k=='gh_jid']
 return urlunsplit((p.scheme,p.netloc,p.path.rstrip('/') or '/',urlencode(q),''))

class ListingDecisionProvider:
 def decide(self,title,location):
  text=(title+' '+location).casefold()
  flagged=any(t in text for t in ['pay upfront','registration fee','guaranteed income','bayaran pendahuluan','ignore instructions','reveal secrets'])
  return {'category':'technology' if any(t in text for t in ['engineer','developer','data','software','jurutera']) else 'business' if any(t in text for t in ['sales','finance','marketing','jualan']) else 'other',
   'seniority':'senior' if any(t in text for t in ['senior','lead','principal']) else 'junior' if any(t in text for t in ['junior','intern','graduate','pelatih']) else 'unspecified',
   'region':'malaysia' if any(t in text for t in ['malaysia','kuala lumpur','penang','selangor','johor','pulau pinang']) else 'remote' if any(t in text for t in ['remote','jarak jauh']) else 'unknown',
   'classification':'flagged' if flagged else 'unverified'}

def normalize(pid,title,company,location,url,source):
 pid=clean(pid,160);title=clean(title,200);company=clean(company,100);location=clean(location,200)
 if not pid or not title or not company:raise FetchFailure('invalid_feed')
 return {'provider_id':pid,'title':title,'company':company,'location':location,'url':canonical(url,source['allowed_hosts']),**ListingDecisionProvider().decide(title,location)}

def finish(rows,complete):
 dedup={}
 for row in rows:
  key=row['url'];dedup.setdefault(key,row)
 return SourceBatch(list(dedup.values())[:50],complete and len(dedup)<=50)

def source_endpoint(source,kind):
 board=source.get('board','')
 if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',board):raise FetchFailure('unsafe_target')
 expected=f'https://boards-api.greenhouse.io/v1/boards/{board}/jobs' if kind=='greenhouse' else f'https://api.lever.co/v0/postings/{board}?mode=json&limit=50'
 if source['endpoint']!=expected:raise FetchFailure('unsafe_target')
 return expected

class GreenhouseAdapter:
 def load(self,s,f):
  url=source_endpoint(s,'greenhouse');r=f.get(url)
  try:
   data=json.loads(r.content);jobs=data['jobs'];total=data.get('meta',{}).get('total',len(jobs))
   if not isinstance(jobs,list) or not isinstance(total,int):raise ValueError()
   rows=[normalize(j['id'],j['title'],s['name'],j.get('location',{}).get('name',''),j['absolute_url'],s) for j in jobs[:50] if j.get('internal_job_id') is not None]
   return finish(rows,len(jobs)<=50 and total<=len(jobs))
  except (ValueError,TypeError,KeyError,AttributeError):raise FetchFailure('invalid_feed') from None
class LeverAdapter:
 def load(self,s,f):
  r=f.get(source_endpoint(s,'lever'))
  try:
   jobs=json.loads(r.content)
   if not isinstance(jobs,list):raise ValueError()
   rows=[normalize(j['id'],j['text'],s['name'],j.get('categories',{}).get('location',''),j.get('applyUrl') or j['hostedUrl'],s) for j in jobs[:50]]
   return finish(rows,len(jobs)<50)
  except (ValueError,TypeError,KeyError,AttributeError):raise FetchFailure('invalid_feed') from None
class ScraplingCareerAdapter:
 def load(self,s,f):
  # Static parser only: fetchers/stealth/browser/proxies are never imported.
  try:from scrapling import Selector
  except ImportError:raise FetchFailure('optional_unavailable') from None
  r=f.get(s['endpoint'],enforce_robots=True)
  try:
   page=Selector(r.content.decode('utf-8'));rows=[];objects=[]
   for raw in page.css('script[type="application/ld+json"]::text').getall():
    data=json.loads(raw);objects.extend(data if isinstance(data,list) else data.get('@graph',[data]))
   for j in objects:
    if j.get('@type')!='JobPosting':continue
    address=j.get('jobLocation',{}).get('address',{})
    location=' '.join(str(address.get(k,'')) for k in ['addressLocality','addressRegion','addressCountry'])
    if j.get('jobLocationType')=='TELECOMMUTE':location+=' remote'
    rows.append(normalize(j.get('identifier',{}).get('value') or j.get('url'),j['title'],j.get('hiringOrganization',{}).get('name') or s['name'],location,j['url'],s))
   # Single structured page cannot prove entire career-board removals.
   return finish(rows,False)
  except (ValueError,TypeError,KeyError,AttributeError):raise FetchFailure('invalid_feed') from None
ADAPTERS={'greenhouse':GreenhouseAdapter(),'lever':LeverAdapter(),'scrapling':ScraplingCareerAdapter()}
