import { useEffect, useState } from "react";
import { getArtifacts, pdfUrl } from "../api";
import type { RunArtifacts as RunArtifactsType } from "../types";

type TabKey = "analysis" | "ranked" | "latex";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "analysis", label: "Job Analysis" },
  { key: "ranked", label: "Ranked Sources" },
  { key: "latex", label: "LaTeX" }
];

export function RunArtifacts({
  userId,
  runId,
  onClose
}: {
  userId: string;
  runId: string;
  onClose: () => void;
}): JSX.Element {
  const [data, setData] = useState<RunArtifactsType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("analysis");

  useEffect(() => {
    let mounted = true;
    setData(null);
    setError(null);
    getArtifacts(userId, runId)
      .then((d) => {
        if (mounted) setData(d);
      })
      .catch((err: unknown) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      mounted = false;
    };
  }, [userId, runId]);

  function body(): string {
    if (!data) return "";
    if (tab === "analysis") return JSON.stringify(data.jobAnalysis, null, 2);
    if (tab === "ranked") return JSON.stringify(data.rankedSources, null, 2);
    return data.latex;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
      <div className="flex max-h-[90vh] w-3/4 max-w-4xl flex-col overflow-hidden rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900 dark:shadow-black/40">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Run artifacts</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400">{runId}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <nav className="mt-4 flex gap-2 border-b border-slate-200 dark:border-slate-700">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                tab === t.key
                  ? "border-b-2 border-blue-600 px-3 py-2 text-sm font-medium text-blue-700 dark:border-blue-400 dark:text-blue-300"
                  : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-auto pt-3">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</div>
          )}
          {!error && !data && <div className="text-xs text-slate-500 dark:text-slate-400">Loading…</div>}
          {!error && data && (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-800 dark:text-slate-200">{body()}</pre>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <a
            href={pdfUrl(userId, runId)}
            download
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Download PDF
          </a>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
