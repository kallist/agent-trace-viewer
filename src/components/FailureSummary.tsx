import { formatDuration } from "../trace/duration";
import type { TraceEvent, TraceStatus } from "../trace/types";

function firstText(metadata: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return fallback;
}

function failureDescription(metadata: Record<string, unknown>): string {
  const error = firstText(metadata, ["error", "error_type", "code"], "");
  const message = firstText(metadata, ["message"], "No error message provided");
  return error ? `${error} · ${message}` : message;
}

export default function FailureSummary({ failures, onSelect, runStatus }: { failures: TraceEvent[]; onSelect: (event: TraceEvent) => void; runStatus?: TraceStatus }) {
  if (failures.length === 0 && runStatus === "failed") return <section className="failure-summary" aria-labelledby="failure-heading"><div className="failure-summary-heading"><div className="summary-icon" aria-hidden="true">!</div><div><p className="eyebrow">Run health</p><h2 id="failure-heading">Run failed</h2><p>The run reported failure without an individual failed event.</p></div></div></section>;
  if (failures.length === 0) return <section className="failure-summary success-summary" aria-labelledby="failure-heading"><div className="summary-icon" aria-hidden="true">✓</div><div><p className="eyebrow">Run health</p><h2 id="failure-heading">No failures detected</h2><p>All normalized events completed without a failed status.</p></div></section>;

  return <section className="failure-summary" aria-labelledby="failure-heading">
    <div className="failure-summary-heading"><div className="summary-icon" aria-hidden="true">!</div><div><p className="eyebrow">Run health</p><h2 id="failure-heading">{failures.length} failed {failures.length === 1 ? "event" : "events"}</h2><p>Review the failure signals below, then select one for full context.</p></div></div>
    <div className="failure-list">{failures.map((event) => <button className="failure-row" type="button" key={event.id} onClick={() => onSelect(event)}>
      <span className="failure-row-icon" aria-hidden="true">×</span><span className="failure-row-main"><strong>{event.type}</strong><small>{failureDescription(event.metadata)}</small></span><span className="failure-row-time">{formatDuration(event.elapsedMs)}</span><span aria-hidden="true">›</span>
    </button>)}</div>
  </section>;
}
