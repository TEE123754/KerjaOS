"""Local assistance only. No network calls, biometrics or official registry claims."""
from dataclasses import dataclass
from datetime import datetime
import re
from .privacy import normalize_document_text


@dataclass(frozen=True)
class IdentityResult:
    state: str
    method: str
    official: bool = False


class ManualEvidenceProvider:
    def request(self): return IdentityResult('needs_review','manual')
    def result(self, *, attested: bool):
        return IdentityResult('verified_manual' if attested else 'needs_review','manual')


class MockIdentityProvider:
    def request(self): return IdentityResult('needs_review','mock')
    def result(self, *, attested: bool):
        return IdentityResult('verified_mock' if attested else 'needs_review','mock')


class UnconfiguredEkycProvider:
    def request(self): return IdentityResult('not_configured','unconfigured')
    def result(self, **kwargs): return self.request()


def mykad_consistency(text: str):
    """Return flags only. Never return/store the number, birth date or OCR text."""
    value=normalize_document_text(text,10000)
    match=re.search(r'(?<!\d)(\d{6})[- ]?(\d{2})[- ]?(\d{4})(?!\d)',value)
    valid=False
    if match:
        try: datetime.strptime(match.group(1),'%y%m%d'); valid=True
        except ValueError: pass
    return {'number_format_found':bool(match),'date_component_consistent':valid,'state':'evidence_consistent' if valid else 'needs_review','official':False}


def optional_local_ocr(image_bytes: bytes):
    """Operator-local optional RapidOCR. Hosted API never imports/loads this model."""
    try: from rapidocr_onnxruntime import RapidOCR
    except ImportError: return {'state':'not_configured','official':False}
    try:
        result,_=RapidOCR()(image_bytes)
        text='\n'.join(item[1] for item in (result or []))
        return mykad_consistency(text)
    except Exception:
        return {'state':'needs_review','official':False}
