import { clamp, formatDuration } from "../trace/duration";
import { titleCase } from "../trace/format";
import type { NormalizedTrace, TraceEvent } from "../trace/types";

interface TraceTimelineProps {
  trace: NormalizedTrace;
  selectedEventId: string | null;
  onSelect: (event: TraceEvent) => void;
}

function eventPosition(event: TraceEvent, trace: NormalizedTrace): { left: string; width: string; marker: boolean } {
  const scale = Math.max(trace.totalDurationMs, 1);
  const rawLeft = clamp((event.timestampMs - trace.startedAtMs) / scale) * 100;
  const availableWidth = Math.max(0, 100 - rawLeft);
  const rawWidth = event.durationMs === undefined ? 0 : clamp(event.durationMs / scale, 0, 1) * 100;
  const width = Math.min(availableWidth, rawWidth);
  const marker = width < 0.7;
  const left = marker ? Math.min(rawLeft, 99.5) : rawLeft;
  return { left: `${left}%`, width: `${width}%`, marker };
}

export default function TraceTimeline({ trace, selectedEventId, onSelect }: TraceTimelineProps) {
  return (
    <section className="timeline-panel panel" aria-labelledby="timeline-heading">
      <div className="section-heading timeline-heading"><div><p className="eyebrow">Ordered by timestamp</p><h2 id="timeline-heading">Event timeline</h2></div><span className="muted-caption">{trace.events.length} events</span></div>
      {trace.events.length === 0 ? <div className="empty-inline">This trace has no events to display.</div> : <div className="timeline-list">
        {trace.events.map((event) => {
          const position = eventPosition(event, trace);
          return <button
            type="button"
            key={event.id}
            className={`timeline-event ${event.status === "failed" ? "is-failed" : ""} ${selectedEventId === event.id ? "is-selected" : ""}`}
            onClick={() => onSelect(event)}
            aria-pressed={selectedEventId === event.id}
            aria-label={`${event.type}, ${titleCase(event.status)}, ${formatDuration(event.durationMs)}`}
            data-event-type={event.type}
          >
            <span className="event-time">{formatDuration(event.elapsedMs)}</span>
            <span className={`category-badge category-${event.category}`}>{event.category}</span>
            <span className="event-main"><strong>{event.type}</strong><span className={`event-status status-text-${event.status}`}>{event.status === "failed" ? "FAILED" : titleCase(event.status)}</span></span>
            <span className="event-bar" aria-hidden="true"><span className={`event-duration ${position.marker ? "marker" : ""}`} style={{ left: position.left, width: position.width }} /></span>
            <span className="event-duration-label">{formatDuration(event.durationMs)}</span>
            <span className="event-chevron" aria-hidden="true">›</span>
          </button>;
        })}
      </div>}
    </section>
  );
}
