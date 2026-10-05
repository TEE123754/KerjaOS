"""No proxy/cookie/browser fetcher. Validate every target, pin public IP before TLS."""
import http.client
import ipaddress
import socket
import ssl
import re
import time
import threading
from dataclasses import dataclass
from urllib.parse import urlsplit,urlunsplit,urljoin
from urllib.robotparser import RobotFileParser
from email.utils import parsedate_to_datetime
from datetime import datetime,timezone

USER_AGENT='KerjaOS-Discovery/1.0'
class FetchFailure(Exception):
 def __init__(self,code,retry=3600):self.code=code;self.retry=min(max(int(retry),60),86400);super().__init__(code)

def safe_url(url,hosts):
 if not isinstance(url,str) or len(url)>2000 or any(c.isspace() or c in '\\' or ord(c)<32 for c in url):raise FetchFailure('unsafe_target')
 try:p=urlsplit(url)
 except ValueError:raise FetchFailure('unsafe_target') from None
 try:port=p.port
 except ValueError:raise FetchFailure('unsafe_target') from None
 if p.scheme!='https' or p.username or p.password or port not in (None,443) or not p.hostname or p.hostname not in hosts or '%' in p.netloc:raise FetchFailure('unsafe_target')
 host=p.hostname
 try:
  if not ipaddress.ip_address(host).is_global:raise FetchFailure('unsafe_target')
 except ValueError:pass
 if host=='localhost' or host.endswith(('.localhost','.local','.internal')):raise FetchFailure('unsafe_target')
 return urlunsplit(('https',host,p.path or '/',p.query,''))

def public_addresses(host,resolver=socket.getaddrinfo):
 try:records=resolver(host,443,type=socket.SOCK_STREAM)
 except OSError:raise FetchFailure('unavailable') from None
 addresses=list(dict.fromkeys(r[4][0] for r in records))
 if not addresses or any('%' in a or not ipaddress.ip_address(a).is_global for a in addresses):raise FetchFailure('unsafe_target')
 return addresses

class PinnedHTTPS(http.client.HTTPSConnection):
 def connect(self):
  addresses=public_addresses(self.host)
  remaining=getattr(self,'deadline',time.monotonic()+self.timeout)-time.monotonic()
  if remaining<=0:raise FetchFailure('timeout')
  sock=socket.create_connection((addresses[0],443),remaining)
  self.sock=sock
  try:
   self.sock=ssl.create_default_context().wrap_socket(sock,server_hostname=self.host,do_handshake_on_connect=False)
   self.sock.do_handshake()
  except Exception:sock.close();raise

@dataclass
class FetchResponse:
 status:int
 headers:dict
 content:bytes
 url:str

def network_get(url,timeout=8):
 p=urlsplit(url);connection=PinnedHTTPS(p.hostname,443,timeout=timeout)
 deadline=time.monotonic()+timeout;connection.deadline=deadline
 expired=threading.Event();active_socket=None
 def abort():
  expired.set();sock=active_socket or connection.sock
  if sock:
   try:sock.shutdown(socket.SHUT_RDWR)
   except OSError:pass
 timer=threading.Timer(timeout,abort);timer.daemon=True;timer.start()
 try:
  connection.request('GET',p.path+('?' +p.query if p.query else ''),headers={'User-Agent':USER_AGENT,'Accept':'application/json,text/html,text/plain','Accept-Encoding':'identity','Connection':'close'})
  active_socket=connection.sock
  r=connection.getresponse();headers={k.lower():v for k,v in r.getheaders()}
  # Redirect bodies are not consumed; next hop is independently checked/pinned.
  if 300<=r.status<400:return FetchResponse(r.status,headers,b'',url)
  if headers.get('content-encoding','identity').lower() not in ('identity',''):raise FetchFailure('invalid_feed')
  declared=headers.get('content-length')
  if declared and (not declared.isdigit() or int(declared)>1048576):raise FetchFailure('invalid_feed')
  chunks=[];size=0
  while True:
   remaining=deadline-time.monotonic()
   if remaining<=0:raise FetchFailure('timeout')
   if active_socket:active_socket.settimeout(remaining)
   # read1 performs one underlying read, so trickled bytes cannot hide the deadline.
   part=r.read1(16384)
   if not part:break
   size+=len(part)
   if size>1048576:raise FetchFailure('invalid_feed')
   chunks.append(part)
  return FetchResponse(r.status,headers,b''.join(chunks),url)
 except (TimeoutError,socket.timeout):raise FetchFailure('timeout') from None
 except (OSError,http.client.HTTPException):raise FetchFailure('timeout' if expired.is_set() else 'unavailable') from None
 finally:timer.cancel();connection.close()

def retry_after(value):
 try:return min(max(int(value),60),86400)
 except (ValueError,TypeError):
  try:return min(max(int((parsedate_to_datetime(value)-datetime.now(timezone.utc)).total_seconds()),60),86400)
  except (ValueError,TypeError,OverflowError):return 3600

class SafeFetcher:
 def __init__(self,hosts,request=network_get,clock=time.monotonic,sleep=time.sleep):
  self.hosts=hosts;self.request=request;self.clock=clock;self.sleep=sleep;self.last={};self.cache={};self.calls=0
 def get(self,url,*,robots=False,enforce_robots=False):
  url=safe_url(url,self.hosts)
  if enforce_robots:self.obey_robots(url)
  cached=self.cache.get(url)
  if cached and cached[0]>self.clock():return cached[1]
  for hop in range(3):
   if enforce_robots and hop:self.obey_robots(url)
   host=urlsplit(url).hostname
   delay=max(0,1-(self.clock()-self.last.get(host,-100)))
   if delay:self.sleep(delay)
   self.last[host]=self.clock();self.calls+=1
   if self.calls>6:raise FetchFailure('invalid_feed')
   r=self.request(url)
   if r.status in (301,302,303,307,308):
    url=safe_url(urljoin(url,r.headers.get('location','')),self.hosts);continue
   if r.status in (401,403):raise FetchFailure('blocked')
   if r.status==429:raise FetchFailure('rate_limited',retry_after(r.headers.get('retry-after')))
   if r.status==404 and robots:raise FetchFailure('robots_denied')
   if r.status!=200:raise FetchFailure('unavailable')
   if len(r.content)>1048576:raise FetchFailure('invalid_feed')
   self.cache[url]=(self.clock()+300,r);return r
  raise FetchFailure('unsafe_target')
 def obey_robots(self,url):
  p=urlsplit(safe_url(url,self.hosts));r=self.get('https://'+p.hostname+'/robots.txt',robots=True)
  raw=r.content.decode('utf-8','replace')
  robot=RobotFileParser();robot.parse(raw.splitlines())
  if not robot.can_fetch(USER_AGENT,url):raise FetchFailure('robots_denied')
  delay=robot.crawl_delay(USER_AGENT)
  rate=robot.request_rate(USER_AGENT)
  # stdlib ignores fractional crawl-delay; conservatively honor every declared delay.
  declared=re.findall(r'^\s*crawl-delay\s*:\s*([^#\r\n]+)',raw,re.I|re.M)
  try:extra=max([float(v.strip()) for v in declared]+[1])
  except ValueError:raise FetchFailure('robots_denied') from None
  if not all(float(v.strip())>=0 for v in declared):raise FetchFailure('robots_denied')
  if re.search(r'^\s*request-rate\s*:',raw,re.I|re.M) and rate is None:raise FetchFailure('robots_denied')
  required=max(float(delay or 1),float(rate.seconds/rate.requests) if rate else 1,extra)
  # Refuse long schedules; operator can configure a slower separate run, never bypass.
  if required>10:raise FetchFailure('robots_denied')
  if required>1:self.sleep(required)
