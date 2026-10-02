import type { NormalizedTrace } from "../types";

export type LiveMessageType = "trace.start" | "trace.event" | "trace.end";

export interface LiveTransportMessage {
  eventType: string;
  data: string;
  transportId?: string;
}

export interface LiveRawEvent {
  [key: string]: unknown;
}

export interface LiveTraceStartMessage {
  type: "trace.start";
  runId: string;
  name?: string;
  startedAt?: string;
  transportId?: string;
}

export interface LiveTraceEventMessage {
  type: "trace.event";
  runId: string;
  event: LiveRawEvent;
  transportId?: string;
}

export interface LiveTraceEndMessage {
  type: "trace.end";
  runId: string;
  status: "completed" | "failed";
  completedAt?: string;
  transportId?: string;
}

export type LiveTraceMessage = LiveTraceStartMessage | LiveTraceEventMessage | LiveTraceEndMessage;

export type LiveMessageErrorCode =
  | "unsupported-event"
  | "invalid-json"
  | "invalid-root"
  | "invalid-run-id"
  | "invalid-start"
  | "invalid-event"
  | "invalid-end";

export interface LiveMessageError {
  code: LiveMessageErrorCode;
  message: string;
}

export type LiveMessageParseResult =
  | { ok: true; message: LiveTraceMessage }
  | { ok: false; error: LiveMessageError };

export type LiveTracePhase = "idle" | "connecting" | "live" | "reconnecting" | "ended" | "disconnected";

export type LiveTraceWarningKind = "protocol" | "duplicate" | "connection" | "validation";

export interface LiveTraceWarning {
  kind: LiveTraceWarningKind;
  message: string;
}

export interface LiveTraceSession {
  runId?: string;
  name?: string;
  startedAt?: string;
  completedAt?: string;
  status?: "running" | "completed" | "failed";
  started: boolean;
  phase: LiveTracePhase;
  trace?: NormalizedTrace;
  warnings: LiveTraceWarning[];
  receivedMessages: number;
  droppedMessages: number;
  seenTransportIds: string[];
  seenEventIds: string[];
  rawEvents: LiveRawEvent[];
}
