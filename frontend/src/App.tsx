import { useState } from "react";
import { SourcesBrowser } from "./components/SourcesBrowser";
import { RunForm } from "./components/RunForm";
import { RunHistory } from "./components/RunHistory";
import { RunArtifacts } from "./components/RunArtifacts";
import { TopBar } from "./components/TopBar";
import { usePipelineRun } from "./hooks/usePipelineRun";

export default function App(): JSX.Element {
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const pipeline = usePipelineRun(() => setRefreshSignal((n) => n + 1));

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="grid flex-1 grid-cols-[280px_1fr_300px] overflow-hidden">
        <SourcesBrowser />
        <RunForm state={pipeline.state} submit={pipeline.submit} openArtifacts={setOpenRun} />
        <RunHistory onSelect={setOpenRun} refreshSignal={refreshSignal} />
        {openRun && <RunArtifacts runId={openRun} onClose={() => setOpenRun(null)} />}
      </div>
    </div>
  );
}
