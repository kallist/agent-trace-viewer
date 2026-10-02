import { describe, expect, it } from "vitest";
import { parseTraceValue } from "../parser";
import { analyzeTrace, BOTTLENECK_THRESHOLDS } from "./bottlenecks";

function makeTrace(events: unknown[]) {
  const result = parseTraceValue({ run_id: "lens", status: "completed", started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:00:05Z", events });
  if (!result.ok) throw new Error("Lens fixture is invalid");
  return result.trace;
}

describe("deterministic bottleneck lens", () => {
  it("reports measured dominant category at the threshold and slowest event", () => {
    const insights = analyzeTrace(makeTrace([
      { id: "llm", type: "llm.completed", timestamp: "2026-01-01T00:00:01Z", duration_ms: 600 },
      { id: "tool", type: "tool.completed", timestamp: "2026-01-01T00:00:02Z", duration_ms: 400 },
    ]));
    expect(insights.find((item) => item.type === "dominant-category")?.evidence).toContain("60%");
    expect(insights.find((item) => item.type === "slowest-event")?.eventIds).toEqual(["llm"]);
  });

  it("uses stable tie order and does not call sub-threshold categories dominant", () => {
    const tied = analyzeTrace(makeTrace([
      { id: "llm-tied", type: "llm.completed", timestamp: "2026-01-01T00:00:01Z", duration_ms: 500 },
      { id: "tool-tied", type: "tool.completed", timestamp: "2026-01-01T00:00:02Z", duration_ms: 500 },
    ]));
    expect(tied.find((item) => item.type === "dominant-category")).toBeUndefined();
    expect(tied.find((item) => item.type === "slowest-event")?.eventIds).toEqual(["llm-tied"]);
    expect(BOTTLENECK_THRESHOLDS.dominantCategoryShare).toBe(0.6);
  });

  it("reports repeated tools, failure evidence, retrieval share and missing duration", () => {
    const insights = analyzeTrace(makeTrace([
      ...[1, 2, 3].map((second, index) => ({ id: `tool-${index}`, type: "tool.completed", timestamp: `2026-01-01T00:00:0${second}Z`, duration_ms: 10, metadata: { tool: "search" } })),
      { id: "retrieval", type: "retrieval.completed", timestamp: "2026-01-01T00:00:04Z", duration_ms: 70 },
      { id: "failed", type: "tool.failed", timestamp: "2026-01-01T00:00:05Z", metadata: { tool: "search" } },
    ]));
    expect(insights.some((item) => item.type === "repeated-tool" && item.evidence.includes("4 times"))).toBe(true);
    expect(insights.some((item) => item.type === "failure-hotspot" && item.evidence.includes("1 failed"))).toBe(true);
    expect(insights.some((item) => item.type === "retrieval-heavy")).toBe(true);
    expect(insights.find((item) => item.type === "missing-duration")?.evidence).toContain("not include duration");
  });

  it("returns no diagnosis for an empty trace", () => {
    expect(analyzeTrace(makeTrace([]))).toEqual([]);
  });
});
