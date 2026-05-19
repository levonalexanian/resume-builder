import { describe, expect, test } from "vitest";
import { freshnessScore, parseDateRange, parseLooseDate } from "../src/util/dateUtil.js";

describe("parseLooseDate", () => {
  test("handles 'September 2025'", () => {
    expect(parseLooseDate("September 2025")).toEqual({ year: 2025, month: 9 });
  });
  test("handles abbreviated months with periods", () => {
    expect(parseLooseDate("Sept. 2025")).toEqual({ year: 2025, month: 9 });
    expect(parseLooseDate("Apr. 2030")).toEqual({ year: 2030, month: 4 });
  });
});

describe("parseDateRange", () => {
  test("end-dated range", () => {
    const r = parseDateRange("July 2025 – May 2026");
    expect(r.start).toEqual({ year: 2025, month: 7 });
    expect(r.end).toEqual({ year: 2026, month: 5 });
    expect(r.ongoing).toBe(false);
  });
  test("present range", () => {
    const r = parseDateRange("September 2025 – Present");
    expect(r.start).toEqual({ year: 2025, month: 9 });
    expect(r.ongoing).toBe(true);
    expect(r.end).toBeUndefined();
  });
  test("expected end date", () => {
    const r = parseDateRange("September 2025 – April 2030 (expected)");
    expect(r.start).toEqual({ year: 2025, month: 9 });
    expect(r.end).toEqual({ year: 2030, month: 4 });
  });
});

describe("freshnessScore", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  test("ongoing scores 1", () => {
    expect(freshnessScore("September 2025 – Present", now)).toBe(1);
  });
  test("ended last month scores 1", () => {
    expect(freshnessScore("Jan 2025 – May 2026", now)).toBe(1);
  });
  test("ended five years ago scores 0", () => {
    expect(freshnessScore("Jan 2018 – Jan 2021", now)).toBe(0);
  });
  test("unknown duration scores 0", () => {
    expect(freshnessScore(undefined, now)).toBe(0);
  });
  test("monotone decay between 6 and 60 months", () => {
    const earlier = freshnessScore("Jan 2024 – Jan 2025", now);
    const later = freshnessScore("Jan 2024 – Jan 2026", now);
    expect(later).toBeGreaterThan(earlier);
  });
});
