import { normalizeTrace } from "./normalize";
import type { ParseResult, TraceValidationError, TraceWarning } from "./types";

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validTimestamp(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

function validateRoot(input: unknown): TraceValidationError[] {
  if (!isRecord(input)) return [{ path: "root", message: "Trace must be a JSON object." }];
  const errors: TraceValidationError[] = [];
  if (!Array.isArray(input.events)) errors.push({ path: "events", message: "Trace events must be an array." });
  if (input.started_at !== undefined && !validTimestamp(input.started_at)) {
    errors.push({ path: "started_at", message: "started_at must be a valid ISO timestamp." });
  }
  if (input.completed_at !== undefined && !validTimestamp(input.completed_at)) {
    errors.push({ path: "completed_at", message: "completed_at must be a valid ISO timestamp." });
  }
  if (Array.isArray(input.events)) {
    input.events.forEach((event, index) => {
      const path = `events[${index}]`;
      if (!isRecord(event)) {
        errors.push({ path, message: "Event must be a JSON object." });
        return;
      }
      if (typeof event.type !== "string" || event.type.trim() === "") {
        errors.push({ path: `${path}.type`, message: "Event type is required." });
      }
      if (!validTimestamp(event.timestamp)) {
        errors.push({ path: `${path}.timestamp`, message: "Event timestamp must be valid." });
      }
    });
  }
  return errors;
}

function collectWarnings(input: RawRecord): TraceWarning[] {
  const warnings: TraceWarning[] = [];
  if (input.run_id === undefined) warnings.push({ path: "run_id", message: "Missing run_id; using run-local." });
  if (input.status === undefined) warnings.push({ path: "status", message: "Missing status; using unknown." });
  if (!Array.isArray(input.events)) return warnings;

  input.events.forEach((event, index) => {
    if (!isRecord(event)) return;
    if (event.id === undefined || (typeof event.id === "string" && event.id.trim() === "")) {
      warnings.push({ path: `events[${index}].id`, message: `Missing id; using event-${index + 1}.` });
    }
    if (event.metadata !== undefined && !isRecord(event.metadata)) {
      warnings.push({ path: `events[${index}].metadata`, message: "Metadata is not an object; using empty metadata." });
    }
    if (event.duration_ms !== undefined && (typeof event.duration_ms !== "number" || !Number.isFinite(event.duration_ms) || event.duration_ms < 0)) {
      warnings.push({ path: `events[${index}].duration_ms`, message: "Duration must be a finite non-negative number; ignoring it." });
    }
  });
  return warnings;
}

export function parseTraceValue(input: unknown): ParseResult {
  const errors = validateRoot(input);
  if (errors.length > 0) return { ok: false, errors };
  const record = input as RawRecord;
  const warnings = collectWarnings(record);
  return { ok: true, trace: normalizeTrace(record, warnings), warnings };
}

export function parseTraceText(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, errors: [{ path: "json", message: "Invalid JSON. Check commas, quotes, and brackets." }] };
  }
  return parseTraceValue(value);
}
