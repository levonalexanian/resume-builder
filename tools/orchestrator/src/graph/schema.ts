import { GraphQLSchema, GraphQLObjectType, GraphQLString, GraphQLList, GraphQLNonNull, GraphQLEnumType, GraphQLInputObjectType } from "graphql";
import type { SourceDoc, SourcesIndex } from "../sources/types.js";

export type GraphContext = {
  index: SourcesIndex;
};

const KindEnum = new GraphQLEnumType({
  name: "Kind",
  values: {
    experience: { value: "experience" },
    education: { value: "education" },
    project: { value: "project" }
  }
});

const SourceDocType: GraphQLObjectType<SourceDoc, GraphContext> = new GraphQLObjectType({
  name: "SourceDoc",
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLString) },
    path: { type: new GraphQLNonNull(GraphQLString) },
    kind: { type: new GraphQLNonNull(KindEnum) },
    group: { type: new GraphQLNonNull(GraphQLString) },
    groupKey: { type: new GraphQLNonNull(GraphQLString) },
    title: { type: new GraphQLNonNull(GraphQLString) },
    tags: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))) },
    role: { type: GraphQLString, resolve: (d) => d.meta.role },
    location: { type: GraphQLString, resolve: (d) => d.meta.location },
    duration: { type: GraphQLString, resolve: (d) => d.meta.duration },
    diploma: { type: GraphQLString, resolve: (d) => d.meta.diploma },
    gpa: { type: GraphQLString, resolve: (d) => d.meta.gpa },
    bullets: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))) }
  })
});

const ExperienceGroupType = new GraphQLObjectType<{
  groupKey: string;
  group: string;
  docs: SourceDoc[];
}, GraphContext>({
  name: "ExperienceGroup",
  fields: () => ({
    groupKey: { type: new GraphQLNonNull(GraphQLString) },
    group: { type: new GraphQLNonNull(GraphQLString) },
    docs: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(SourceDocType))) }
  })
});

const FilterInput = new GraphQLInputObjectType({
  name: "SourceFilter",
  fields: {
    kinds: { type: new GraphQLList(new GraphQLNonNull(KindEnum)) },
    groups: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) },
    tags: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) }
  }
});

type SourceFilter = {
  kinds?: Array<SourceDoc["kind"]>;
  groups?: string[];
  tags?: string[];
};

function matchesFilter(doc: SourceDoc, filter: SourceFilter | undefined): { match: boolean; matched: string[] } {
  if (!filter) return { match: doc.kind !== "other", matched: [] };
  const matched: string[] = [];
  if (filter.kinds && filter.kinds.length > 0) {
    if (doc.kind === "other") return { match: false, matched };
    if (!filter.kinds.includes(doc.kind)) return { match: false, matched };
    matched.push(`kind:${doc.kind}`);
  } else if (doc.kind === "other") {
    return { match: false, matched };
  }
  if (filter.groups && filter.groups.length > 0) {
    const norm = (s: string): string => s.toLowerCase();
    const groupKeys = filter.groups.map(norm);
    if (!groupKeys.includes(norm(doc.group)) && !groupKeys.includes(norm(doc.groupKey))) {
      return { match: false, matched };
    }
    matched.push(`group:${doc.groupKey}`);
  }
  if (filter.tags && filter.tags.length > 0) {
    const wanted = new Set(filter.tags.map((t) => t.toLowerCase()));
    const have = new Set(doc.tags.map((t) => t.toLowerCase()));
    const hits = [...wanted].filter((t) => have.has(t));
    if (hits.length === 0) return { match: false, matched };
    for (const h of hits) matched.push(`tag:${h}`);
  }
  return { match: true, matched };
}

const QueryType = new GraphQLObjectType<unknown, GraphContext>({
  name: "Query",
  fields: () => ({
    sources: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(SourceDocType))),
      args: { filter: { type: FilterInput } },
      resolve: (_root, args: { filter?: SourceFilter }, ctx) =>
        ctx.index.docs.filter((d) => matchesFilter(d, args.filter).match)
    },
    experienceGroups: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ExperienceGroupType))),
      args: { filter: { type: FilterInput } },
      resolve: (_root, args: { filter?: SourceFilter }, ctx) => {
        const filter = { ...args.filter, kinds: ["experience" as const] };
        const docs = ctx.index.docs.filter((d) => matchesFilter(d, filter).match);
        const byKey = new Map<string, { groupKey: string; group: string; docs: SourceDoc[] }>();
        for (const d of docs) {
          const entry = byKey.get(d.groupKey) ?? { groupKey: d.groupKey, group: d.group, docs: [] };
          entry.docs.push(d);
          byKey.set(d.groupKey, entry);
        }
        return [...byKey.values()];
      }
    },
    education: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(SourceDocType))),
      args: { filter: { type: FilterInput } },
      resolve: (_root, args: { filter?: SourceFilter }, ctx) => {
        const filter: SourceFilter = { ...args.filter, kinds: ["education"] };
        return ctx.index.docs.filter((d) => matchesFilter(d, filter).match && /\/overview\.md$/i.test(d.path));
      }
    },
    projects: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(SourceDocType))),
      args: { filter: { type: FilterInput } },
      resolve: (_root, args: { filter?: SourceFilter }, ctx) => {
        const filter: SourceFilter = { ...args.filter, kinds: ["project"] };
        return ctx.index.docs.filter((d) => matchesFilter(d, filter).match);
      }
    }
  })
});

export const schema = new GraphQLSchema({ query: QueryType });

export function explainMatch(doc: SourceDoc, filter: SourceFilter | undefined): string[] {
  return matchesFilter(doc, filter).matched;
}

export type { SourceFilter };
