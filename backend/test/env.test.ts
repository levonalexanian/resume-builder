import { describe, expect, test } from "vitest";
import { parseBoolean } from "../src/util/env.js";

describe("parseBoolean", () => {
  test("treats true/1/yes/on as truthy", () => {
    expect(parseBoolean("true")).toBe(true);
    expect(parseBoolean("TRUE")).toBe(true);
    expect(parseBoolean("1")).toBe(true);
    expect(parseBoolean("yes")).toBe(true);
    expect(parseBoolean("YES")).toBe(true);
    expect(parseBoolean("on")).toBe(true);
  });

  test("treats anything else (including empty) as false", () => {
    expect(parseBoolean(undefined)).toBe(false);
    expect(parseBoolean("")).toBe(false);
    expect(parseBoolean("false")).toBe(false);
    expect(parseBoolean("0")).toBe(false);
    expect(parseBoolean("no")).toBe(false);
    expect(parseBoolean("off")).toBe(false);
    expect(parseBoolean("maybe")).toBe(false);
  });
});
