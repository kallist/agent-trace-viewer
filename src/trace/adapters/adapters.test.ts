import { describe, expect, it } from "vitest";
import { adaptTrace, traceAdapters } from "./registry";

describe("trace adapter registry", () => {
  it("recognizes and normalizes native traces through the existing parser", () => {
    const result = adaptTrace({ run_id: "native", events: [{ id: "e1", type: "tool.completed", timestamp: "2026-01-01T00:00:00Z", duration_ms: 2 }] });
    expect(result.ok && result.adapterId).toBe("native");
    expect(result.ok && result.trace.events[0].durationMs).toBe(2);
  });

  it("maps a generic event list and reports malformed or unsupported formats", () => {
    const result = adaptTrace({ events: [{ type: "tool.completed", timestamp: "2026-01-01T00:00:00Z", tool: "search", output: "ok" }] });
    expect(result.ok && result.adapterId).toBe("generic-event-list");
    expect(result.ok && result.trace.events[0].metadata).toMatchObject({ tool: "search", output: "ok" });
    expect(adaptTrace({ events: "bad" }).ok).toBe(false);
    const unsupported = adaptTrace({ unrelated: true });
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) expect(unsupported.errors[0].message).toContain("Unsupported trace format");
  });

  it("maps supported OTel-style resource spans with nanosecond timestamps and status", () => {
    const result = adaptTrace({ resourceSpans: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "demo" } }] }, scopeSpans: [{ spans: [
      { traceId: "trace-1", spanId: "span-1", name: "llm.generate", startTimeUnixNano: "1767225600000000000", endTimeUnixNano: "1767225600125000000", attributes: [{ key: "gen_ai.usage.output_tokens", value: { intValue: 5 } }] },
      { traceId: "trace-1", spanId: "span-2", name: "tool.lookup", startTimeUnixNano: "1767225600200000000", endTimeUnixNano: "1767225600300000000", status: { code: 2, message: "failed" } },
      { traceId: "trace-1", spanId: "span-3", name: "tool.retry.started", startTimeUnixNano: "1767225600400000000", endTimeUnixNano: "1767225600500000000", status: { code: 2 } },
    ] }] }] });
    expect(result.ok && result.adapterId).toBe("otel-style-json");
    expect(result.ok && result.trace.events.map((event) => event.type)).toEqual(["llm.generate.completed", "tool.lookup.failed", "tool.retry.failed"]);
    expect(result.ok && result.trace.events[0].durationMs).toBe(125);
    expect(result.ok && result.trace.events[0].metadata["resource.service.name"]).toBe("demo");
    expect(result.ok && result.trace.events[1].status).toBe("failed");
  });

  it("keeps detection priority deterministic and does not execute input values", () => {
    expect(traceAdapters.map((adapter) => adapter.id)).toEqual(["otel-style-json", "generic-event-list", "native"]);
    const malicious = { events: [{ type: "run.completed", timestamp: "2026-01-01T00:00:00Z", script: "globalThis.compromised = true" }] };
    expect(adaptTrace(malicious).ok).toBe(true);
    expect((globalThis as typeof globalThis & { compromised?: boolean }).compromised).toBeUndefined();
  });
});
