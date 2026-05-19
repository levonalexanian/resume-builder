import type { User } from "../types";
import { DarkModeToggle } from "./DarkModeToggle";

export function TopBar({
  users,
  currentUserId,
  onChangeUser
}: {
  users: User[];
  currentUserId: string | null;
  onChangeUser: (id: string) => void;
}): JSX.Element {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <div className="text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">
          Resume Builder
        </div>
        {users.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            User:
            <select
              value={currentUserId ?? ""}
              onChange={(e) => onChangeUser(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {users.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.name} ({u.user_id})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <DarkModeToggle />
    </header>
  );
}
