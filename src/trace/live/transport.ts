import type { LiveTransportMessage } from "./types";

export interface LiveTraceHandlers {
  onOpen: () => void;
  onMessage: (message: LiveTransportMessage) => void;
  onError: () => void;
}

export interface LiveTraceConnection {
  close: () => void;
}

export interface LiveTraceTransport {
  connect: (url: string, handlers: LiveTraceHandlers) => LiveTraceConnection;
}

export type LiveEndpointValidation =
  | { ok: true; url: string }
  | { ok: false; message: string };

export function validateLiveEndpoint(value: string): LiveEndpointValidation {
  if (value.trim() === "") return { ok: false, message: "Enter an SSE endpoint URL." };
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return { ok: false, message: "Enter a valid HTTP or HTTPS URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, message: "SSE endpoints must use HTTP or HTTPS." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, message: "SSE endpoint credentials are not supported." };
  }
  return { ok: true, url: parsed.toString() };
}

function dispatchMessage(handlers: LiveTraceHandlers, eventType: string, event: Event): void {
  const message = event as MessageEvent<string>;
  handlers.onMessage({
    eventType,
    data: typeof message.data === "string" ? message.data : "",
    transportId: message.lastEventId || undefined,
  });
}

export class EventSourceLiveTraceTransport implements LiveTraceTransport {
  connect(url: string, handlers: LiveTraceHandlers): LiveTraceConnection {
    const source = new EventSource(url, { withCredentials: false });
    let closed = false;
    source.onopen = () => {
      if (!closed) handlers.onOpen();
    };
    source.onmessage = (event) => {
      if (!closed) dispatchMessage(handlers, "message", event);
    };
    for (const eventType of ["trace.start", "trace.event", "trace.end"]) {
      source.addEventListener(eventType, (event) => {
        if (!closed) dispatchMessage(handlers, eventType, event);
      });
    }
    source.onerror = () => {
      if (!closed) handlers.onError();
    };
    return {
      close: () => {
        if (closed) return;
        closed = true;
        source.close();
      },
    };
  }
}
