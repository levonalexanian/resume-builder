from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Literal
from urllib.parse import quote

import httpx

from ..util.env import ResumeEnv

DraftProvider = Literal["openai", "anthropic", "google"]

_FENCED_LATEX_RE = re.compile(r"```(?:latex|tex)?\s*([\s\S]*?)```", re.IGNORECASE)


@dataclass(slots=True)
class DraftRequest:
    system: str
    user: str


DraftClient = Callable[[DraftRequest], Awaitable[str]]


async def _post_json(url: str, headers: dict[str, str], body: dict[str, object]) -> dict[str, object]:
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        res = await client.post(url, headers=headers, json=body)
        if res.status_code >= 400:
            raise RuntimeError(f"HTTP {res.status_code}: {res.text}")
        return res.json()


async def _call_openai(api_key: str, req: DraftRequest) -> str:
    data = await _post_json(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        body={
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": req.system},
                {"role": "user", "content": req.user},
            ],
            "temperature": 0.2,
        },
    )
    choices = data.get("choices") if isinstance(data, dict) else None
    if not choices:
        raise RuntimeError("OpenAI response missing message content")
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str):
        raise RuntimeError("OpenAI response missing message content")
    return content


async def _call_anthropic(api_key: str, req: DraftRequest) -> str:
    data = await _post_json(
        "https://api.anthropic.com/v1/messages",
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        body={
            "model": "claude-3-5-sonnet-latest",
            "max_tokens": 4096,
            "system": req.system,
            "messages": [{"role": "user", "content": req.user}],
        },
    )
    content_blocks = data.get("content") if isinstance(data, dict) else None
    if not isinstance(content_blocks, list):
        raise RuntimeError("Anthropic response missing content[].text")
    for block in content_blocks:
        if isinstance(block, dict) and block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str):
                return text
    raise RuntimeError("Anthropic response missing content[].text")


async def _call_google(api_key: str, req: DraftRequest) -> str:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-1.5-flash:generateContent?key={quote(api_key, safe='')}"
    )
    data = await _post_json(
        url,
        headers={"Content-Type": "application/json"},
        body={
            "systemInstruction": {"role": "system", "parts": [{"text": req.system}]},
            "contents": [{"role": "user", "parts": [{"text": req.user}]}],
            "generationConfig": {"temperature": 0.2},
        },
    )
    candidates = data.get("candidates") if isinstance(data, dict) else None
    if not candidates:
        raise RuntimeError("Google response missing candidates[].content.parts[].text")
    content = candidates[0].get("content") if isinstance(candidates[0], dict) else None
    parts = content.get("parts") if isinstance(content, dict) else None
    if not isinstance(parts, list):
        raise RuntimeError("Google response missing candidates[].content.parts[].text")
    text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
    if not text:
        raise RuntimeError("Google response missing candidates[].content.parts[].text")
    return text


@dataclass(slots=True)
class ResolvedDraftProvider:
    provider: DraftProvider
    client: DraftClient


def resolve_draft_provider(env: ResumeEnv) -> ResolvedDraftProvider:
    provider: DraftProvider = env.RESUME_DRAFT_PROVIDER or "openai"
    if provider == "openai":
        if not env.OPENAI_API_KEY:
            raise RuntimeError("RESUME_DRAFT_PROVIDER=openai requires OPENAI_API_KEY.")
        api_key = env.OPENAI_API_KEY
        return ResolvedDraftProvider(provider=provider, client=lambda req: _call_openai(api_key, req))
    if provider == "anthropic":
        if not env.ANTHROPIC_API_KEY:
            raise RuntimeError("RESUME_DRAFT_PROVIDER=anthropic requires ANTHROPIC_API_KEY.")
        api_key = env.ANTHROPIC_API_KEY
        return ResolvedDraftProvider(provider=provider, client=lambda req: _call_anthropic(api_key, req))
    if provider == "google":
        if not env.GOOGLE_GENERATIVE_AI_API_KEY:
            raise RuntimeError("RESUME_DRAFT_PROVIDER=google requires GOOGLE_GENERATIVE_AI_API_KEY.")
        api_key = env.GOOGLE_GENERATIVE_AI_API_KEY
        return ResolvedDraftProvider(provider=provider, client=lambda req: _call_google(api_key, req))
    raise RuntimeError(f"Unknown RESUME_DRAFT_PROVIDER: {provider}")


def extract_latex_document(raw: str) -> str:
    fenced = _FENCED_LATEX_RE.search(raw)
    if fenced:
        return fenced.group(1).strip() + "\n"
    return raw.strip() + "\n"
