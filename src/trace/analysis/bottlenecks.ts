import type { NormalizedTrace, TraceCategory } from "../types";
import type { TraceInsight } from "./types";

export const BOTTLENECK_THRESHOLDS = {
  dominantCategoryShare: 0.6,
  retrievalHeavyShare: 0.4,
  repeatedToolCalls: 3,
} as const;

const measuredCategories: TraceCategory[] = ["llm", "retrieval", "tool", "memory"];

export function analyzeTrace(trace: NormalizedTrace): TraceInsight[] {
  const insights: TraceInsight[] = [];
  const measuredEvents = trace.events.filter((event) => measuredCategories.includes(event.category) && event.status !== "started" && event.durationMs !== undefined);
  const totals = measuredCategories.map((category) => ({
    category,
    durationMs: measuredEvents.filter((event) => event.category === category).reduce((sum, event) => sum + (event.durationMs ?? 0), 0),
  }));
  const measuredTotal = totals.reduce((sum, item) => sum + item.durationMs, 0);
  const dominant = [...totals].sort((a, b) => b.durationMs - a.durationMs || measuredCategories.indexOf(a.category) - measuredCategories.indexOf(b.category))[0];

  if (measuredTotal > 0 && dominant && dominant.durationMs / measuredTotal >= BOTTLENECK_THRESHOLDS.dominantCategoryShare) {
    const percent = Math.round(dominant.durationMs / measuredTotal * 100);
    insights.push({ id: "dominant-category", severity: "notice", type: "dominant-category", title: `${dominant.category.toUpperCase()} is the largest measured latency category`, evidence: `${dominant.category.toUpperCase()} stages account for ${percent}% of measured stage duration (${dominant.durationMs} ms of ${measuredTotal} ms).` });
  }

  const slowest = [...measuredEvents].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0) || a.elapsedMs - b.elapsedMs || a.id.localeCompare(b.id))[0];
  if (slowest?.durationMs !== undefined) {
    insights.push({ id: "slowest-event", severity: "info", type: "slowest-event", title: "Slowest measured event", evidence: `${slowest.type} is the slowest measured event at ${slowest.durationMs} ms.`, eventIds: [slowest.id] });
  }

  const toolGroups = new Map<string, string[]>();
  for (const event of trace.events.filter((item) => item.category === "tool" && item.status !== "started")) {
    const name = typeof event.metadata.tool === "string" && event.metadata.tool.trim() ? event.metadata.tool : event.type;
    toolGroups.set(name, [...(toolGroups.get(name) ?? []), event.id]);
  }
  for (const [tool, eventIds] of [...toolGroups].sort(([a], [b]) => a.localeCompare(b))) {
    if (eventIds.length >= BOTTLENECK_THRESHOLDS.repeatedToolCalls) {
      insights.push({ id: `repeated-tool:${tool}`, severity: "notice", type: "repeated-tool", title: `Repeated tool calls: ${tool}`, evidence: `${tool} appears ${eventIds.length} times in this run.`, eventIds });
    }
  }

  const failures = trace.events.filter((event) => event.status === "failed");
  if (failures.length > 0) {
    const failedTools = failures.filter((event) => event.category === "tool");
    insights.push({ id: "failure-hotspot", severity: "warning", type: "failure-hotspot", title: "Failure events observed", evidence: `${failures.length} failed event${failures.length === 1 ? "" : "s"} observed${failedTools.length ? `, including ${failedTools.length} tool failure${failedTools.length === 1 ? "" : "s"}` : ""}.`, eventIds: failures.map((event) => event.id) });
  }

  const retrieval = totals.find((item) => item.category === "retrieval");
  if (measuredTotal > 0 && retrieval && retrieval.durationMs > 0 && retrieval.durationMs / measuredTotal >= BOTTLENECK_THRESHOLDS.retrievalHeavyShare) {
    const percent = Math.round(retrieval.durationMs / measuredTotal * 100);
    insights.push({ id: "retrieval-heavy", severity: "notice", type: "retrieval-heavy", title: "Retrieval is a substantial measured stage", evidence: `Retrieval accounts for ${percent}% of measured stage duration (${retrieval.durationMs} ms of ${measuredTotal} ms).` });
  }

  const missing = trace.events.filter((event) => event.category !== "run" && event.status !== "started" && event.durationMs === undefined);
  if (missing.length > 0) {
    insights.push({ id: "missing-duration", severity: "info", type: "missing-duration", title: "Duration data is incomplete", evidence: `${missing.length} event${missing.length === 1 ? " does" : "s do"} not include duration data; missing values are not treated as zero.`, eventIds: missing.map((event) => event.id) });
  }
  return insights;
}
