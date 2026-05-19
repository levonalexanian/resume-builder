import { describe, expect, test } from "vitest";
import { parseMarkdownBullets, parseMetadataLines, extractTagsFromText } from "../src/sources/mdParse.js";

describe("parseMarkdownBullets", () => {
  test("drops bullets that look like **Key:** value metadata", () => {
    const md = [
      "- **Diploma:** Bachelor",
      "- **Role:** Software Engineer",
      "- Built a thing"
    ].join("\n");
    const bullets = parseMarkdownBullets(md);
    expect(bullets).toEqual(["Built a thing"]);
  });
  test("drops bullets that are just markdown links", () => {
    const md = "- [Project](https://example.com)\n- Real bullet";
    expect(parseMarkdownBullets(md)).toEqual(["Real bullet"]);
  });
});

describe("parseMetadataLines", () => {
  test("normalizes common keys", () => {
    const meta = parseMetadataLines([
      "- **Position:** Software Engineer",
      "- **Location:** Toronto",
      "- **Duration:** Jan 2024 – Present",
      "- **GPA:** 4.0"
    ].join("\n"));
    expect(meta.role).toBe("Software Engineer");
    expect(meta.location).toBe("Toronto");
    expect(meta.duration).toBe("Jan 2024 – Present");
    expect(meta.gpa).toBe("4.0");
  });
});

describe("extractTagsFromText", () => {
  test("detects core stack tags", () => {
    const tags = extractTagsFromText("Built a TypeScript service with React and GraphQL on AWS.");
    expect(tags).toEqual(expect.arrayContaining(["typescript", "react", "graphql", "aws"]));
  });
  test("detects embedded/firmware tags", () => {
    const tags = extractTagsFromText("STM32 firmware over CAN bus with FreeRTOS.");
    expect(tags).toEqual(expect.arrayContaining(["stm32", "firmware", "can", "freertos"]));
  });
});
