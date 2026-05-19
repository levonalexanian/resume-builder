import { useEffect, useState } from "react";
import { getSources } from "../api";
import type { SourceDoc } from "../types";

export function useSources(): { sources: SourceDoc[]; loading: boolean; error: string | null } {
  const [sources, setSources] = useState<SourceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getSources()
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
  }, []);

  return { sources, loading, error };
}
