import { ResumeEnv } from "../util/env.js";

export type DraftRequest = {
  system: string;
  user: string;
};

export type DraftClient = (req: DraftRequest) => Promise<string>;

async function callOpenAI(apiKey: string, req: DraftRequest): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user }
      ],
      temperature: 0.2
    })
  });
  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenAI response missing message content");
  return content;
}

async function callAnthropic(apiKey: string, req: DraftRequest): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 4096,
      system: req.system,
      messages: [{ role: "user", content: req.user }]
    })
  });
  if (!res.ok) {
    throw new Error(`Anthropic HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = data.content?.find((c) => c.type === "text")?.text;
  if (typeof text !== "string") throw new Error("Anthropic response missing content[].text");
  return text;
}

async function callGoogle(apiKey: string, req: DraftRequest): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: { temperature: 0.2 }
    })
  });
  if (!res.ok) {
    throw new Error(`Google HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Google response missing candidates[].content.parts[].text");
  return text;
}

export type ResolvedDraftProvider = { provider: "openai" | "anthropic" | "google"; client: DraftClient };

export function resolveDraftProvider(env: ResumeEnv): ResolvedDraftProvider {
  const provider = env.RESUME_DRAFT_PROVIDER ?? "openai";
  if (provider === "openai") {
    if (!env.OPENAI_API_KEY) {
      throw new Error("RESUME_DRAFT_PROVIDER=openai requires OPENAI_API_KEY.");
    }
    const apiKey = env.OPENAI_API_KEY;
    return { provider, client: (req) => callOpenAI(apiKey, req) };
  }
  if (provider === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("RESUME_DRAFT_PROVIDER=anthropic requires ANTHROPIC_API_KEY.");
    }
    const apiKey = env.ANTHROPIC_API_KEY;
    return { provider, client: (req) => callAnthropic(apiKey, req) };
  }
  if (provider === "google") {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("RESUME_DRAFT_PROVIDER=google requires GOOGLE_GENERATIVE_AI_API_KEY.");
    }
    const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY;
    return { provider, client: (req) => callGoogle(apiKey, req) };
  }
  throw new Error(`Unknown RESUME_DRAFT_PROVIDER: ${provider as string}`);
}

export function extractLatexDocument(raw: string): string {
  const fenced = /```(?:latex|tex)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced) return fenced[1].trim() + "\n";
  return raw.trim() + "\n";
}
