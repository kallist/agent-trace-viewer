import { genericEventListAdapter } from "./generic";
import { nativeTraceAdapter } from "./native";
import { otelStyleJsonAdapter } from "./otel-style";
import type { AdaptedTraceResult, TraceAdapter } from "./types";

export const traceAdapters: readonly TraceAdapter[] = Object.freeze([
  otelStyleJsonAdapter,
  genericEventListAdapter,
  nativeTraceAdapter,
].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)));

export function adaptTrace(input: unknown, adapters: readonly TraceAdapter[] = traceAdapters): AdaptedTraceResult {
  const adapter = [...adapters].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)).find((candidate) => candidate.canHandle(input));
  if (!adapter) return { ok: false, errors: [{ path: "format", message: "Unsupported trace format. Supported formats: Native Trace, Generic Event List, and OTel-style JSON subset." }] };
  const result = adapter.convert(input);
  return result.ok
    ? { ...result, adapterId: adapter.id, adapterName: adapter.name }
    : { ...result, adapterId: adapter.id, adapterName: adapter.name };
}

export function adaptTraceText(text: string): AdaptedTraceResult {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return { ok: false, errors: [{ path: "json", message: "Invalid JSON. Check commas, quotes, and brackets." }] };
  }
  return adaptTrace(input);
}
