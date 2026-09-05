import { formatDuration } from "../trace/duration";
import { titleCase } from "../trace/format";
import type { NormalizedTrace } from "../trace/types";

function statusLabel(status: NormalizedTrace["status"]): string {
  return status === "unknown" ? "Unknown status" : titleCase(status);
}

export default function TraceSummary({ trace }: { trace: NormalizedTrace }) {
  return (
    <section className="summary panel" aria-labelledby="summary-heading">
      <div className="summary-title">
        <div className={`run-status status-${trace.status}`}><span className="status-icon" aria-hidden="true">{trace.status === "failed" ? "×" : trace.status === "completed" ? "✓" : "•"}</span>{statusLabel(trace.status)}</div>
        <h2 id="summary-heading">{trace.name ?? "Untitled agent run"}</h2>
        <p className="run-id">{trace.runId}</p>
      </div>
      <div className="summary-facts">
        <div><span>Events</span><strong>{trace.events.length}</strong></div>
        <div><span>Started</span><strong>{new Date(trace.startedAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong></div>
        <div><span>Run duration</span><strong>{formatDuration(trace.totalDurationMs)}</strong></div>
      </div>
    </section>
  );
}
