import { pdfUrl } from "../api";
import type { PipelineState } from "../hooks/usePipelineRun";
import type { StepName, StepStatus } from "../types";

const STEP_LABELS: Array<{ name: StepName; label: string }> = [
  { name: "analyze", label: "Analyze job" },
  { name: "retrieve", label: "Retrieve candidates" },
  { name: "rank", label: "Rank sources" },
  { name: "draft", label: "Draft LaTeX" },
  { name: "pdf", label: "Build PDF" }
];

function StepIndicator({ status }: { status: StepStatus }): JSX.Element {
  if (status === "completed") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">
        ✓
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
        ✕
      </span>
    );
  }
  if (status === "running") {
    return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />;
  }
  return <span className="inline-block h-3 w-3 rounded-full bg-slate-300 dark:bg-slate-600" />;
}

export function PipelineProgress({
  userId,
  state,
  onView
}: {
  userId: string | null;
  state: PipelineState;
  onView: (runId: string) => void;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      {state.error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </div>
      )}
      <ol className="space-y-2">
        {STEP_LABELS.map(({ name, label }) => {
          const status = state.steps[name];
          return (
            <li key={name} className="flex items-center gap-3 text-sm">
              <StepIndicator status={status} />
              <span
                className={
                  status === "completed"
                    ? "text-slate-700 dark:text-slate-300"
                    : status === "running"
                      ? "font-medium text-slate-900 dark:text-slate-100"
                      : status === "error"
                        ? "text-red-700 dark:text-red-400"
                        : "text-slate-400 dark:text-slate-500"
                }
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      {state.completedRunId && userId && (
        <div className="mt-4 flex gap-2">
          <a
            href={pdfUrl(userId, state.completedRunId)}
            download
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Download PDF
          </a>
          <button
            type="button"
            onClick={() => onView(state.completedRunId!)}
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            View Artifacts
          </button>
        </div>
      )}
    </div>
  );
}
