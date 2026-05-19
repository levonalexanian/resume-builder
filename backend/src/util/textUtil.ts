const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "you",
  "your",
  "our",
  "are",
  "will",
  "this",
  "that",
  "from",
  "into",
  "have",
  "has",
  "had",
  "their",
  "they",
  "them",
  "who",
  "what",
  "when",
  "where",
  "why",
  "how",
  "about",
  "all",
  "any",
  "can",
  "may",
  "able",
  "work",
  "working"
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .filter((t) => !STOP_WORDS.has(t));
}

export function normalizeCompanyName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function safeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

export function safeBasename(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}
