export type PerplexityChatOpts = {
  apiKey: string;
  model?: string;
  system: string;
  user: string;
  responseFormat?: "json_object" | "text";
};

const DEFAULT_MODEL = "llama-3.1-sonar-large-128k-online";
const ENDPOINT = "https://api.perplexity.ai/chat/completions";

export async function perplexityChat(opts: PerplexityChatOpts): Promise<string> {
  const body = {
    model: opts.model ?? DEFAULT_MODEL,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user }
    ],
    response_format: opts.responseFormat === "json_object" ? { type: "json_object" } : undefined
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Perplexity HTTP ${res.status} ${res.statusText}: ${text}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Perplexity response missing choices[0].message.content");
  }
  return content;
}

/**
 * Pull a JSON object out of a model response that may include
 * fenced code blocks or trailing prose.
 */
export function extractJsonObject(raw: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = fenced ? fenced[1].trim() : raw.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < 0 || end < start) {
    throw new Error("Could not find a JSON object in the model response.");
  }
  return candidate.slice(start, end + 1);
}
