import { parseLiveMessage } from "./protocol";
import {
  MAX_LIVE_WARNINGS,
  createLiveTraceSession,
  recordLiveWarning,
  reduceLiveTraceSession,
} from "./accumulator";
import { validateLiveEndpoint } from "./transport";
import type { LiveTransportMessage, LiveTraceMessage } from "./types";

const start: LiveTransportMessage = {
  eventType: "trace.start",
  transportId: "1",
  data: JSON.stringify({ run_id: "run-live", name: "Live Agent", started_at: "2026-09-06T10:00:00.000Z" }),
};

function event(id: string, timestamp: string, transportId = id): LiveTransportMessage {
  return {
    eventType: "trace.event",
    transportId,
    data: JSON.stringify({ run_id: "run-live", event: { id, type: "tool.completed", timestamp, metadata: { output: "ok" } } }),
  };
}

function parse(input: LiveTransportMessage): LiveTraceMessage {
  const result = parseLiveMessage(input);
  if (!result.ok) throw new Error(result.error.message);
  return result.message;
}

describe("live SSE protocol", () => {
  it.each([
    [start, "trace.start"],
    [event("event-1", "2026-09-06T10:00:00.100Z"), "trace.event"],
    [{ eventType: "trace.end", data: JSON.stringify({ run_id: "run-live", status: "completed" }) }, "trace.end"],
  ] as const)("parses %s", (input, type) => expect(parseLiveMessage(input)).toEqual(expect.objectContaining({ ok: true, message: expect.objectContaining({ type }) })));

  it.each([
    [{ eventType: "trace.event", data: "{bad" }, "not valid JSON"],
    [{ eventType: "trace.event", data: JSON.stringify({ event: {} }) }, "run_id"],
    [{ eventType: "trace.event", data: JSON.stringify({ run_id: "run-live", event: { type: "tool.completed", timestamp: "bad" } }) }, "timestamp"],
    [{ eventType: "trace.end", data: JSON.stringify({ run_id: "run-live", status: "running" }) }, "completed"],
    [{ eventType: "unknown", data: "{}" }, "Unsupported"],
  ] as const)("rejects %s", (input, message) => {
    const result = parseLiveMessage(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain(message);
  });
});

describe("live trace accumulator", () => {
  it("initializes, appends, sorts out-of-order events, and finalizes", () => {
    let session = reduceLiveTraceSession(createLiveTraceSession(), parse(start));
    session = reduceLiveTraceSession(session, parse(event("event-late", "2026-09-06T10:00:00.300Z")));
    session = reduceLiveTraceSession(session, parse(event("event-early", "2026-09-06T10:00:00.100Z")));
    session = reduceLiveTraceSession(session, parse({ eventType: "trace.end", transportId: "4", data: JSON.stringify({ run_id: "run-live", status: "completed", completed_at: "2026-09-06T10:00:00.400Z" }) }));
    expect(session.trace?.events.map((item) => item.id)).toEqual(["event-early", "event-late"]);
    expect(session.trace?.status).toBe("completed");
    expect(session.phase).toBe("ended");
    expect(session.trace?.totalDurationMs).toBe(400);
  });

  it("drops duplicate transport and event IDs without double-counting", () => {
    let session = reduceLiveTraceSession(createLiveTraceSession(), parse(start));
    session = reduceLiveTraceSession(session, parse(event("same-event", "2026-09-06T10:00:00.100Z", "2")));
    session = reduceLiveTraceSession(session, parse(event("different-event", "2026-09-06T10:00:00.110Z", "2")));
    session = reduceLiveTraceSession(session, parse(event("same-event", "2026-09-06T10:00:00.100Z", "3")));
    expect(session.trace?.events).toHaveLength(1);
    expect(session.droppedMessages).toBe(2);
    expect(session.warnings).toHaveLength(2);
  });

  it("accepts an event before trace.start and rejects another run", () => {
    let session = reduceLiveTraceSession(createLiveTraceSession(), parse(event("first", "2026-09-06T10:00:00.100Z")));
    expect(session.runId).toBe("run-live");
    expect(session.trace?.events).toHaveLength(1);
    const wrongRun = parseLiveMessage({ eventType: "trace.event", data: JSON.stringify({ run_id: "other", event: { id: "wrong", type: "tool.completed", timestamp: "2026-09-06T10:00:00.200Z" } }) });
    if (!wrongRun.ok) throw new Error(wrongRun.error.message);
    session = reduceLiveTraceSession(session, wrongRun.message);
    expect(session.trace?.events).toHaveLength(1);
    expect(session.droppedMessages).toBe(1);
  });

  it("caps warnings without losing the drop count", () => {
    let session = createLiveTraceSession();
    for (let index = 0; index < MAX_LIVE_WARNINGS + 3; index += 1) {
      session = recordLiveWarning(session, { kind: "protocol", message: `warning-${index}` });
    }
    expect(session.warnings).toHaveLength(MAX_LIVE_WARNINGS);
    expect(session.droppedMessages).toBe(MAX_LIVE_WARNINGS + 3);
  });
});

describe("live endpoint validation", () => {
  it.each([
    ["javascript:alert(1)", "HTTP or HTTPS"],
    ["file:///tmp/trace", "HTTP or HTTPS"],
    ["https://user:pass@example.test/sse", "credentials"],
  ])("rejects unsafe endpoint %s", (value, message) => expect(validateLiveEndpoint(value)).toEqual({ ok: false, message: expect.stringContaining(message) }));

  it("accepts HTTP and HTTPS without credentials", () => {
    expect(validateLiveEndpoint(" https://example.test/trace ")).toEqual({ ok: true, url: "https://example.test/trace" });
  });
});
