"""Authenticated encrypted archive; bounded, verified staging without live restore."""
import hashlib
import io
import json
import stat
import zipfile
from pathlib import Path, PurePosixPath
from cryptography.fernet import Fernet

MAX_BYTES=256*1024*1024

def safe_name(name):
    p=PurePosixPath(name)
    if not name or name.startswith('/') or '\\' in name or ':' in name or any(x in ('','..','.') for x in name.split('/')):
        raise ValueError('Unsafe archive member')
    return p

def seal(database:bytes,objects:dict[str,bytes],ledger:dict,key:bytes)->bytes:
    files={'database.dump':database,'deletion-ledger.json':json.dumps(ledger,sort_keys=True).encode()}
    for name,value in objects.items():
        safe_name(name);files['objects/'+name]=value
    if sum(map(len,files.values()))>MAX_BYTES:raise ValueError('Archive exceeds local memory budget')
    manifest={'version':1,'files':{name:{'bytes':len(value),'sha256':hashlib.sha256(value).hexdigest()} for name,value in files.items()}}
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name,value in files.items():z.writestr(name,value)
        z.writestr('manifest.json',json.dumps(manifest,sort_keys=True))
    return Fernet(key).encrypt(stream.getvalue())

def open_archive(encrypted:bytes,key:bytes)->dict[str,bytes]:
    if len(encrypted)>MAX_BYTES*2:raise ValueError('Encrypted archive too large')
    plain=Fernet(key).decrypt(encrypted)
    if len(plain)>MAX_BYTES:raise ValueError('Archive too large')
    with zipfile.ZipFile(io.BytesIO(plain)) as z:
        infos=z.infolist()
        if len(infos)>10000 or sum(i.file_size for i in infos)>MAX_BYTES:raise ValueError('Archive exceeds limits')
        names=[i.filename for i in infos]
        if len(set(names))!=len(names):raise ValueError('Duplicate archive members')
        for i in infos:
            safe_name(i.filename)
            if i.is_dir() or stat.S_ISLNK(i.external_attr>>16):raise ValueError('Archive links/directories denied')
        manifest=json.loads(z.read('manifest.json'))
        if manifest.get('version')!=1 or set(names)!=(set(manifest['files'])|{'manifest.json'}):raise ValueError('Invalid manifest')
        result={}
        for name,entry in manifest['files'].items():
            value=z.read(name)
            if len(value)!=entry['bytes'] or hashlib.sha256(value).hexdigest()!=entry['sha256']:raise ValueError('Archive integrity mismatch')
            if name not in ('database.dump','deletion-ledger.json') and not name.startswith('objects/'):raise ValueError('Unknown archive payload')
            result[name]=value
        if not {'database.dump','deletion-ledger.json'}<=set(result):raise ValueError('Incomplete archive')
        return result

def stage(encrypted:bytes,key:bytes,target:Path):
    files=open_archive(encrypted,key) # Validate everything before writing.
    target=target.resolve()
    target.mkdir(exist_ok=False,parents=False) # Existing destinations are never overwritten.
    for name,value in files.items():
        destination=target.joinpath(*safe_name(name).parts)
        destination.parent.mkdir(parents=True,exist_ok=True)
        with destination.open('xb') as f:f.write(value)
    return len(files)
