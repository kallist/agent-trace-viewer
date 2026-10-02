import { useEffect, useRef, useState } from "react";
import {
  createLiveTraceSession,
  liveMessageParseWarning,
  recordLiveWarning,
  reduceLiveTraceSession,
} from "../trace/live/accumulator";
import { parseLiveMessage } from "../trace/live/protocol";
import { EventSourceLiveTraceTransport, validateLiveEndpoint } from "../trace/live/transport";
import type { LiveTraceConnection, LiveTraceTransport } from "../trace/live/transport";
import type { LiveTraceSession } from "../trace/live/types";

const defaultTransport = new EventSourceLiveTraceTransport();

export interface LiveTraceController {
  session: LiveTraceSession;
  endpointError: string | null;
  connect: (endpoint: string) => void;
  disconnect: () => void;
  clear: () => void;
}

export default function useLiveTrace(transport: LiveTraceTransport = defaultTransport): LiveTraceController {
  const [session, setSession] = useState<LiveTraceSession>(() => createLiveTraceSession());
  const sessionRef = useRef(session);
  const connectionRef = useRef<LiveTraceConnection | null>(null);
  const generationRef = useRef(0);
  const [endpointError, setEndpointError] = useState<string | null>(null);

  function closeConnection(): void {
    connectionRef.current?.close();
    connectionRef.current = null;
  }

  function commit(next: LiveTraceSession): void {
    sessionRef.current = next;
    setSession(next);
  }

  function connect(endpoint: string): void {
    const validation = validateLiveEndpoint(endpoint);
    if (!validation.ok) {
      setEndpointError(validation.message);
      return;
    }
    setEndpointError(null);
    generationRef.current += 1;
    const generation = generationRef.current;
    closeConnection();
    const connecting: LiveTraceSession = { ...createLiveTraceSession(), phase: "connecting" };
    commit(connecting);
    try {
      const connection = transport.connect(validation.url, {
        onOpen: () => {
          if (generation !== generationRef.current) return;
          commit({ ...sessionRef.current, phase: "live" });
        },
        onMessage: (transportMessage) => {
          if (generation !== generationRef.current) return;
          const parsed = parseLiveMessage(transportMessage);
          if (!parsed.ok) {
            commit(recordLiveWarning(sessionRef.current, liveMessageParseWarning(parsed.error.message)));
            return;
          }
          const next = reduceLiveTraceSession(sessionRef.current, parsed.message);
          commit(next);
          if (next.phase === "ended") {
            closeConnection();
          }
        },
        onError: ({ retrying }) => {
          if (generation !== generationRef.current) return;
          const current = sessionRef.current;
          if (current.phase === "ended" || current.phase === "disconnected") return;
          if (!retrying) {
            generationRef.current += 1;
            closeConnection();
            commit(recordLiveWarning({ ...current, phase: "disconnected" }, { kind: "connection", message: "SSE connection closed; check the endpoint and CORS, then connect again." }, false));
            return;
          }
          const next = current.phase === "reconnecting"
            ? { ...current, phase: "reconnecting" as const }
            : recordLiveWarning({ ...current, phase: "reconnecting" }, { kind: "connection", message: "SSE connection lost; waiting for EventSource to reconnect." }, false);
          commit(next);
        },
      });
      if (generation !== generationRef.current || sessionRef.current.phase === "ended") connection.close();
      else connectionRef.current = connection;
    } catch {
      if (generation === generationRef.current) {
        commit(recordLiveWarning({ ...sessionRef.current, phase: "disconnected" }, { kind: "connection", message: "SSE connection could not be opened." }));
      }
    }
  }

  function disconnect(): void {
    generationRef.current += 1;
    closeConnection();
    commit({ ...sessionRef.current, phase: "disconnected" });
  }

  function clear(): void {
    generationRef.current += 1;
    closeConnection();
    setEndpointError(null);
    commit(createLiveTraceSession());
  }

  useEffect(() => () => {
    generationRef.current += 1;
    closeConnection();
  }, []);

  return { session, endpointError, connect, disconnect, clear };
}
