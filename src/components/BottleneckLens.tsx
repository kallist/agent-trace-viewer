import type { TraceEvent, NormalizedTrace } from "../trace/types";
import { analyzeTrace } from "../trace/analysis/bottlenecks";

export default function BottleneckLens({ trace, onSelect }: { trace: NormalizedTrace; onSelect: (event: TraceEvent) => void }) {
  const insights = analyzeTrace(trace);
  return <section className="panel bottleneck-lens" aria-labelledby="lens-heading">
    <div className="section-heading"><div><p className="eyebrow">Evidence from this trace</p><h2 id="lens-heading">Bottleneck Lens</h2></div><span className="heuristic-badge">Heuristic analysis</span></div>
    <p className="lens-disclosure">Deterministic observations from recorded durations and events. These signals do not confirm root cause.</p>
    {insights.length === 0 ? <p className="empty-inline">No measurable bottleneck signals in this trace.</p> : <ul className="insight-list">{insights.map((insight) => <li key={insight.id} className={"insight-card severity-" + insight.severity}>
      <div><span className="insight-severity">{insight.severity}</span><h3>{insight.title}</h3><p>{insight.evidence}</p></div>
      {insight.eventIds?.[0] && (() => { const event = trace.events.find((item) => item.id === insight.eventIds?.[0]); return event ? <button className="button button-quiet" type="button" onClick={() => onSelect(event)}>Inspect evidence</button> : null; })()}
    </li>)}</ul>}
  </section>;
}
