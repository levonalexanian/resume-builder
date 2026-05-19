import type {
  PipelineEvent,
  RunArtifacts,
  RunRequest,
  RunSummary,
  SourceDoc,
  User
} from "./types";

async function getJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`GET ${url} → HTTP ${resp.status}`);
  return (await resp.json()) as T;
}

function userBase(userId: string): string {
  return `/api/users/${encodeURIComponent(userId)}`;
}

export function listUsers(): Promise<User[]> {
  return getJson<User[]>("/api/users");
}

export function getSources(userId: string): Promise<SourceDoc[]> {
  return getJson<SourceDoc[]>(`${userBase(userId)}/sources`);
}

export function getRuns(userId: string): Promise<RunSummary[]> {
  return getJson<RunSummary[]>(`${userBase(userId)}/runs`);
}

export function getArtifacts(userId: string, runId: string): Promise<RunArtifacts> {
  return getJson<RunArtifacts>(
    `${userBase(userId)}/runs/${encodeURIComponent(runId)}/artifacts`
  );
}

export function pdfUrl(userId: string, runId: string): string {
  return `${userBase(userId)}/runs/${encodeURIComponent(runId)}/pdf`;
}

export function streamRun(
  userId: string,
  body: RunRequest,
  onEvent: (e: PipelineEvent) => void,
  onClose?: () => void
): () => void {
  const controller = new AbortController();

  void (async () => {
    try {
      const resp = await fetch(`${userBase(userId)}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!resp.ok || !resp.body) {
        onEvent({ type: "error", message: `HTTP ${resp.status} ${resp.statusText}` });
        onClose?.();
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let separatorIndex = buffer.indexOf("\n\n");
        while (separatorIndex !== -1) {
          const chunk = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                onEvent(JSON.parse(line.slice(6)) as PipelineEvent);
              } catch {
                // ignore malformed event
              }
            }
          }
          separatorIndex = buffer.indexOf("\n\n");
        }
      }
      onClose?.();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        onClose?.();
        return;
      }
      onEvent({
        type: "error",
        message: err instanceof Error ? err.message : String(err)
      });
      onClose?.();
    }
  })();

  return () => controller.abort();
}
