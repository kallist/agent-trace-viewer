import { parseTraceValue } from "../parser";
import type { TraceAdapter } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const nativeTraceAdapter: TraceAdapter = {
  id: "native",
  name: "Native Trace",
  priority: 20,
  canHandle(input) {
    if (!isRecord(input) || !Array.isArray(input.events)) return false;
    if (["run_id", "name", "status", "started_at", "completed_at"].some((key) => key in input)) return true;
    const nativeEventFields = new Set(["id", "type", "timestamp", "duration_ms", "metadata"]);
    return input.events.every((event) => isRecord(event) && Object.keys(event).every((key) => nativeEventFields.has(key)));
  },
  convert: parseTraceValue,
};
