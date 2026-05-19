const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

export type ParsedDate = { year: number; month: number };
export type ParsedRange = { start?: ParsedDate; end?: ParsedDate; ongoing: boolean };

function normalizeMonthToken(tok: string): number | undefined {
  const key = tok.toLowerCase().replace(/\./g, "");
  return MONTHS[key];
}

export function parseLooseDate(text: string): ParsedDate | undefined {
  if (!text) return undefined;
  const m = /([A-Za-z]+)\.?\s*(\d{4})/.exec(text);
  if (m) {
    const month = normalizeMonthToken(m[1]);
    const year = Number(m[2]);
    if (month && Number.isFinite(year)) return { year, month };
  }
  const ym = /\b(\d{4})\b/.exec(text);
  if (ym) return { year: Number(ym[1]), month: 1 };
  return undefined;
}

export function parseDateRange(text: string | undefined): ParsedRange {
  if (!text) return { ongoing: false };
  const normalized = text.replace(/[–—-]+/g, " - ");
  const ongoing = /\b(present|current|now|ongoing)\b/i.test(normalized);
  const parts = normalized.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { ongoing };
  const start = parseLooseDate(parts[0]);
  const endRaw = parts[parts.length - 1];
  const end = ongoing ? undefined : parseLooseDate(endRaw);
  return { start, end, ongoing };
}

export function monthsSince(date: ParsedDate, now: Date = new Date()): number {
  const yDelta = now.getFullYear() - date.year;
  const mDelta = now.getMonth() + 1 - date.month;
  return yDelta * 12 + mDelta;
}

/**
 * Map a parsed duration string to a freshness score in [0,1].
 * 1.0 = ongoing or ended within the last 6 months; decays linearly to 0
 * by 60 months (5 years). Unknown durations score 0.
 */
export function freshnessScore(durationText: string | undefined, now: Date = new Date()): number {
  const range = parseDateRange(durationText);
  if (range.ongoing) return 1;
  const ref = range.end ?? range.start;
  if (!ref) return 0;
  const months = monthsSince(ref, now);
  if (months <= 6) return 1;
  if (months >= 60) return 0;
  return 1 - (months - 6) / 54;
}
