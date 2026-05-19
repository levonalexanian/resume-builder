import { useState } from "react";
import { SourcesBrowser } from "./components/SourcesBrowser";
import { RunForm } from "./components/RunForm";
import { RunHistory } from "./components/RunHistory";
import { RunArtifacts } from "./components/RunArtifacts";
import { TopBar } from "./components/TopBar";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { usePipelineRun } from "./hooks/usePipelineRun";

export default function App(): JSX.Element {
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const { users, currentUserId, setCurrentUserId, loading, error } = useCurrentUser();
  const pipeline = usePipelineRun(currentUserId, () =>
    setRefreshSignal((n) => n + 1)
  );

  if (!loading && !error && users.length === 0) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <TopBar
          users={users}
          currentUserId={currentUserId}
          onChangeUser={setCurrentUserId}
        />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-xl rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <h2 className="text-base font-semibold">No users yet.</h2>
            <p className="mt-2">
              Seed a row in the <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-800">users</code>{" "}
              table to get started (e.g. via{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-800">
                make db-shell
              </code>
              ).
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar
        users={users}
        currentUserId={currentUserId}
        onChangeUser={setCurrentUserId}
      />
      <div className="grid flex-1 grid-cols-[280px_1fr_300px] overflow-hidden">
        <SourcesBrowser userId={currentUserId} />
        <RunForm
          userId={currentUserId}
          state={pipeline.state}
          submit={pipeline.submit}
          openArtifacts={setOpenRun}
        />
        <RunHistory
          userId={currentUserId}
          onSelect={setOpenRun}
          refreshSignal={refreshSignal}
        />
        {openRun && currentUserId && (
          <RunArtifacts
            userId={currentUserId}
            runId={openRun}
            onClose={() => setOpenRun(null)}
          />
        )}
      </div>
    </div>
  );
}
