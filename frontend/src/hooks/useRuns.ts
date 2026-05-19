import { useCallback, useEffect, useState } from "react";
import { getRuns } from "../api";
import type { RunSummary } from "../types";

export function useRuns(userId: string | null): {
  runs: RunSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counter, setCounter] = useState(0);

  const refresh = useCallback(() => setCounter((n) => n + 1), []);

  useEffect(() => {
    if (!userId) {
      setRuns([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);
    getRuns(userId)
      .then((list) => {
        if (mounted) setRuns(list);
      })
      .catch((err: unknown) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [userId, counter]);

  return { runs, loading, error, refresh };
}
