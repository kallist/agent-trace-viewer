import { formatDuration } from "../trace/duration";
import { displayMetadataValue, prettyJson, titleCase } from "../trace/format";
import type { TraceEvent } from "../trace/types";

function metadataError(event: TraceEvent): string {
  const candidates = ["error", "message", "error_type", "code"];
  for (const key of candidates) {
    const value = event.metadata[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return "No error message provided";
}

export default function EventInspector({ event }: { event: TraceEvent | null }) {
  if (!event) return <aside className="inspector panel empty-inspector" aria-labelledby="inspector-heading"><p className="eyebrow">Inspector</p><h2 id="inspector-heading">Select an event</h2><p>Choose an event in the timeline to inspect its metadata and raw payload.</p></aside>;

  return <aside className="inspector panel" aria-labelledby="inspector-heading">
    <div className="inspector-top"><div><p className="eyebrow">Inspector</p><h2 id="inspector-heading">{event.type}</h2></div><span className={`category-badge category-${event.category}`}>{event.category}</span></div>
    <div className="inspector-status"><span className={`status-dot dot-${event.status}`} aria-hidden="true" /> <strong>{titleCase(event.status)}</strong>{event.status === "failed" && <span className="failure-chip">Failure</span>}</div>
    <dl className="detail-list">
      <div><dt>Event ID</dt><dd className="mono">{event.id}</dd></div>
      <div><dt>Timestamp</dt><dd>{event.timestamp}</dd></div>
      <div><dt>Elapsed</dt><dd>{formatDuration(event.elapsedMs)}</dd></div>
      <div><dt>Duration</dt><dd>{formatDuration(event.durationMs)}</dd></div>
    </dl>
    {event.status === "failed" && <div className="inspector-error"><span className="eyebrow">Error signal</span><strong>{metadataError(event)}</strong></div>}
    <div className="json-section"><h3>Metadata</h3>{Object.keys(event.metadata).length > 0 ? <><dl className="metadata-list">{Object.entries(event.metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{displayMetadataValue(value)}</dd></div>)}</dl><pre className="json-block">{displayMetadataValue(event.metadata)}</pre></> : <pre className="json-block">No metadata</pre>}</div>
    <details className="raw-details"><summary>Raw JSON</summary><pre className="json-block">{prettyJson(event.raw)}</pre></details>
  </aside>;
}
