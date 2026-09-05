export type TraceCategory =
  | "run"
  | "llm"
  | "retrieval"
  | "tool"
  | "memory"
  | "other";

export type TraceEventStatus = "started" | "completed" | "failed" | "info";

export type TraceStatus = "completed" | "failed" | "running" | "unknown";

export interface TraceEvent {
  id: string;
  type: string;
  category: TraceCategory;
  status: TraceEventStatus;
  timestamp: string;
  timestampMs: number;
  durationMs?: number;
  elapsedMs: number;
  metadata: Record<string, unknown>;
  raw: unknown;
}

export interface NormalizedTrace {
  runId: string;
  name?: string;
  status: TraceStatus;
  startedAtMs: number;
  completedAtMs?: number;
  totalDurationMs: number;
  events: TraceEvent[];
  raw: unknown;
}

export interface TraceWarning {
  path: string;
  message: string;
}

export interface TraceValidationError {
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; trace: NormalizedTrace; warnings: TraceWarning[] }
  | { ok: false; errors: TraceValidationError[] };

export interface TraceMetrics {
  totalDurationMs: number;
  llmDurationMs: number;
  toolDurationMs: number;
  retrievalDurationMs: number;
  memoryDurationMs: number;
  llmCalls: number;
  toolCalls: number;
  retrievalCalls: number;
  memoryOperations: number;
  failureCount: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}
