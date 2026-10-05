"""Free workflow adapters. Never request portal credentials or produce 'clear'."""
from dataclasses import dataclass
from typing import Protocol, Literal

Kind=Literal['ctos_basic','ccris','criminal']
@dataclass(frozen=True)
class CheckResult:
 state:str
 provenance:str
 coverage:str
 official:bool=False
 expiry_days:int=30

class CreditCheckProvider(Protocol):
 def request(self,kind:Kind,scenario:str='ambiguous')->CheckResult:...
 def status(self,kind:Kind,scenario:str='ambiguous')->CheckResult:...
 def cancel(self)->CheckResult:...
class CriminalCheckProvider(CreditCheckProvider,Protocol):pass

class MockCheckProvider:
 def request(self,kind:Kind,scenario:str='ambiguous')->CheckResult:
  if kind not in ('ctos_basic','ccris','criminal') or scenario not in ('ambiguous','consistent','unavailable'):raise ValueError('Unsupported synthetic scenario')
  return CheckResult({'ambiguous':'needs_review','consistent':'evidence_consistent','unavailable':'unavailable'}[scenario],'mock','synthetic_workflow_only')
 status=request
 def cancel(self):return CheckResult('cancelled','mock','no_check_performed',expiry_days=0)

class ManualEvidenceProvider:
 def request(self,kind:Kind,scenario:str='ambiguous')->CheckResult:
  return CheckResult('awaiting_document','candidate_supplied_unverified','manual_document_only')
 status=request
 def cancel(self):return CheckResult('cancelled','manual','no_check_performed',expiry_days=0)

class UnconfiguredCreditProvider:
 def request(self,kind:Kind,scenario:str='ambiguous')->CheckResult:
  return CheckResult('unavailable','not_configured','no_check_performed',expiry_days=0)
 status=request
 def cancel(self):return CheckResult('cancelled','not_configured','no_check_performed',expiry_days=0)
class UnconfiguredCriminalProvider(UnconfiguredCreditProvider):pass

def provider(name:str,kind:Kind):
 if name=='mock':return MockCheckProvider()
 if name=='manual':return ManualEvidenceProvider()
 if name=='official':return UnconfiguredCriminalProvider() if kind=='criminal' else UnconfiguredCreditProvider()
 raise ValueError('Provider not configured')
