import { calculateTraceMetrics } from "../metrics";
import type { NormalizedTrace, TraceCategory } from "../types";
import type { CategoryDelta, RunComparison } from "./types";

const categories: TraceCategory[] = ["run", "retrieval", "llm", "tool", "memory"];

function optionalDelta(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined || b === undefined ? undefined : b - a;
}

function categoryDuration(trace: NormalizedTrace, category: TraceCategory): number {
  if (category === "run") return trace.totalDurationMs;
  return trace.events
    .filter((event) => event.category === category && event.status !== "started" && event.durationMs !== undefined)
    .reduce((sum, event) => sum + (event.durationMs ?? 0), 0);
}

export function compareRuns(a: NormalizedTrace, b: NormalizedTrace): RunComparison {
  const metricsA = calculateTraceMetrics(a);
  const metricsB = calculateTraceMetrics(b);
  const durationDeltaMs = b.totalDurationMs - a.totalDurationMs;
  const durationDeltaPercent = a.totalDurationMs === 0
    ? (b.totalDurationMs === 0 ? 0 : undefined)
    : durationDeltaMs / a.totalDurationMs * 100;
  const categoryBreakdown: CategoryDelta[] = categories.map((category) => {
    const durationA = categoryDuration(a, category);
    const durationB = categoryDuration(b, category);
    return { category, durationA, durationB, durationDeltaMs: durationB - durationA };
  });
  return {
    metricsA,
    metricsB,
    durationA: a.totalDurationMs,
    durationB: b.totalDurationMs,
    durationDeltaMs,
    durationDeltaPercent,
    llmDurationDeltaMs: metricsB.llmDurationMs - metricsA.llmDurationMs,
    retrievalDurationDeltaMs: metricsB.retrievalDurationMs - metricsA.retrievalDurationMs,
    toolDurationDeltaMs: metricsB.toolDurationMs - metricsA.toolDurationMs,
    memoryDurationDeltaMs: metricsB.memoryDurationMs - metricsA.memoryDurationMs,
    llmCallDelta: metricsB.llmCalls - metricsA.llmCalls,
    toolCallDelta: metricsB.toolCalls - metricsA.toolCalls,
    retrievalCallDelta: metricsB.retrievalCalls - metricsA.retrievalCalls,
    failureDelta: metricsB.failureCount - metricsA.failureCount,
    inputTokenDelta: optionalDelta(metricsA.inputTokens, metricsB.inputTokens),
    outputTokenDelta: optionalDelta(metricsA.outputTokens, metricsB.outputTokens),
    totalTokenDelta: optionalDelta(metricsA.totalTokens, metricsB.totalTokens),
    categoryBreakdown,
  };
}
