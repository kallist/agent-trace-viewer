import { classifyEventStatus, classifyEventType, logicalOperation } from "./classify";
import { calculateRunDuration, safeDuration } from "./duration";
import type { NormalizedTrace, TraceWarning } from "./types";

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function normalizeTrace(input: RawRecord, warnings: TraceWarning[] = []): NormalizedTrace {
  const rawEvents = Array.isArray(input.events) ? input.events : [];
  const indexedEvents = rawEvents
    .map((raw, index) => ({ raw, index }))
    .filter((item): item is { raw: RawRecord; index: number } => isRecord(item.raw));

  const rootStartedAtMs = optionalTimestamp(input.started_at);
  const rootCompletedAtMs = optionalTimestamp(input.completed_at);
  const eventTimes = indexedEvents
    .map(({ raw }) => optionalTimestamp(raw.timestamp))
    .filter((timestamp): timestamp is number => timestamp !== undefined);
  const firstEventMs = eventTimes.length > 0 ? Math.min(...eventTimes) : undefined;
  const lastEventMs = eventTimes.length > 0 ? Math.max(...eventTimes) : undefined;
  const startedAtMs = rootStartedAtMs ?? firstEventMs ?? 0;

  const duplicateCounts = new Map<string, number>();
  const sorted = [...indexedEvents].sort((left, right) => {
    const leftTimestamp = optionalTimestamp(left.raw.timestamp) ?? 0;
    const rightTimestamp = optionalTimestamp(right.raw.timestamp) ?? 0;
    return leftTimestamp - rightTimestamp || left.index - right.index;
  });

  const events = sorted.map(({ raw, index }) => {
    const timestamp = raw.timestamp as string;
    const timestampMs = optionalTimestamp(timestamp) ?? startedAtMs;
    const requestedId = typeof raw.id === "string" && raw.id.trim() !== "" ? raw.id : `event-${index + 1}`;
    const seen = duplicateCounts.get(requestedId) ?? 0;
    duplicateCounts.set(requestedId, seen + 1);
    const id = seen === 0 ? requestedId : `${requestedId}-${seen + 1}`;
    if (seen > 0) {
      warnings.push({ path: `events[${index}].id`, message: `Duplicate id '${requestedId}' renamed to '${id}'.` });
    }

    const type = typeof raw.type === "string" ? raw.type : "unknown";
    const category = classifyEventType(type);
    const status = classifyEventStatus(type);
    const explicitDuration = safeDuration(raw.duration_ms);
    return {
      id,
      type,
      category,
      status,
      timestamp,
      timestampMs,
      durationMs: explicitDuration,
      elapsedMs: Math.max(0, timestampMs - startedAtMs),
      metadata: isRecord(raw.metadata) ? raw.metadata : {},
      raw,
    };
  });

  const openStarts = new Map<string, number[]>();
  for (const [index, event] of events.entries()) {
    const operation = `${event.category}:${logicalOperation(event.type)}`;
    if (event.status === "started") {
      const starts = openStarts.get(operation) ?? [];
      starts.push(index);
      openStarts.set(operation, starts);
      continue;
    }
    if (event.durationMs !== undefined || (event.status !== "completed" && event.status !== "failed")) continue;
    const starts = openStarts.get(operation);
    const startIndex = starts?.shift();
    if (startIndex !== undefined) {
      const pairedDuration = Math.max(0, event.timestampMs - events[startIndex].timestampMs);
      events[index].durationMs = pairedDuration;
    }
  }

  const status = input.status === "completed" || input.status === "failed" || input.status === "running"
    ? input.status
    : "unknown";
  const totalDurationMs = calculateRunDuration(startedAtMs, rootCompletedAtMs, firstEventMs, lastEventMs);

  return {
    runId: typeof input.run_id === "string" && input.run_id.trim() !== "" ? input.run_id : "run-local",
    name: typeof input.name === "string" && input.name.trim() !== "" ? input.name : undefined,
    status,
    startedAtMs,
    completedAtMs: rootCompletedAtMs,
    totalDurationMs,
    events,
    raw: input,
  };
}
