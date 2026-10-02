import { useMemo, useRef, useState } from "react";
import failedFixture from "../fixtures/failed-run.json";
import successfulFixture from "../fixtures/successful-run.json";
import ragFixture from "../fixtures/rag-demo.json";
import recoveryFixture from "../fixtures/tool-recovery.json";
import beforeFixture from "../fixtures/latency-before.json";
import afterFixture from "../fixtures/latency-after.json";
import ErrorBanner from "../components/ErrorBanner";
import EventInspector from "../components/EventInspector";
import FailureSummary from "../components/FailureSummary";
import LiveTraceControls from "../components/LiveTraceControls";
import StreamWarning from "../components/StreamWarning";
import TraceImporter from "../components/TraceImporter";
import TraceMetrics from "../components/TraceMetrics";
import TraceSummary from "../components/TraceSummary";
import TraceTimeline from "../components/TraceTimeline";
import ReplayTheater from "../components/ReplayTheater";
import RunCompare from "../components/RunCompare";
import BottleneckLens from "../components/BottleneckLens";
import ScenarioGallery from "../components/ScenarioGallery";
import useLiveTrace from "../hooks/useLiveTrace";
import { calculateTraceMetrics } from "../trace/metrics";
import { adaptTrace, adaptTraceText } from "../trace/adapters/registry";
import type { CompareOption } from "../components/RunCompare";
import type { LiveTraceTransport } from "../trace/live/transport";
import type { NormalizedTrace, TraceEvent, TraceValidationError, TraceWarning } from "../trace/types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
type WorkspaceView = "observe" | "replay" | "compare";
type ScenarioId = "rag" | "recovery" | "latency";

function normalizedFixture(value: unknown): NormalizedTrace {
  const result = adaptTrace(value);
  if (!result.ok) throw new Error("Built-in demo fixture is invalid: " + result.errors[0]?.message);
  return result.trace;
}

const comparisonDemos: CompareOption[] = [
  { id: "latency-before", label: "Before Optimization", trace: normalizedFixture(beforeFixture) },
  { id: "latency-after", label: "After Optimization", trace: normalizedFixture(afterFixture) },
];

function initialTrace(): { trace: NormalizedTrace; warnings: TraceWarning[] } {
  const result = adaptTrace(successfulFixture);
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
  const [adapterNotice, setAdapterNotice] = useState("Native Trace adapter");
  const [mode, setMode] = useState<"offline" | "live">("offline");
  const [view, setView] = useState<WorkspaceView>("observe");
  const [compareAId, setCompareAId] = useState("latency-before");
  const [compareBId, setCompareBId] = useState("latency-after");
  const importSequence = useRef(0);
  const live = useLiveTrace(liveTransport);
  const trace = mode === "live" ? live.session.trace ?? null : offlineTrace;
  const warnings = mode === "live" ? [] : offlineWarnings;
  const metrics = useMemo(() => trace ? calculateTraceMetrics(trace) : null, [trace]);
  const selectedEvent = trace?.events.find((event) => event.id === selectedEventId) ?? null;
  const failures = trace?.events.filter((event) => event.status === "failed") ?? [];
  const replayTrace = mode === "live"
    ? (live.session.phase === "ended" && (trace?.status === "completed" || trace?.status === "failed") ? trace : null)
    : (trace && (trace.status === "completed" || trace.status === "failed") ? trace : null);
  const compareOptions = useMemo(() => {
    const options = [...comparisonDemos];
    if (trace && (trace.status === "completed" || trace.status === "failed")) {
      options.push({ id: "current:" + trace.runId, label: (trace.name ?? trace.runId) + " (current trace)", trace });
    }
    return options;
  }, [trace]);

  function prepareOfflineImport(): void {
    live.clear();
    setMode("offline");
    setView("observe");
  }

  function applyAdapted(result: ReturnType<typeof adaptTrace>, sequence: number) {
    if (sequence !== importSequence.current) return;
    if (!result.ok) {
      setOfflineErrors(result.errors);
      return;
    }
    setOfflineTrace(result.trace);
    setOfflineWarnings(result.warnings);
    setOfflineErrors(null);
    setAdapterNotice(result.adapterName + " detected");
    setSelectedEventId(null);
  }

  function loadSample(sample: "successful" | "failed") {
    prepareOfflineImport();
    const sequence = ++importSequence.current;
    applyAdapted(adaptTrace(sample === "successful" ? successfulFixture : failedFixture), sequence);
  }

  function loadScenario(scenario: ScenarioId) {
    const fixtures: Record<ScenarioId, unknown> = { rag: ragFixture, recovery: recoveryFixture, latency: beforeFixture };
    prepareOfflineImport();
    const sequence = ++importSequence.current;
    applyAdapted(adaptTrace(fixtures[scenario]), sequence);
  }

  function importPastedText(text: string) {
    prepareOfflineImport();
    const sequence = ++importSequence.current;
    if (text.length > MAX_FILE_BYTES) {
      setOfflineErrors([{ path: "paste", message: "Trace text is too large. Use a JSON trace smaller than 5 MB." }]);
      return;
    }
    applyAdapted(adaptTraceText(text), sequence);
  }

  async function importFile(file: File) {
    prepareOfflineImport();
    const sequence = ++importSequence.current;
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
      applyAdapted(adaptTraceText(text), sequence);
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
    importSequence.current += 1;
    setSelectedEventId(null);
    if (nextMode === "offline") live.clear();
    setMode(nextMode);
  }

  function connectLive(endpoint: string): void {
    importSequence.current += 1;
    setView("observe");
    setMode("live");
    setSelectedEventId(null);
    live.connect(endpoint);
  }

  function changeView(nextView: WorkspaceView): void {
    importSequence.current += 1;
    setSelectedEventId(null);
    setView(nextView);
  }

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span>⌁</span></div><div><p className="eyebrow">Local-first · v1.0</p><h1>Agent Trace Viewer</h1></div></div>
      <p className="header-tagline">Replay, compare, and inspect AI agent runs</p>
    </header>
    <nav className="workspace-nav" aria-label="Workspace views">
      <button type="button" className={view === "observe" ? "is-active" : ""} aria-current={view === "observe" ? "page" : undefined} onClick={() => changeView("observe")}>Observe</button>
      <button type="button" className={view === "replay" ? "is-active" : ""} aria-current={view === "replay" ? "page" : undefined} disabled={!replayTrace} onClick={() => changeView("replay")}>Replay</button>
      <button type="button" className={view === "compare" ? "is-active" : ""} aria-current={view === "compare" ? "page" : undefined} onClick={() => changeView("compare")}>Compare</button>
    </nav>
    <main>
      {view === "observe" && <>
        <LiveTraceControls mode={mode} phase={live.session.phase} endpointError={live.endpointError} hasTrace={live.session.trace !== undefined} onModeChange={switchMode} onConnect={connectLive} onDisconnect={live.disconnect} onClear={() => { live.clear(); setSelectedEventId(null); }} />
        <TraceImporter onPasteImport={importPastedText} onFileImport={importFile} onLoadSample={loadSample} onClear={clearTrace} hasTrace={trace !== null} />
        {mode === "offline" && <>
          <p className="adapter-notice" role="status">Input format: {adapterNotice}</p>
          <ScenarioGallery onLoad={loadScenario} />
          <ErrorBanner errors={offlineErrors} />
        </>}
        {mode === "live" && <StreamWarning warnings={live.session.warnings} />}
        {warnings.length > 0 && <div className="warning-banner" role="status"><strong>Imported with {warnings.length} warning{warnings.length === 1 ? "" : "s"}</strong><span>{warnings[0].message}{warnings.length > 1 ? ` + ${warnings.length - 1} more` : ""}</span></div>}
        {trace && metrics ? <>
          <TraceSummary trace={trace} />
          <TraceMetrics metrics={metrics} />
          <div className="workspace-grid"><TraceTimeline trace={trace} selectedEventId={selectedEventId} onSelect={selectEvent} /><EventInspector event={selectedEvent} /></div>
          <BottleneckLens trace={trace} onSelect={selectEvent} />
          <FailureSummary failures={failures} runStatus={trace.status} onSelect={selectEvent} />
          <details className="raw-trace panel"><summary>View complete trace JSON</summary><pre className="json-block">{JSON.stringify(trace.raw, null, 2)}</pre></details>
        </> : <section className="empty-state panel"><div className="empty-state-icon" aria-hidden="true">⌁</div><h2>Trace cleared</h2><p>Load a scenario, paste a trace, or connect a live SSE endpoint.</p></section>}
      </>}
      {view === "replay" && replayTrace && <ReplayTheater key={replayTrace.runId} trace={replayTrace} />}
      {view === "compare" && <RunCompare options={compareOptions} runAId={compareAId} runBId={compareBId} onRunAChange={setCompareAId} onRunBChange={setCompareBId} />}
    </main>
    <footer><span>Agent Trace Viewer · V1.0</span><span>Traces stay in this browser · Live connects only when requested</span></footer>
  </div>;
}
