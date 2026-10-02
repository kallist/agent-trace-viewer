import type { NormalizedTrace, TraceEvent, TraceMetrics } from "../types";

export type ReplaySpeed = 0.5 | 1 | 2 | 4;
export type ReplayStatus = "idle" | "playing" | "paused" | "ended";

export interface ReplayState {
  cursorMs: number;
  durationMs: number;
  speed: ReplaySpeed;
  status: ReplayStatus;
}

export interface ReplayFrame {
  visibleEvents: TraceEvent[];
  partialTrace: NormalizedTrace;
  metrics: TraceMetrics;
  currentEvent: TraceEvent | null;
}
