import { useMemo, useRef, useState } from "react";
import failedFixture from "../fixtures/failed-run.json";
import successfulFixture from "../fixtures/successful-run.json";
import ErrorBanner from "../components/ErrorBanner";
import EventInspector from "../components/EventInspector";
import FailureSummary from "../components/FailureSummary";
import TraceImporter from "../components/TraceImporter";
import TraceMetrics from "../components/TraceMetrics";
import TraceSummary from "../components/TraceSummary";
import TraceTimeline from "../components/TraceTimeline";
import { calculateTraceMetrics } from "../trace/metrics";
import { parseTraceValue, parseTraceText } from "../trace/parser";
import type { NormalizedTrace, ParseResult, TraceEvent, TraceValidationError, TraceWarning } from "../trace/types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function initialTrace(): { trace: NormalizedTrace; warnings: TraceWarning[] } {
  const result = parseTraceValue(successfulFixture);
  if (!result.ok) throw new Error("Built-in successful fixture is invalid.");
  return { trace: result.trace, warnings: result.warnings };
}

export default function App() {
  const initial = useMemo(initialTrace, []);
  const [trace, setTrace] = useState<NormalizedTrace | null>(initial.trace);
  const [warnings, setWarnings] = useState<TraceWarning[]>(initial.warnings);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [errors, setErrors] = useState<TraceValidationError[] | null>(null);
  const importSequence = useRef(0);
  const metrics = useMemo(() => trace ? calculateTraceMetrics(trace) : null, [trace]);
  const selectedEvent = trace?.events.find((event) => event.id === selectedEventId) ?? null;
  const failures = trace?.events.filter((event) => event.status === "failed") ?? [];

  function applyResult(result: ParseResult, sequence: number) {
    if (sequence !== importSequence.current) return;
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setTrace(result.trace);
    setWarnings(result.warnings);
    setErrors(null);
    setSelectedEventId(null);
  }

  function loadSample(sample: "successful" | "failed") {
    const sequence = importSequence.current + 1;
    importSequence.current = sequence;
    applyResult(parseTraceValue(sample === "successful" ? successfulFixture : failedFixture), sequence);
  }

  function importPastedText(text: string) {
    const sequence = importSequence.current + 1;
    importSequence.current = sequence;
    if (text.length > MAX_FILE_BYTES) {
      setErrors([{ path: "paste", message: "Trace text is too large. Use a JSON trace smaller than 5 MB." }]);
      return;
    }
    applyResult(parseTraceText(text), sequence);
  }

  async function importFile(file: File) {
    const sequence = importSequence.current + 1;
    importSequence.current = sequence;
    if (file.size > MAX_FILE_BYTES) {
      setErrors([{ path: "file", message: "File too large. Choose a JSON file smaller than 5 MB." }]);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".json") && !["application/json", "text/json", "text/plain"].includes(file.type)) {
      setErrors([{ path: "file", message: "Please choose a .json file." }]);
      return;
    }
    try {
      const text = await file.text();
      if (sequence !== importSequence.current) return;
      applyResult(parseTraceText(text), sequence);
    } catch {
      if (sequence === importSequence.current) setErrors([{ path: "file", message: "File read failed. Try selecting the file again." }]);
    }
  }

  function clearTrace() {
    importSequence.current += 1;
    setTrace(null);
    setWarnings([]);
    setErrors(null);
    setSelectedEventId(null);
  }

  function selectEvent(event: TraceEvent) {
    setSelectedEventId(event.id);
  }

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span>⌁</span></div><div><p className="eyebrow">Developer tool · v0.1</p><h1>Agent Trace Viewer</h1></div></div>
      <p className="header-tagline">Inspect AI agent execution locally</p>
    </header>
    <main>
      <TraceImporter onPasteImport={importPastedText} onFileImport={importFile} onLoadSample={loadSample} onClear={clearTrace} hasTrace={trace !== null} />
      <ErrorBanner errors={errors} />
      {warnings.length > 0 && <div className="warning-banner" role="status"><strong>Imported with {warnings.length} warning{warnings.length === 1 ? "" : "s"}</strong><span>{warnings[0].message}{warnings.length > 1 ? ` + ${warnings.length - 1} more` : ""}</span></div>}
      {trace && metrics ? <>
        <TraceSummary trace={trace} />
        <TraceMetrics metrics={metrics} />
        <div className="workspace-grid"><TraceTimeline trace={trace} selectedEventId={selectedEventId} onSelect={selectEvent} /><EventInspector event={selectedEvent} /></div>
        <FailureSummary failures={failures} onSelect={selectEvent} />
        <details className="raw-trace panel"><summary>View complete trace JSON</summary><pre className="json-block">{JSON.stringify(trace.raw, null, 2)}</pre></details>
      </> : <section className="empty-state panel"><div className="empty-state-icon" aria-hidden="true">⌁</div><h2>Trace cleared</h2><p>Load a sample or import a local JSON trace to start inspecting.</p></section>}
    </main>
    <footer><span>Agent Trace Viewer</span><span>All processing stays in your browser · No network API</span></footer>
  </div>;
}
