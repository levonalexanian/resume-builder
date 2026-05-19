import { useState } from "react";
import type { SourceDoc } from "../types";

export function SourceCard({ doc }: { doc: SourceDoc }): JSX.Element {
  const [open, setOpen] = useState(false);

  const subtitle = [doc.meta.role, doc.meta.duration, doc.meta.diploma, doc.meta.location]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 transition hover:ring-1 hover:ring-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:ring-slate-600">
      <div className="font-semibold text-slate-900 dark:text-slate-100">{doc.title}</div>
      {subtitle && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>}
      {doc.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {doc.tags.slice(0, 8).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {doc.bullets.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {open ? "Hide bullets" : `Show bullets (${doc.bullets.length})`}
          </button>
          {open && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-700 dark:text-slate-300">
              {doc.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
