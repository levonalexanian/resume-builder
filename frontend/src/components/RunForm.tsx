import { useState, type FormEvent } from "react";
import type { PipelineState } from "../hooks/usePipelineRun";
import type { RunRequest } from "../types";
import { PipelineProgress } from "./PipelineProgress";

export function RunForm({
  userId,
  state,
  submit,
  openArtifacts
}: {
  userId: string | null;
  state: PipelineState;
  submit: (req: RunRequest) => void;
  openArtifacts: (runId: string) => void;
}): JSX.Element {
  const [jobDescription, setJobDescription] = useState("");
  const [companyHint, setCompanyHint] = useState("");
  const [focusHint, setFocusHint] = useState("");

  const canSubmit = !state.running && jobDescription.trim().length > 0;

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!canSubmit) return;
    submit({
      jobDescription,
      companyHint: companyHint.trim() || undefined,
      focusHint: focusHint.trim() || undefined
    });
  }

  const showProgress = state.running || state.completedRunId !== null || state.error !== null;

  return (
    <main className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Generate a resume</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Paste a job description and the pipeline will analyze it, rank your sources, and produce a tailored PDF.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Job description</span>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            required
            className="mt-1 block h-64 w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
            placeholder="Paste the role description here…"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Company hint (optional)</span>
            <input
              type="text"
              value={companyHint}
              onChange={(e) => setCompanyHint(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
              placeholder="e.g. Acme Corp"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Focus hint (optional)</span>
            <input
              type="text"
              value={focusHint}
              onChange={(e) => setFocusHint(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
              placeholder="e.g. fullstack, embedded"
            />
          </label>
        </div>

        <div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
          >
            {state.running ? "Generating…" : "Generate resume"}
          </button>
        </div>
      </form>

      {showProgress && <PipelineProgress userId={userId} state={state} onView={openArtifacts} />}
    </main>
  );
}
