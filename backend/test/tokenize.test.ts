import { describe, expect, test } from "vitest";
import { tokenize } from "../src/util/textUtil.js";

describe("tokenize", () => {
  test("drops stop words and short tokens", () => {
    const t = tokenize("The quick brown fox and a cat");
    expect(t).toContain("quick");
    expect(t).toContain("brown");
    expect(t).toContain("fox");
    expect(t).not.toContain("the");
    expect(t).not.toContain("and");
  });
});
