"""Optional operator-only OCR. No OCR model is installed in the hosted API."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.foundation.identity import validate_identity_document,MAX_IDENTITY_BYTES
from app.foundation.identity_providers import optional_local_ocr

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('image',type=Path);a=p.parse_args()
 if a.image.stat().st_size>MAX_IDENTITY_BYTES:raise SystemExit('Image too large')
 raw=a.image.read_bytes()
 content='image/png' if raw.startswith(b'\x89PNG') else 'image/jpeg'
 image,_,_=validate_identity_document(raw,content)
 print(json.dumps(optional_local_ocr(image))) # flags only; no IDs or OCR text
