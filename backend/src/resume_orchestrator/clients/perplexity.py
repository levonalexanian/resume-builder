from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

import httpx

DEFAULT_MODEL = "llama-3.1-sonar-large-128k-online"
ENDPOINT = "https://api.perplexity.ai/chat/completions"

_FENCED_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


@dataclass(slots=True)
class PerplexityChatOpts:
    api_key: str
    system: str
    user: str
    model: str | None = None
    response_format: Literal["json_object", "text"] | None = None


async def perplexity_chat(opts: PerplexityChatOpts) -> str:
    body: dict[str, object] = {
        "model": opts.model or DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": opts.system},
            {"role": "user", "content": opts.user},
        ],
    }
    if opts.response_format == "json_object":
        body["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
        res = await client.post(
            ENDPOINT,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {opts.api_key}",
            },
            json=body,
        )
        if res.status_code >= 400:
            text = res.text
            raise RuntimeError(f"Perplexity HTTP {res.status_code} {res.reason_phrase}: {text}")
        data = res.json()

    choices = data.get("choices") if isinstance(data, dict) else None
    if not choices:
        raise RuntimeError("Perplexity response missing choices[0].message.content")
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content:
        raise RuntimeError("Perplexity response missing choices[0].message.content")
    return content


def extract_json_object(raw: str) -> str:
    """Pull a JSON object out of a model response that may include fenced code or trailing prose."""
    fenced = _FENCED_RE.search(raw)
    candidate = fenced.group(1).strip() if fenced else raw.strip()
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start < 0 or end < 0 or end < start:
        raise RuntimeError("Could not find a JSON object in the model response.")
    return candidate[start : end + 1]
