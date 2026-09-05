import failedFixture from "../fixtures/failed-run.json";
import successfulFixture from "../fixtures/successful-run.json";
import { classifyEventStatus, classifyEventType } from "./classify";
import { calculateRunDuration, formatDuration } from "./duration";
import { calculateTraceMetrics } from "./metrics";
import { parseTraceText, parseTraceValue } from "./parser";

describe("trace classification", () => {
  it.each([
    ["run.started", "run"], ["llm.completed", "llm"], ["retrieval.completed", "retrieval"],
    ["rag.retrieved", "retrieval"], ["vector.failed", "retrieval"], ["tool.completed", "tool"],
    ["memory.written", "memory"], ["custom.signal", "other"],
  ])("classifies %s as %s", (type, category) => expect(classifyEventType(type)).toBe(category));

  it.each([["run.started", "started"], ["tool.completed", "completed"], ["retrieval.failed", "failed"], ["custom.signal", "info"]])(
    "classifies %s status as %s", (type, status) => expect(classifyEventStatus(type)).toBe(status),
  );
});

describe("trace parser and normalizer", () => {
  it("parses the successful fixture, sorts events, and normalizes fields", () => {
    const input = { ...successfulFixture, events: [...successfulFixture.events].reverse() };
    const result = parseTraceValue(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trace.runId).toBe("run_001");
    expect(result.trace.events.map((event) => event.type)).toEqual([
      "run.started", "retrieval.started", "retrieval.completed", "llm.started", "llm.completed",
      "tool.started", "tool.completed", "memory.written", "run.completed",
    ]);
    expect(result.trace.events.find((event) => event.type === "tool.completed")?.elapsedMs).toBe(1536);
  });

  it("returns a controlled error for invalid JSON and invalid schema", () => {
    expect(parseTraceText("{not json")).toEqual({ ok: false, errors: [{ path: "json", message: expect.stringContaining("Invalid JSON") }] });
    const invalid = parseTraceValue({ events: [{ type: "tool.started", timestamp: "not-a-date" }] });
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.errors).toEqual(expect.arrayContaining([
      { path: "events[0].timestamp", message: "Event timestamp must be valid." },
    ]));
  });

  it("requires an events array but accepts empty events", () => {
    expect(parseTraceValue({ run_id: "missing-events" }).ok).toBe(false);
    const result = parseTraceValue({ run_id: "empty", status: "running", events: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.trace.totalDurationMs).toBe(0);
  });

  it("uses deterministic ids, renames duplicate ids, and warns on malformed optional fields", () => {
    const result = parseTraceValue({ events: [
      { id: "same", type: "tool.completed", timestamp: "2026-01-01T00:00:00Z", duration_ms: -2, metadata: "bad" },
      { id: "same", type: "custom.signal", timestamp: "2026-01-01T00:00:01Z" },
      { type: "custom.signal", timestamp: "2026-01-01T00:00:02Z" },
    ] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trace.events.map((event) => event.id)).toEqual(["same", "same-2", "event-3"]);
    expect(result.trace.events[0].durationMs).toBeUndefined();
    expect(result.warnings.map((warning) => warning.path)).toEqual(expect.arrayContaining([
      "events[0].duration_ms", "events[0].metadata", "events[1].id", "events[2].id",
    ]));
  });

  it("pairs an obvious started/completed operation without inventing unrelated durations", () => {
    const result = parseTraceValue({ events: [
      { type: "tool.started", timestamp: "2026-01-01T00:00:00.000Z" },
      { type: "other.completed", timestamp: "2026-01-01T00:00:00.050Z" },
      { type: "tool.completed", timestamp: "2026-01-01T00:00:00.120Z" },
    ] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.trace.events[2].durationMs).toBe(120);
      expect(result.trace.events[1].durationMs).toBeUndefined();
    }
  });
});

describe("trace metrics and duration helpers", () => {
  it("calculates expected successful fixture durations, calls, failures, and tokens", () => {
    const result = parseTraceValue(successfulFixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calculateTraceMetrics(result.trace)).toEqual(expect.objectContaining({
      totalDurationMs: 1610, llmDurationMs: 1420, toolDurationMs: 12, retrievalDurationMs: 86,
      memoryDurationMs: 31, llmCalls: 1, toolCalls: 1, retrievalCalls: 1, memoryOperations: 1,
      failureCount: 0, inputTokens: 1200, outputTokens: 180, totalTokens: 1380,
    }));
  });

  it("does not double count started/completed pairs and counts failed calls once", () => {
    const result = parseTraceValue(failedFixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const metrics = calculateTraceMetrics(result.trace);
    expect(metrics.retrievalCalls).toBe(1);
    expect(metrics.failureCount).toBe(2);
    expect(metrics.retrievalDurationMs).toBe(630);
  });

  it("leaves absent tokens undefined but preserves real zero values", () => {
    const absent = parseTraceValue({ events: [{ type: "run.completed", timestamp: "2026-01-01T00:00:00Z" }] });
    expect(absent.ok).toBe(true);
    if (absent.ok) expect(calculateTraceMetrics(absent.trace).totalTokens).toBeUndefined();
    const zero = parseTraceValue({ events: [{ type: "llm.completed", timestamp: "2026-01-01T00:00:00Z", metadata: { input_tokens: 0, output_tokens: 0 } }] });
    expect(zero.ok).toBe(true);
    if (zero.ok) expect(calculateTraceMetrics(zero.trace)).toEqual(expect.objectContaining({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }));
  });

  it("calculates run fallback and formats milliseconds, seconds, and minutes", () => {
    expect(calculateRunDuration(0, undefined, 100, 850)).toBe(750);
    expect(calculateRunDuration(0, 1610, 100, 850)).toBe(1610);
    expect(formatDuration(0)).toBe("0 ms");
    expect(formatDuration(86)).toBe("86 ms");
    expect(formatDuration(1420)).toBe("1.42 s");
    expect(formatDuration(64_000)).toBe("1m 04s");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("—");
  });
});
