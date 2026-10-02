import { parseTraceValue } from "../parser";
import type { TraceAdapter } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const nativeTraceAdapter: TraceAdapter = {
  id: "native",
  name: "Native Trace",
  priority: 30,
  canHandle(input) {
    if (!isRecord(input) || !Array.isArray(input.events)) return false;
    return ["run_id", "name", "status", "started_at", "completed_at"].some((key) => key in input);
  },
  convert: parseTraceValue,
};
