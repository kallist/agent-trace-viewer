import { calculateTraceMetrics } from "../metrics";
import type { NormalizedTrace } from "../types";
import type { ReplayFrame, ReplaySpeed, ReplayState } from "./types";

export function createReplayState(trace: NormalizedTrace): ReplayState {
  const eventDuration = trace.events.reduce((maximum, event) => Math.max(maximum, event.elapsedMs), 0);
  const durationMs = Math.max(0, trace.totalDurationMs, eventDuration);
  return { cursorMs: 0, durationMs, speed: 1, status: "idle" };
}

export function createReplayFrame(trace: NormalizedTrace, cursorMs: number): ReplayFrame {
  const eventDuration = trace.events.reduce((maximum, event) => Math.max(maximum, event.elapsedMs), 0);
  const durationMs = Math.max(0, trace.totalDurationMs, eventDuration);
  const cursor = Number.isFinite(cursorMs) ? Math.min(durationMs, Math.max(0, cursorMs)) : 0;
  const visibleEvents = trace.events.filter((event) => event.elapsedMs <= cursor);
  const atEnd = cursor >= durationMs;
  const partialTrace: NormalizedTrace = {
    ...trace,
    status: atEnd ? trace.status : "running",
    completedAtMs: atEnd ? trace.completedAtMs : undefined,
    totalDurationMs: cursor,
    events: visibleEvents,
  };
  return {
    visibleEvents,
    partialTrace,
    metrics: calculateTraceMetrics(partialTrace),
    currentEvent: visibleEvents.at(-1) ?? null,
  };
}

export function seekReplay(state: ReplayState, cursorMs: number): ReplayState {
  const cursor = Number.isFinite(cursorMs) ? Math.min(state.durationMs, Math.max(0, cursorMs)) : state.cursorMs;
  return { ...state, cursorMs: cursor, status: cursor >= state.durationMs ? "ended" : "paused" };
}

export function stepReplay(state: ReplayState, elapsedBoundaries: number[], direction: -1 | 1): ReplayState {
  const boundaries = [...new Set(elapsedBoundaries.filter((value) => Number.isFinite(value) && value >= 0 && value <= state.durationMs))].sort((a, b) => a - b);
  if (direction === 1) {
    const next = boundaries.find((value) => value > state.cursorMs);
    return next === undefined ? seekReplay(state, state.durationMs) : seekReplay(state, next);
  }
  const previous = boundaries.filter((value) => value < state.cursorMs).at(-1);
  return seekReplay(state, previous ?? 0);
}

export function advanceReplay(state: ReplayState, deltaMs: number): ReplayState {
  if (state.status !== "playing" || !Number.isFinite(deltaMs) || deltaMs <= 0) return state;
  const cursorMs = Math.min(state.durationMs, state.cursorMs + deltaMs * state.speed);
  return { ...state, cursorMs, status: cursorMs >= state.durationMs ? "ended" : "playing" };
}

export function setReplaySpeed(state: ReplayState, speed: ReplaySpeed): ReplayState {
  return { ...state, speed };
}

export function playReplay(state: ReplayState): ReplayState {
  if (state.durationMs === 0) return { ...state, cursorMs: 0, status: "ended" };
  return { ...state, cursorMs: state.status === "ended" ? 0 : state.cursorMs, status: "playing" };
}

export function pauseReplay(state: ReplayState): ReplayState {
  return state.status === "playing" ? { ...state, status: "paused" } : state;
}
