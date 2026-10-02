import type { TraceCategory, TraceMetrics } from "../types";

export interface CategoryDelta {
  category: TraceCategory;
  durationA: number;
  durationB: number;
  durationDeltaMs: number;
}

export interface RunComparison {
  metricsA: TraceMetrics;
  metricsB: TraceMetrics;
  durationA: number;
  durationB: number;
  durationDeltaMs: number;
  durationDeltaPercent?: number;
  llmDurationDeltaMs: number;
  retrievalDurationDeltaMs: number;
  toolDurationDeltaMs: number;
  memoryDurationDeltaMs: number;
  llmCallDelta: number;
  toolCallDelta: number;
  retrievalCallDelta: number;
  failureDelta: number;
  inputTokenDelta?: number;
  outputTokenDelta?: number;
  totalTokenDelta?: number;
  categoryBreakdown: CategoryDelta[];
}
