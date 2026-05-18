import { graphql, ExecutionResult } from "graphql";
import type { SourceDoc, SourcesIndex } from "../sources/types.js";
import { explainMatch, schema, SourceFilter } from "./schema.js";

const RETRIEVE_QUERY = /* GraphQL */ `
  query Retrieve($filter: SourceFilter) {
    sources(filter: $filter) {
      id
      path
      kind
      group
      groupKey
      title
      tags
    }
  }
`;

export type RetrieveQueryResult = {
  data?: {
    sources?: Array<Pick<SourceDoc, "id" | "path" | "kind" | "group" | "groupKey" | "title" | "tags">>;
  };
  errors?: ExecutionResult["errors"];
};

export type RetrieveOpts = {
  index: SourcesIndex;
  filter?: SourceFilter;
};

export async function runRetrieveQuery(opts: RetrieveOpts): Promise<{
  operation: string;
  variables: { filter?: SourceFilter };
  result: RetrieveQueryResult;
  matchedFiltersById: Map<string, string[]>;
}> {
  const variables = { filter: opts.filter };
  const result = (await graphql({
    schema,
    source: RETRIEVE_QUERY,
    variableValues: variables,
    contextValue: { index: opts.index }
  })) as RetrieveQueryResult;

  const matchedFiltersById = new Map<string, string[]>();
  for (const d of opts.index.docs) {
    if (d.kind === "other") continue;
    const matched = explainMatch(d, opts.filter);
    if (matched.length > 0) matchedFiltersById.set(d.id, matched);
  }
  return { operation: "Retrieve", variables, result, matchedFiltersById };
}

export { RETRIEVE_QUERY };
