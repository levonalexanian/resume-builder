// Real-world markdown puts the colon INSIDE the bold (`- **Key:** value`),
// but we also tolerate the alternate `- **Key**: value`.
const META_LINE = /^\s*-\s*\*\*([^*:]+)(?::\*\*|\*\*:)\s*(.+?)\s*$/;

export function parseMarkdownHeadingTitle(markdown: string): string | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^\s*#{1,3}\s+(.+?)\s*$/.exec(line);
    if (m) return m[1];
  }
  return undefined;
}

export function parseMetadataLines(markdown: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const line of markdown.split(/\r?\n/)) {
    const m = META_LINE.exec(line);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();

    // Normalize some common fields.
    if (key === "position" || key === "role") meta.role = val;
    else if (key === "location") meta.location = val;
    else if (key === "duration" || key === "dates") meta.duration = val;
    else if (key === "company") meta.company = val;
    else if (key === "school") meta.school = val;
    else if (key === "diploma" || key === "degree") meta.diploma = val;
    else if (key === "gpa") meta.gpa = val;
    else meta[key] = val;
  }
  return meta;
}

const PSEUDO_BULLET_PATTERNS: RegExp[] = [
  /^\*\*[^*:]+:\*\*\s+/,
  /^\*\*[^*]+\*\*:\s+/,
  /^\[[^\]]+\]\([^)]+\)\s*$/,
  /^email:\s*/i,
  /^phone:\s*/i
];

function looksLikePseudoBullet(text: string): boolean {
  return PSEUDO_BULLET_PATTERNS.some((re) => re.test(text));
}

export function parseMarkdownBullets(markdown: string): string[] {
  const bullets: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const body = m[1];
    if (looksLikePseudoBullet(body)) continue;
    bullets.push(body);
  }
  return bullets;
}

const TAG_PATTERNS: Array<[string, RegExp]> = [
  ["typescript", /\btypescript\b|\btsx?\b/i],
  ["javascript", /\bjavascript\b|\bjs\b/i],
  ["react", /\breact\b/i],
  ["node", /\bnode\.?js\b|\bnode\b/i],
  ["graphql", /\bgraphql\b/i],
  ["sql", /\bsql\b|\bmysql\b|\bpostgres\b|\bpostgresql\b|\bsqlite\b/i],
  ["aws", /\baws\b|\bsagemaker\b|\bs3\b|\bec2\b/i],
  ["prisma", /\bprisma\b/i],
  ["python", /\bpython\b/i],
  ["cpp", /\bc\+\+|\bcpp\b/i],
  ["stm32", /\bstm32\b/i],
  ["freertos", /\bfreertos\b/i],
  ["rtos", /\brtos\b/i],
  ["cbor", /\bcbor\b/i],
  ["can", /\bcan\b\s+bus|\bcanbus\b/i],
  ["spi", /\bspi\b/i],
  ["i2c", /\bi2c\b/i],
  ["mqtt", /\bmqtt\b/i],
  ["embedded", /\bembedded\b/i],
  ["firmware", /\bfirmware\b/i],
  ["fullstack", /\bfull[-\s]?stack\b/i],
  ["frontend", /\bfrontend\b|\bfront[-\s]end\b/i],
  ["backend", /\bbackend\b|\bback[-\s]end\b/i],
  ["ai", /\bai\b|\bartificial\s+intelligence\b/i],
  ["ml", /\bmachine\s+learning\b|\bml\b/i],
  ["cv", /\bcomputer\s+vision\b/i],
  ["robotics", /\brobotics?\b/i],
  ["leadership", /\blead\b|\bleader\b|\bmentor\b|\bownership\b/i]
];

export function extractTagsFromText(text: string): string[] {
  const tags = new Set<string>();
  for (const [tag, re] of TAG_PATTERNS) {
    if (re.test(text)) tags.add(tag);
  }
  return [...tags];
}
