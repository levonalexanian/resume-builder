import { useCallback, useEffect, useState } from "react";
import { listUsers } from "../api";
import type { User } from "../types";

const STORAGE_KEY = "resume.currentUserId";

export function useCurrentUser(): {
  users: User[];
  currentUserId: string | null;
  setCurrentUserId: (id: string) => void;
  loading: boolean;
  error: string | null;
} {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    listUsers()
      .then((list) => {
        if (!mounted) return;
        setUsers(list);
        const stored = localStorage.getItem(STORAGE_KEY);
        const valid = stored && list.some((u) => u.user_id === stored) ? stored : null;
        const fallback = list[0]?.user_id ?? null;
        const next = valid ?? fallback;
        setCurrentUserIdState(next);
        if (next) localStorage.setItem(STORAGE_KEY, next);
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

  const setCurrentUserId = useCallback((id: string) => {
    setCurrentUserIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  return { users, currentUserId, setCurrentUserId, loading, error };
}
