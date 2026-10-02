import type {
  LiveMessageErrorCode,
  LiveMessageParseResult,
  LiveRawEvent,
  LiveTransportMessage,
} from "./types";

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

type LiveParseFailure = Extract<LiveMessageParseResult, { ok: false }>;

function error(code: LiveMessageErrorCode, message: string): LiveParseFailure {
  return { ok: false, error: { code, message } };
}

function parseData(data: string): LiveParseFailure | { ok: true; value: RawRecord } {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return error("invalid-json", "SSE data is not valid JSON.");
  }
  if (!isRecord(value)) return error("invalid-root", "SSE data must be a JSON object.");
  return { ok: true, value };
}

function parseRunId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function parseLiveMessage(input: LiveTransportMessage): LiveMessageParseResult {
  if (!(["trace.start", "trace.event", "trace.end"] as string[]).includes(input.eventType)) {
    return error("unsupported-event", `Unsupported SSE event type '${input.eventType || "(empty)"}'.`);
  }

  const parsed = parseData(input.data);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const runId = parseRunId(value.run_id);
  if (!runId) return error("invalid-run-id", "SSE message requires a non-empty run_id.");

  if (input.eventType === "trace.start") {
    if (value.name !== undefined && typeof value.name !== "string") {
      return error("invalid-start", "trace.start name must be a string when provided.");
    }
    if (value.started_at !== undefined && !validTimestamp(value.started_at)) {
      return error("invalid-start", "trace.start started_at must be a valid timestamp when provided.");
    }
    return {
      ok: true,
      message: {
        type: "trace.start",
        runId,
        name: typeof value.name === "string" && value.name.trim() !== "" ? value.name : undefined,
        startedAt: typeof value.started_at === "string" ? value.started_at : undefined,
        transportId: input.transportId,
      },
    };
  }

  if (input.eventType === "trace.event") {
    if (!isRecord(value.event)) return error("invalid-event", "trace.event requires an event object.");
    const event = value.event as LiveRawEvent;
    if (typeof event.type !== "string" || event.type.trim() === "") {
      return error("invalid-event", "trace.event event.type is required.");
    }
    if (!validTimestamp(event.timestamp)) {
      return error("invalid-event", "trace.event event.timestamp must be a valid timestamp.");
    }
    return {
      ok: true,
      message: { type: "trace.event", runId, event, transportId: input.transportId },
    };
  }

  if (value.status !== "completed" && value.status !== "failed") {
    return error("invalid-end", "trace.end status must be 'completed' or 'failed'.");
  }
  if (value.completed_at !== undefined && !validTimestamp(value.completed_at)) {
    return error("invalid-end", "trace.end completed_at must be a valid timestamp when provided.");
  }
  return {
    ok: true,
    message: {
      type: "trace.end",
      runId,
      status: value.status,
      completedAt: typeof value.completed_at === "string" ? value.completed_at : undefined,
      transportId: input.transportId,
    },
  };
}
