import { DarkModeToggle } from "./DarkModeToggle";

export function TopBar(): JSX.Element {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">
        Resume Builder
      </div>
      <DarkModeToggle />
    </header>
  );
}
