import json
import re
from typing import Dict, Any, List, Optional
from openai import OpenAI
from ...config import settings

def get_openai_client() -> Optional[OpenAI]:
    # M1 does not export candidate data or consume paid inference. Gateway M6
    # will introduce approved zero-price, minimal-data providers separately.
    return None
    if not settings.OPENAI_API_KEY or "your_openai" in settings.OPENAI_API_KEY:
        return None
    try:
        return OpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            max_retries=0,
            timeout=settings.LLM_TIMEOUT
        )
    except Exception:
        return None

def parse_llm_json(text: str) -> Dict[str, Any]:
    """Helper to extract and load JSON from LLM markdown code blocks if present."""
    text = text.strip()
    # Strip Qwen3 / thinking-model <think>...</think> blocks before parsing
    text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()
    # Try finding json block
    match = re.search(r"```json\s*([\s\S]*?)\s*```", text)
    if match:
        json_str = match.group(1)
    else:
        json_str = text
    try:
        return json.loads(json_str)
    except Exception as e:
        # Fallback to crude parsing or raise
        raise ValueError("Provider response did not match the required JSON schema") from None

# ==========================================
