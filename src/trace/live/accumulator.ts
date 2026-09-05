import { parseTraceValue } from "../parser";
import type {
  LiveRawEvent,
  LiveTraceMessage,
  LiveTraceSession,
  LiveTraceWarning,
} from "./types";

export const MAX_LIVE_WARNINGS = 8;

function warning(kind: LiveTraceWarning["kind"], message: string): LiveTraceWarning {
  return { kind, message };
}

export function createLiveTraceSession(): LiveTraceSession {
  return {
    started: false,
    phase: "idle",
    warnings: [],
    receivedMessages: 0,
    droppedMessages: 0,
    seenTransportIds: [],
    seenEventIds: [],
    rawEvents: [],
  };
}

function addWarning(session: LiveTraceSession, nextWarning: LiveTraceWarning, dropped = false): LiveTraceSession {
  const warnings = session.warnings.length < MAX_LIVE_WARNINGS
    ? [...session.warnings, nextWarning]
    : session.warnings;
  return {
    ...session,
    warnings,
    droppedMessages: session.droppedMessages + (dropped ? 1 : 0),
  };
}

export function recordLiveWarning(session: LiveTraceSession, nextWarning: LiveTraceWarning, dropped = true): LiveTraceSession {
  return addWarning(session, nextWarning, dropped);
}

function rebuildTrace(session: LiveTraceSession, rawEvents: LiveRawEvent[]): LiveTraceSession {
  if (!session.runId) return { ...session, rawEvents };
  const root: Record<string, unknown> = {
    run_id: session.runId,
    status: session.status ?? "running",
    events: rawEvents,
  };
  if (session.name) root.name = session.name;
  if (session.startedAt) root.started_at = session.startedAt;
  if (session.completedAt) root.completed_at = session.completedAt;
  const parsed = parseTraceValue(root);
  if (!parsed.ok) return { ...session, rawEvents };
  return { ...session, rawEvents, trace: parsed.trace };
}

function reject(session: LiveTraceSession, message: string, kind: LiveTraceWarning["kind"] = "protocol"): LiveTraceSession {
  return addWarning(session, warning(kind, message), true);
}

function checkTransportId(session: LiveTraceSession, transportId: string | undefined): LiveTraceSession | null {
  if (!transportId) return session;
  if (session.seenTransportIds.includes(transportId)) return null;
  return { ...session, seenTransportIds: [...session.seenTransportIds, transportId] };
}

function withRun(session: LiveTraceSession, runId: string, startedAt?: string, name?: string): LiveTraceSession {
  if (!session.runId) {
    return {
      ...session,
      runId,
      name: name ?? session.name,
      startedAt: startedAt ?? session.startedAt,
      status: "running",
    };
  }
  return session;
}

export function reduceLiveTraceSession(session: LiveTraceSession, message: LiveTraceMessage): LiveTraceSession {
  if (session.phase === "ended" || session.phase === "disconnected") {
    return reject(session, "Message received after the live session ended.");
  }

  const transportChecked = checkTransportId(session, message.transportId);
  if (!transportChecked) return reject(session, "Duplicate SSE message dropped.", "duplicate");
  let next = transportChecked;

  if (next.runId && next.runId !== message.runId) {
    return reject(next, `Message for run '${message.runId}' dropped; this session is already bound to '${next.runId}'.`);
  }
  next = withRun(next, message.runId);

  if (message.type === "trace.start") {
    if (next.started) return reject(next, "Duplicate trace.start message dropped.", "duplicate");
    next = {
      ...next,
      started: true,
      name: message.name ?? next.name,
      startedAt: message.startedAt ?? next.startedAt,
      status: "running",
      phase: "live",
      receivedMessages: next.receivedMessages + 1,
    };
    return rebuildTrace(next, next.rawEvents);
  }

  if (message.type === "trace.event") {
    const eventId = typeof message.event.id === "string" && message.event.id.trim() !== ""
      ? message.event.id
      : undefined;
    if (eventId && next.seenEventIds.includes(eventId)) {
      return reject(next, `Duplicate event '${eventId}' dropped.`, "duplicate");
    }
    const seenEventIds = eventId ? [...next.seenEventIds, eventId] : next.seenEventIds;
    const withoutIds = !eventId && !message.transportId;
    next = {
      ...next,
      startedAt: next.startedAt ?? message.event.timestamp as string,
      phase: "live",
      receivedMessages: next.receivedMessages + 1,
      seenEventIds,
      rawEvents: [...next.rawEvents, message.event],
    };
    if (withoutIds) next = addWarning(next, warning("validation", "Event has no SSE id or event.id; duplicate delivery cannot be detected."), false);
    return rebuildTrace(next, next.rawEvents);
  }

  next = {
    ...next,
    completedAt: message.completedAt,
    phase: "ended",
    receivedMessages: next.receivedMessages + 1,
    status: message.status,
  };
  return rebuildTrace(next, next.rawEvents);
}

export function liveMessageParseWarning(message: string): LiveTraceWarning {
  return warning("protocol", message);
}
