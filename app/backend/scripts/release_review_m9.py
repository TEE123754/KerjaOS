"""Generate license inventory and scan built public artifacts without printing matches."""
import importlib.metadata,json,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
patterns=[re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),re.compile(r'sb_secret_[A-Za-z0-9_-]{16,}'),re.compile(r'sk-or-v1-[A-Za-z0-9]{32,}'),re.compile(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}')]

def main():
 lock=json.loads((root/'package-lock.json').read_text());npm=[]
 for path,item in lock['packages'].items():
  if not path or item.get('dev'):continue
  npm.append({'package':path,'version':item.get('version'),'license':item.get('license','REVIEW_REQUIRED')})
 py=[]
 for line in (root/'backend/requirements-m1.txt').read_text().splitlines():
  if '==' not in line:continue
  name,version=line.split('==');name=name.split('[')[0]
  try:
   meta=importlib.metadata.metadata(name);license=meta.get('License-Expression') or meta.get('License') or 'REVIEW_REQUIRED'
  except importlib.metadata.PackageNotFoundError:license='NOT_INSTALLED_REVIEW_REQUIRED'
  py.append({'package':name,'version':version,'license':license})
 files=[p for p in (root/'dist').rglob('*') if p.is_file()];suspects=[]
 if not files:raise SystemExit('Build public artifacts before release review')
 for p in files:
  value=p.read_text(errors='ignore')
  if any(pattern.search(value) for pattern in patterns):suspects.append(str(p.relative_to(root)))
 report={'production_npm':npm,'production_python':py,'scope':'production lock inventory; retained legacy/optional code has separate license review','public_bytes':sum(p.stat().st_size for p in files),'scanned_public_files':len(files),'secret_pattern_suspect_files':suspects,'limitations':'Pattern scan is not proof of no secrets. Runtime logs and hosted env/exports require operator review; unknown/legacy/model licenses block activation.'}
 target=root/'docs/m9/INVENTORY.json';target.write_text(json.dumps(report,indent=2));print(f'Inventory written; public files scanned: {len(files)}; suspect file count: {len(suspects)}')
 if suspects:raise SystemExit(1)
if __name__=='__main__':main()
