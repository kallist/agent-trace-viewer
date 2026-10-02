import { useMemo, useRef, useState } from "react";
import failedFixture from "../fixtures/failed-run.json";
import successfulFixture from "../fixtures/successful-run.json";
import ErrorBanner from "../components/ErrorBanner";
import EventInspector from "../components/EventInspector";
import FailureSummary from "../components/FailureSummary";
import LiveTraceControls from "../components/LiveTraceControls";
import StreamWarning from "../components/StreamWarning";
import TraceImporter from "../components/TraceImporter";
import TraceMetrics from "../components/TraceMetrics";
import TraceSummary from "../components/TraceSummary";
import TraceTimeline from "../components/TraceTimeline";
import useLiveTrace from "../hooks/useLiveTrace";
import { calculateTraceMetrics } from "../trace/metrics";
import { parseTraceValue, parseTraceText } from "../trace/parser";
import type { LiveTraceTransport } from "../trace/live/transport";
import type { NormalizedTrace, ParseResult, TraceEvent, TraceValidationError, TraceWarning } from "../trace/types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function initialTrace(): { trace: NormalizedTrace; warnings: TraceWarning[] } {
  const result = parseTraceValue(successfulFixture);
  if (!result.ok) throw new Error("Built-in successful fixture is invalid.");
  return { trace: result.trace, warnings: result.warnings };
}

interface AppProps {
  liveTransport?: LiveTraceTransport;
}

export default function App({ liveTransport }: AppProps) {
  const initial = useMemo(initialTrace, []);
  const [offlineTrace, setOfflineTrace] = useState<NormalizedTrace | null>(initial.trace);
  const [offlineWarnings, setOfflineWarnings] = useState<TraceWarning[]>(initial.warnings);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [offlineErrors, setOfflineErrors] = useState<TraceValidationError[] | null>(null);
  const [mode, setMode] = useState<"offline" | "live">("offline");
  const importSequence = useRef(0);
  const live = useLiveTrace(liveTransport);
  const trace = mode === "live" ? live.session.trace ?? null : offlineTrace;
  const warnings = mode === "live" ? [] : offlineWarnings;
  const metrics = useMemo(() => trace ? calculateTraceMetrics(trace) : null, [trace]);
  const selectedEvent = trace?.events.find((event) => event.id === selectedEventId) ?? null;
  const failures = trace?.events.filter((event) => event.status === "failed") ?? [];

  function applyResult(result: ParseResult, sequence: number) {
    if (sequence !== importSequence.current) return;
    if (!result.ok) {
      setOfflineErrors(result.errors);
      return;
    }
    setOfflineTrace(result.trace);
    setOfflineWarnings(result.warnings);
    setOfflineErrors(null);
    setSelectedEventId(null);
  }

  function prepareOfflineImport(): void {
    live.clear();
    setMode("offline");
  }

  function loadSample(sample: "successful" | "failed") {
    prepareOfflineImport();
    const sequence = importSequence.current + 1;
    importSequence.current = sequence;
    applyResult(parseTraceValue(sample === "successful" ? successfulFixture : failedFixture), sequence);
  }

  function importPastedText(text: string) {
    prepareOfflineImport();
    const sequence = importSequence.current + 1;
    importSequence.current = sequence;
    if (text.length > MAX_FILE_BYTES) {
      setOfflineErrors([{ path: "paste", message: "Trace text is too large. Use a JSON trace smaller than 5 MB." }]);
      return;
    }
    applyResult(parseTraceText(text), sequence);
  }

  async function importFile(file: File) {
    prepareOfflineImport();
    const sequence = importSequence.current + 1;
    importSequence.current = sequence;
    if (file.size > MAX_FILE_BYTES) {
      setOfflineErrors([{ path: "file", message: "File too large. Choose a JSON file smaller than 5 MB." }]);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".json") && !["application/json", "text/json", "text/plain"].includes(file.type)) {
      setOfflineErrors([{ path: "file", message: "Please choose a .json file." }]);
      return;
    }
    try {
      const text = await file.text();
      if (sequence !== importSequence.current) return;
      applyResult(parseTraceText(text), sequence);
    } catch {
      if (sequence === importSequence.current) setOfflineErrors([{ path: "file", message: "File read failed. Try selecting the file again." }]);
    }
  }

  function clearTrace() {
    if (mode === "live") {
      live.clear();
      setSelectedEventId(null);
      return;
    }
    importSequence.current += 1;
    setOfflineTrace(null);
    setOfflineWarnings([]);
    setOfflineErrors(null);
    setSelectedEventId(null);
  }

  function selectEvent(event: TraceEvent) {
    setSelectedEventId(event.id);
  }

  function switchMode(nextMode: "offline" | "live"): void {
    if (nextMode === "offline") {
      live.clear();
      setSelectedEventId(null);
    }
    setMode(nextMode);
  }

  function connectLive(endpoint: string): void {
    setMode("live");
    setSelectedEventId(null);
    live.connect(endpoint);
  }

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span>⌁</span></div><div><p className="eyebrow">Developer tool · v0.2</p><h1>Agent Trace Viewer</h1></div></div>
      <p className="header-tagline">Inspect offline and live AI agent execution</p>
    </header>
    <main>
      <LiveTraceControls mode={mode} phase={live.session.phase} endpointError={live.endpointError} hasTrace={live.session.trace !== undefined} onModeChange={switchMode} onConnect={connectLive} onDisconnect={live.disconnect} onClear={() => { live.clear(); setSelectedEventId(null); }} />
      <TraceImporter onPasteImport={importPastedText} onFileImport={importFile} onLoadSample={loadSample} onClear={clearTrace} hasTrace={trace !== null} />
      {mode === "offline" && <ErrorBanner errors={offlineErrors} />}
      {mode === "live" && <StreamWarning warnings={live.session.warnings} />}
      {warnings.length > 0 && <div className="warning-banner" role="status"><strong>Imported with {warnings.length} warning{warnings.length === 1 ? "" : "s"}</strong><span>{warnings[0].message}{warnings.length > 1 ? ` + ${warnings.length - 1} more` : ""}</span></div>}
      {trace && metrics ? <>
        <TraceSummary trace={trace} />
        <TraceMetrics metrics={metrics} />
        <div className="workspace-grid"><TraceTimeline trace={trace} selectedEventId={selectedEventId} onSelect={selectEvent} /><EventInspector event={selectedEvent} /></div>
        <FailureSummary failures={failures} runStatus={trace.status} onSelect={selectEvent} />
        <details className="raw-trace panel"><summary>View complete trace JSON</summary><pre className="json-block">{JSON.stringify(trace.raw, null, 2)}</pre></details>
      </> : <section className="empty-state panel"><div className="empty-state-icon" aria-hidden="true">⌁</div><h2>Trace cleared</h2><p>Load a sample or import a local JSON trace to start inspecting.</p></section>}
    </main>
    <footer><span>Agent Trace Viewer</span><span>Offline traces stay in your browser · Live connects only when requested</span></footer>
  </div>;
}
