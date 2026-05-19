import { useEffect } from "react";
import { useRuns } from "../hooks/useRuns";

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function RunHistory({
  onSelect,
  refreshSignal
}: {
  onSelect: (runId: string) => void;
  refreshSignal: number;
}): JSX.Element {
  const { runs, loading, error, refresh } = useRuns();

  useEffect(() => {
    if (refreshSignal > 0) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  return (
    <aside className="flex h-full flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Past runs</h2>
        <button
          type="button"
          onClick={refresh}
          className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Refresh
        </button>
      </div>

      {loading && <div className="text-xs text-slate-500 dark:text-slate-400">Loading…</div>}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</div>
      )}
      {!loading && !error && runs.length === 0 && (
        <div className="text-xs text-slate-500 dark:text-slate-400">No runs yet.</div>
      )}

      <ul className="space-y-2">
        {runs.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              onClick={() => onSelect(run.id)}
              className="block w-full rounded-md border border-slate-200 bg-white p-2 text-left text-xs transition hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-500 dark:hover:bg-slate-700"
            >
              <div className="font-medium text-slate-800 dark:text-slate-100">{run.label}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{formatDate(run.createdAt)}</div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
