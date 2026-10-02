import { describe, expect, it } from "vitest";
import { parseTraceValue } from "../parser";
import { compareRuns } from "./compare";

function trace(runId: string, durationMs: number, events: unknown[] = []) {
  const started = Date.parse("2026-01-01T00:00:00Z");
  const result = parseTraceValue({ run_id: runId, status: "completed", started_at: new Date(started).toISOString(), completed_at: new Date(started + durationMs).toISOString(), events });
  if (!result.ok) throw new Error("Compare fixture is invalid");
  return result.trace;
}

describe("run comparison", () => {
  it("computes positive and negative factual deltas across calls, categories, failures and tokens", () => {
    const a = trace("a", 3200, [
      { type: "llm.completed", timestamp: "2026-01-01T00:00:00.500Z", duration_ms: 2200, metadata: { input_tokens: 80, output_tokens: 20 } },
      { type: "retrieval.completed", timestamp: "2026-01-01T00:00:00.600Z", duration_ms: 700 },
      { type: "tool.completed", timestamp: "2026-01-01T00:00:00.700Z", duration_ms: 300 },
      { type: "tool.failed", timestamp: "2026-01-01T00:00:00.800Z", duration_ms: 20 },
    ]);
    const b = trace("b", 2450, [
      { type: "llm.completed", timestamp: "2026-01-01T00:00:00.500Z", duration_ms: 1800, metadata: { input_tokens: 60, output_tokens: 25 } },
      { type: "retrieval.completed", timestamp: "2026-01-01T00:00:00.600Z", duration_ms: 450 },
      { type: "tool.completed", timestamp: "2026-01-01T00:00:00.700Z", duration_ms: 200 },
    ]);
    const delta = compareRuns(a, b);
    expect(delta.durationDeltaMs).toBe(-750);
    expect(delta.durationDeltaPercent).toBeCloseTo(-23.4375);
    expect(delta.llmDurationDeltaMs).toBe(-400);
    expect(delta.retrievalDurationDeltaMs).toBe(-250);
    expect(delta.toolDurationDeltaMs).toBe(-120);
    expect(delta.failureDelta).toBe(-1);
    expect(delta.totalTokenDelta).toBe(-15);
    expect(delta.categoryBreakdown.find((item) => item.category === "run")?.durationDeltaMs).toBe(-750);
  });

  it("handles zero baseline and unavailable token data without non-finite values", () => {
    const empty = trace("empty", 0);
    const same = compareRuns(empty, empty);
    expect(same.durationDeltaPercent).toBe(0);
    expect(same.totalTokenDelta).toBeUndefined();
    const nonzero = compareRuns(empty, trace("nonzero", 500));
    expect(nonzero.durationDeltaPercent).toBeUndefined();
    expect(Number.isFinite(nonzero.durationDeltaMs)).toBe(true);
    expect(JSON.stringify(nonzero)).not.toMatch(/NaN|Infinity/);
  });

  it("preserves positive, negative, and zero call count differences", () => {
    const a = trace("a", 10, [{ type: "tool.completed", timestamp: "2026-01-01T00:00:00.001Z", duration_ms: 1 }]);
    const b = trace("b", 10, [
      { type: "tool.completed", timestamp: "2026-01-01T00:00:00.001Z", duration_ms: 1 },
      { type: "tool.completed", timestamp: "2026-01-01T00:00:00.002Z", duration_ms: 1 },
    ]);
    expect(compareRuns(a, b).toolCallDelta).toBe(1);
    expect(compareRuns(b, a).toolCallDelta).toBe(-1);
    expect(compareRuns(a, a).toolCallDelta).toBe(0);
  });
});
