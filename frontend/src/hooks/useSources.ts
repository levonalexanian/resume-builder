import { useEffect, useState } from "react";
import { getSources } from "../api";
import type { SourceDoc } from "../types";

export function useSources(userId: string | null): {
  sources: SourceDoc[];
  loading: boolean;
  error: string | null;
} {
  const [sources, setSources] = useState<SourceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setSources([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);
    getSources(userId)
      .then((docs) => {
        if (mounted) setSources(docs);
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
  }, [userId]);

  return { sources, loading, error };
}
