import { useCallback, useRef, useState } from "react";
import { streamRun } from "../api";
import type { PipelineEvent, RunRequest, StepName, StepStatus } from "../types";

const STEP_ORDER: StepName[] = ["analyze", "retrieve", "rank", "draft", "pdf"];

type Steps = Record<StepName, StepStatus>;

export interface PipelineState {
  running: boolean;
  steps: Steps;
  completedRunId: string | null;
  error: string | null;
}

function freshSteps(): Steps {
  return STEP_ORDER.reduce<Steps>((acc, step) => {
    acc[step] = "pending";
    return acc;
  }, {} as Steps);
}

const INITIAL_STATE: PipelineState = {
  running: false,
  steps: freshSteps(),
  completedRunId: null,
  error: null
};

export function usePipelineRun(onComplete?: (runId: string) => void): {
  state: PipelineState;
  submit: (req: RunRequest) => void;
  reset: () => void;
} {
  const [state, setState] = useState<PipelineState>(INITIAL_STATE);
  const abortRef = useRef<(() => void) | null>(null);

  const submit = useCallback(
    (req: RunRequest) => {
      abortRef.current?.();
      setState({
        running: true,
        steps: freshSteps(),
        completedRunId: null,
        error: null
      });

      const abort = streamRun(req, (event: PipelineEvent) => {
        if (event.type === "step") {
          setState((s) => ({
            ...s,
            steps: { ...s.steps, [event.step]: event.status }
          }));
        } else if (event.type === "done") {
          setState((s) => ({ ...s, running: false, completedRunId: event.runId }));
          onComplete?.(event.runId);
        } else if (event.type === "error") {
          setState((s) => ({ ...s, running: false, error: event.message }));
        }
      });
      abortRef.current = abort;
    },
    [onComplete]
  );

  const reset = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  return { state, submit, reset };
}
