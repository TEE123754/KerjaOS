"""Sanitized read-only setup gate; optional single public-FAQ AI smoke. No SQL writes."""
import argparse
import json
import sys
from pathlib import Path
import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.foundation.config import FoundationSettings
from app.foundation.morpheus_provider import MorpheusProvider


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ai-smoke',action='store_true',help='One bounded FAQ generation, consumes provider credits')
    args=parser.parse_args()
    cfg=FoundationSettings(_env_file=ROOT/'.env')
    results={'local_auth_configured':cfg.configured,'database_url_configured':bool(cfg.DATABASE_URL)}
    with httpx.Client(timeout=20,follow_redirects=False) as client:
        paths=(('supabase_auth','/auth/v1/settings',cfg.SUPABASE_PUBLISHABLE_KEY),
               ('supabase_jwks','/auth/v1/.well-known/jwks.json',cfg.SUPABASE_PUBLISHABLE_KEY),
               ('supabase_m1_jobs','/rest/v1/m1_jobs?select=id&limit=0',cfg.SUPABASE_PUBLISHABLE_KEY),
               ('supabase_schema','/rest/v1/',cfg.SUPABASE_SERVICE_ROLE_KEY),
               ('supabase_storage','/storage/v1/bucket',cfg.SUPABASE_SERVICE_ROLE_KEY))
        for label,path,key in paths:
            try:
                r=client.get(cfg.SUPABASE_URL+path,headers={'apikey':key})
                results[label]={'http_status':r.status_code}
                if label=='supabase_schema' and r.is_success:
                    paths=r.json().get('paths',{})
                    results[label]['public_table_count']=sum(not p.startswith('/rpc/') and p!='/' for p in paths)
                    results[label]['m12_rpc_present']=any(p.startswith('/rpc/m12_') for p in paths)
                    results[label]['provider_metadata_rpc_present']='/rpc/m6_begin_provider' in paths
                if label=='supabase_storage' and r.is_success:
                    buckets=r.json()
                    results[label]['private_bucket_present']=any(b.get('id')==cfg.DOCUMENT_BUCKET and b.get('public') is False for b in buckets)
                if r.is_error:
                    try:
                        code=r.json().get('code','')
                        if code in ('PGRST205','PGRST202','42P01'):results[label]['missing_schema']=True
                    except (ValueError,AttributeError):pass
            except httpx.HTTPError:results[label]={'unavailable':True}
    if args.ai_smoke:
        from app.foundation import morpheus_provider as module
        module.get_settings=lambda:cfg
        result=MorpheusProvider().choose_wording('privacy','en')
        results['morpheus_smoke']={'model':result.actual_model,'provider':result.provider,
                                  'valid_variant':result.fallback_warning is None and result.variant in (0,1),'fallback_warning':result.fallback_warning}
    print(json.dumps(results,indent=2))


if __name__=='__main__':main()
