import { useMemo } from "react";
import { compareRuns } from "../trace/compare/compare";
import type { NormalizedTrace } from "../trace/types";
import type { TraceCategory } from "../trace/types";
import { formatDuration } from "../trace/duration";

export interface CompareOption { id: string; label: string; trace: NormalizedTrace }

function formatDelta(value: number | undefined, unit: "ms" | "count" = "ms"): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return unit === "ms" ? "0 ms" : "0";
  const magnitude = unit === "ms" ? formatDuration(Math.abs(value)) : String(Math.abs(value));
  return (value > 0 ? "+" : "-") + magnitude;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return (value > 0 ? "+" : "") + value.toFixed(1) + "%";
}

export default function RunCompare({ options, runAId, runBId, onRunAChange, onRunBChange }: {
  options: CompareOption[]; runAId: string; runBId: string;
  onRunAChange: (id: string) => void; onRunBChange: (id: string) => void;
}) {
  const runA = options.find((option) => option.id === runAId) ?? options[0];
  const runB = options.find((option) => option.id === runBId) ?? options[1] ?? options[0];
  const comparison = useMemo(() => runA && runB ? compareRuns(runA.trace, runB.trace) : null, [runA, runB]);
  if (!comparison || !runA || !runB) return <section className="panel compare-panel"><h2>Two completed runs are required</h2><p>Load a completed local trace or choose a demo comparison pair.</p></section>;
  const category = (value: TraceCategory) => comparison.categoryBreakdown.find((item) => item.category === value);
  const rows: Array<{ label: string; a: number | undefined; b: number | undefined; delta: number | undefined; unit: "ms" | "count" }> = [
    { label: "LLM duration", a: category("llm")?.durationA, b: category("llm")?.durationB, delta: comparison.llmDurationDeltaMs, unit: "ms" },
    { label: "Retrieval duration", a: category("retrieval")?.durationA, b: category("retrieval")?.durationB, delta: comparison.retrievalDurationDeltaMs, unit: "ms" },
    { label: "Tool duration", a: category("tool")?.durationA, b: category("tool")?.durationB, delta: comparison.toolDurationDeltaMs, unit: "ms" },
    { label: "Memory duration", a: category("memory")?.durationA, b: category("memory")?.durationB, delta: comparison.memoryDurationDeltaMs, unit: "ms" },
    { label: "LLM calls", a: comparison.metricsA.llmCalls, b: comparison.metricsB.llmCalls, delta: comparison.llmCallDelta, unit: "count" },
    { label: "Tool calls", a: comparison.metricsA.toolCalls, b: comparison.metricsB.toolCalls, delta: comparison.toolCallDelta, unit: "count" },
    { label: "Retrieval calls", a: comparison.metricsA.retrievalCalls, b: comparison.metricsB.retrievalCalls, delta: comparison.retrievalCallDelta, unit: "count" },
    { label: "Failures", a: comparison.metricsA.failureCount, b: comparison.metricsB.failureCount, delta: comparison.failureDelta, unit: "count" },
    { label: "Input tokens", a: comparison.metricsA.inputTokens, b: comparison.metricsB.inputTokens, delta: comparison.inputTokenDelta, unit: "count" },
    { label: "Output tokens", a: comparison.metricsA.outputTokens, b: comparison.metricsB.outputTokens, delta: comparison.outputTokenDelta, unit: "count" },
    { label: "Total tokens", a: comparison.metricsA.totalTokens, b: comparison.metricsB.totalTokens, delta: comparison.totalTokenDelta, unit: "count" },
  ];
  return <section className="panel compare-panel" aria-labelledby="compare-heading">
    <div className="section-heading"><div><p className="eyebrow">Run Compare</p><h2 id="compare-heading">Compare measured run data</h2></div><span className="muted-caption">Δ is Run B − Run A</span></div>
    <div className="compare-selectors">
      <div><label htmlFor="compare-run-a">Run A</label><select id="compare-run-a" value={runA.id} onChange={(event) => onRunAChange(event.target.value)}>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
      <span className="compare-vs" aria-hidden="true">vs</span>
      <div><label htmlFor="compare-run-b">Run B</label><select id="compare-run-b" value={runB.id} onChange={(event) => onRunBChange(event.target.value)}>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
    </div>
    <div className="compare-summary" aria-label="Total duration comparison">
      <div><span>Total duration</span><strong>{formatDuration(comparison.durationA)}</strong><small>Run A · {runA.label}</small></div>
      <div><span>Total duration</span><strong>{formatDuration(comparison.durationB)}</strong><small>Run B · {runB.label}</small></div>
      <div className="compare-delta"><span>Delta</span><strong>{formatDelta(comparison.durationDeltaMs)}</strong><small>{formatPercent(comparison.durationDeltaPercent)}</small></div>
    </div>
    <div className="compare-table-wrap"><table className="compare-table"><thead><tr><th scope="col">Measured value</th><th scope="col">Run A</th><th scope="col">Run B</th><th scope="col">Δ B − A</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.a === undefined ? "—" : row.unit === "ms" ? formatDuration(row.a) : row.a.toLocaleString()}</td><td>{row.b === undefined ? "—" : row.unit === "ms" ? formatDuration(row.b) : row.b.toLocaleString()}</td><td>{formatDelta(row.delta, row.unit)}</td></tr>)}
    </tbody></table></div>
    <p className="compare-disclosure">Deltas report recorded values only. They do not rank a run or assert that one is better.</p>
  </section>;
}
