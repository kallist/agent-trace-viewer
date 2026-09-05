import type { NormalizedTrace, TraceCategory, TraceEvent, TraceMetrics } from "./types";

const durationCategories: Array<[TraceCategory, keyof TraceMetrics]> = [
  ["llm", "llmDurationMs"],
  ["tool", "toolDurationMs"],
  ["retrieval", "retrievalDurationMs"],
  ["memory", "memoryDurationMs"],
];

function numericMetadata(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function countCalls(events: TraceEvent[], category: TraceCategory): number {
  const matching = events.filter((event) => event.category === category);
  const starts = matching.filter((event) => event.status === "started").length;
  if (starts > 0) return starts;
  return matching.filter((event) => event.status === "completed" || event.status === "failed").length;
}

export function calculateTraceMetrics(trace: NormalizedTrace): TraceMetrics {
  const metrics: TraceMetrics = {
    totalDurationMs: trace.totalDurationMs,
    llmDurationMs: 0,
    toolDurationMs: 0,
    retrievalDurationMs: 0,
    memoryDurationMs: 0,
    llmCalls: countCalls(trace.events, "llm"),
    toolCalls: countCalls(trace.events, "tool"),
    retrievalCalls: countCalls(trace.events, "retrieval"),
    memoryOperations: countCalls(trace.events, "memory"),
    failureCount: trace.events.filter((event) => event.status === "failed").length,
  };

  for (const [category, metricKey] of durationCategories) {
    metrics[metricKey] = trace.events
      .filter((event) => event.category === category && event.durationMs !== undefined && event.status !== "started")
      .reduce((total, event) => total + (event.durationMs ?? 0), 0);
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let hasInput = false;
  let hasOutput = false;
  let hasTotal = false;
  for (const event of trace.events) {
    const input = numericMetadata(event.metadata, "input_tokens");
    const output = numericMetadata(event.metadata, "output_tokens");
    const total = numericMetadata(event.metadata, "total_tokens");
    if (input !== undefined) { inputTokens += input; hasInput = true; }
    if (output !== undefined) { outputTokens += output; hasOutput = true; }
    if (total !== undefined) { totalTokens += total; hasTotal = true; }
  }
  if (hasInput) metrics.inputTokens = inputTokens;
  if (hasOutput) metrics.outputTokens = outputTokens;
  if (hasTotal) metrics.totalTokens = totalTokens;
  else if (hasInput || hasOutput) metrics.totalTokens = inputTokens + outputTokens;

  return metrics;
}
