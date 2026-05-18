#!/usr/bin/env node
import http from "node:http";
import path from "node:path";
import { createYoga } from "graphql-yoga";
import { indexSources } from "../sources/indexSources.js";
import { schema } from "./schema.js";

async function main(): Promise<void> {
  const repoRoot = process.env.RESUME_REPO_ROOT
    ? path.resolve(process.env.RESUME_REPO_ROOT)
    : path.resolve(process.cwd());

  const port = Number(process.env.PORT ?? "4000");

  const yoga = createYoga({
    schema,
    context: async () => ({ index: await indexSources({ root: repoRoot }) })
  });

  const server = http.createServer(yoga);
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`GraphQL Yoga listening on http://localhost:${port}/graphql`);
  });
}

await main();
