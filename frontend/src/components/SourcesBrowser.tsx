import { useSources } from "../hooks/useSources";
import type { Kind, SourceDoc } from "../types";
import { SourceCard } from "./SourceCard";

const GROUP_ORDER: Array<{ kind: Kind; title: string }> = [
  { kind: "experience", title: "Experience" },
  { kind: "education", title: "Education" },
  { kind: "project", title: "Projects" }
];

function groupBy(docs: SourceDoc[]): Map<Kind, SourceDoc[]> {
  const map = new Map<Kind, SourceDoc[]>();
  for (const d of docs) {
    const list = map.get(d.kind) ?? [];
    list.push(d);
    map.set(d.kind, list);
  }
  return map;
}

export function SourcesBrowser(): JSX.Element {
  const { sources, loading, error } = useSources();

  if (loading) {
    return (
      <aside className="h-full overflow-y-auto border-r border-slate-200 bg-white p-4 text-sm text-slate-500">
        Loading sources…
      </aside>
    );
  }
  if (error) {
    return (
      <aside className="h-full overflow-y-auto border-r border-slate-200 bg-white p-4">
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
      </aside>
    );
  }

  const grouped = groupBy(sources);

  return (
    <aside className="h-full space-y-6 overflow-y-auto border-r border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sources</h2>
      {GROUP_ORDER.map(({ kind, title }) => {
        const docs = grouped.get(kind) ?? [];
        if (docs.length === 0) return null;
        return (
          <section key={kind} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h3>
            <div className="space-y-2">
              {docs.map((d) => (
                <SourceCard key={d.id} doc={d} />
              ))}
            </div>
          </section>
        );
      })}
    </aside>
  );
}
