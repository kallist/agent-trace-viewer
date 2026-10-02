import { describe, expect, it } from "vitest";
import { parseTraceValue } from "../parser";
import { advanceReplay, createReplayFrame, createReplayState, pauseReplay, playReplay, seekReplay, setReplaySpeed, stepReplay } from "./replay";

const parsed = parseTraceValue({ run_id: "replay", status: "completed", started_at: "2026-01-01T00:00:00.000Z", completed_at: "2026-01-01T00:00:01.000Z", events: [
  { id: "a", type: "run.started", timestamp: "2026-01-01T00:00:00.000Z" },
  { id: "b", type: "llm.completed", timestamp: "2026-01-01T00:00:00.500Z", duration_ms: 500, metadata: { output_tokens: 3 } },
  { id: "c", type: "tool.completed", timestamp: "2026-01-01T00:00:00.500Z", duration_ms: 10 },
  { id: "d", type: "run.completed", timestamp: "2026-01-01T00:00:01.000Z" },
] });
if (!parsed.ok) throw new Error("Replay test fixture is invalid");
const trace = parsed.trace;

describe("deterministic replay domain", () => {
  it("derives empty, exact-boundary, middle and final frames from a trace and cursor", () => {
    expect(createReplayFrame(trace, 0).visibleEvents.map((event) => event.id)).toEqual(["a"]);
    const boundary = createReplayFrame(trace, 500);
    expect(boundary.visibleEvents.map((event) => event.id)).toEqual(["a", "b", "c"]);
    expect(boundary.metrics.outputTokens).toBe(3);
    expect(createReplayFrame(trace, 250).visibleEvents.map((event) => event.id)).toEqual(["a"]);
    expect(createReplayFrame(trace, 1000).partialTrace.status).toBe("completed");
    expect(createReplayFrame(trace, 4000).visibleEvents).toHaveLength(4);
  });

  it("steps by unique event time boundaries in both directions", () => {
    const state = createReplayState(trace);
    const forward = stepReplay(state, trace.events.map((event) => event.elapsedMs), 1);
    expect(forward.cursorMs).toBe(500);
    const next = stepReplay(forward, trace.events.map((event) => event.elapsedMs), 1);
    expect(next.cursorMs).toBe(1000);
    expect(stepReplay(next, trace.events.map((event) => event.elapsedMs), -1).cursorMs).toBe(500);
    expect(stepReplay(state, trace.events.map((event) => event.elapsedMs), -1).cursorMs).toBe(0);
  });

  it("clamps seek, advances a virtual clock by speed, pauses and restarts at end", () => {
    let state = playReplay(createReplayState(trace));
    state = setReplaySpeed(state, 2);
    state = advanceReplay(state, 200);
    expect(state.cursorMs).toBe(400);
    expect(pauseReplay(state).status).toBe("paused");
    state = seekReplay(state, 5000);
    expect(state).toMatchObject({ cursorMs: 1000, status: "ended" });
    expect(playReplay(state)).toMatchObject({ cursorMs: 0, status: "playing" });
    expect(seekReplay(createReplayState(trace), -10).cursorMs).toBe(0);
  });

  it("handles zero-duration and one-event traces", () => {
    const one = parseTraceValue({ events: [{ type: "run.completed", timestamp: "2026-01-01T00:00:00Z" }] });
    if (!one.ok) throw new Error("One-event fixture is invalid");
    const state = createReplayState(one.trace);
    expect(state.durationMs).toBe(0);
    expect(playReplay(state).status).toBe("ended");
    expect(createReplayFrame(one.trace, 0).visibleEvents).toHaveLength(1);
  });
});
