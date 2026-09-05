import { formatDuration } from "../trace/duration";
import { formatNumber } from "../trace/format";
import type { TraceMetrics as Metrics } from "../trace/types";

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  accent?: string;
}

function MetricCard({ label, value, detail, accent = "blue" }: MetricCardProps) {
  return <div className={`metric-card accent-${accent}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export default function TraceMetrics({ metrics }: { metrics: Metrics }) {
  return (
    <section className="metrics-section" aria-labelledby="metrics-heading">
      <div className="section-heading compact"><div><p className="eyebrow">At a glance</p><h2 id="metrics-heading">Run metrics</h2></div></div>
      <div className="metrics-grid primary-metrics">
        <MetricCard label="Total duration" value={formatDuration(metrics.totalDurationMs)} accent="violet" />
        <MetricCard label="LLM" value={formatDuration(metrics.llmDurationMs)} detail={`${metrics.llmCalls} ${metrics.llmCalls === 1 ? "call" : "calls"}`} accent="purple" />
        <MetricCard label="Tools" value={formatDuration(metrics.toolDurationMs)} detail={`${metrics.toolCalls} ${metrics.toolCalls === 1 ? "call" : "calls"}`} accent="orange" />
        <MetricCard label="Retrieval" value={formatDuration(metrics.retrievalDurationMs)} detail={`${metrics.retrievalCalls} ${metrics.retrievalCalls === 1 ? "call" : "calls"}`} accent="teal" />
      </div>
      <div className="metrics-grid secondary-metrics">
        <MetricCard label="LLM calls" value={String(metrics.llmCalls)} />
        <MetricCard label="Tool calls" value={String(metrics.toolCalls)} accent="orange" />
        <MetricCard label="Retrieval calls" value={String(metrics.retrievalCalls)} accent="teal" />
        <MetricCard label="Failures" value={String(metrics.failureCount)} accent={metrics.failureCount > 0 ? "red" : "green"} />
        <MetricCard label="Tokens" value={formatNumber(metrics.totalTokens)} detail={metrics.totalTokens === undefined ? "Not present" : `${formatNumber(metrics.inputTokens)} in · ${formatNumber(metrics.outputTokens)} out`} accent="blue" />
      </div>
    </section>
  );
}
