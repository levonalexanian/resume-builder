import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { indexSources } from "../src/sources/indexSources.js";
import { runRetrieveQuery } from "../src/graph/queries.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("GraphQL retrieve", () => {
  test("returns experience sources when filtered by kind", async () => {
    const index = await indexSources({ root: repoRoot });
    const { result } = await runRetrieveQuery({ index, filter: { kinds: ["experience"] } });
    expect(result.errors).toBeUndefined();
    const sources = result.data?.sources ?? [];
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) expect(s.kind).toBe("experience");
  });

  test("matches by tag", async () => {
    const index = await indexSources({ root: repoRoot });
    const { result, matchedFiltersById } = await runRetrieveQuery({
      index,
      filter: { kinds: ["experience"], tags: ["firmware"] }
    });
    const sources = result.data?.sources ?? [];
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(matchedFiltersById.get(s.id)).toEqual(expect.arrayContaining([expect.stringMatching(/^tag:/)]));
    }
  });
});
