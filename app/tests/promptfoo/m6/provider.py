"""Local synthetic evaluation. Calls active deterministic service, never a model."""
import json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root/'backend'))
sys.path.insert(0,str(root/'backend/tests/foundation'))
from chat_fixture import evaluate
def call_api(prompt,options,context):
 return {'output':json.dumps(evaluate(json.loads(prompt)),ensure_ascii=False)}
