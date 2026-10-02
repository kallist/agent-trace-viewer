import { parseTraceValue } from "../parser";
import type { TraceAdapter } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const genericEventListAdapter: TraceAdapter = {
  id: "generic-event-list",
  name: "Generic Event List",
  priority: 30,
  canHandle(input) {
    return isRecord(input) && Array.isArray(input.events) && !["run_id", "name", "status", "started_at", "completed_at"].some((key) => key in input);
  },
  convert(input) {
    if (!isRecord(input) || !Array.isArray(input.events)) return parseTraceValue(input);
    const events = input.events.map((event) => {
      if (!isRecord(event)) return event;
      const metadata: Record<string, unknown> = Object.assign(Object.create(null), isRecord(event.metadata) ? event.metadata : {});
      for (const [key, value] of Object.entries(event)) {
        if (!["id", "type", "timestamp", "duration_ms", "metadata"].includes(key)) metadata[key] = value;
      }
      return { id: event.id, type: event.type, timestamp: event.timestamp, duration_ms: event.duration_ms, metadata };
    });
    return parseTraceValue({
      run_id: typeof input.run_id === "string" ? input.run_id : "generic-run",
      name: typeof input.name === "string" ? input.name : "Generic Event List",
      status: input.status,
      started_at: input.started_at,
      completed_at: input.completed_at,
      events,
    });
  },
};
