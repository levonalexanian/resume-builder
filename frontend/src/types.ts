export type Kind = "experience" | "education" | "project" | "other";

export interface SourceDoc {
  id: string;
  path: string;
  kind: Kind;
  group: string;
  groupKey: string;
  title: string;
  meta: Record<string, string>;
  tags: string[];
  bullets: string[];
  text: string;
}

export interface RunSummary {
  id: string;
  createdAt: string;
  label: string;
}

export interface RunArtifacts {
  id: string;
  jobAnalysis: unknown | null;
  retrievalCandidates: unknown | null;
  rankedSources: unknown | null;
  latex: string;
}

export interface RunRequest {
  jobDescription: string;
  companyHint?: string;
  focusHint?: string;
}

export type StepName = "analyze" | "retrieve" | "rank" | "draft" | "pdf";
export type StepStatus = "pending" | "running" | "completed" | "error";

export type PipelineEvent =
  | { type: "step"; step: StepName; status: StepStatus; message?: string }
  | { type: "done"; runId: string }
  | { type: "error"; message: string };
