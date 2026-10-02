import { parseTraceValue } from "../parser";
import type { TraceAdapter } from "./types";

type RecordValue = Record<string, unknown>;
function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(value: unknown): string | undefined {
  if (typeof value === "string") {
    if (/^\d{16,}$/.test(value)) {
      try { return new Date(Number(BigInt(value) / 1_000_000n)).toISOString(); } catch { return undefined; }
    }
    return Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    const millis = value > 1e15 ? value / 1e6 : value > 1e12 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }
  return undefined;
}

function attributeValue(value: unknown): unknown {
  if (!isRecord(value)) return value;
  for (const key of ["stringValue", "intValue", "doubleValue", "boolValue", "bytesValue"]) {
    if (key in value) return value[key];
  }
  return value;
}

function attributes(value: unknown, prefix = ""): Record<string, unknown> {
  if (!Array.isArray(value)) return {};
  const result: Record<string, unknown> = {};
  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== "string") continue;
    result[`${prefix}${item.key}`] = attributeValue(item.value);
  }
  return result;
}

function extractSpans(input: RecordValue): Array<{ span: RecordValue; resource: RecordValue }> | undefined {
  if (Array.isArray(input.spans)) return input.spans.every(isRecord) ? input.spans.map((span) => ({ span, resource: {} })) : undefined;
  if (!Array.isArray(input.resourceSpans)) return undefined;
  const output: Array<{ span: RecordValue; resource: RecordValue }> = [];
  for (const resourceSpan of input.resourceSpans) {
    if (!isRecord(resourceSpan)) return undefined;
    const resource = isRecord(resourceSpan.resource) ? attributes(resourceSpan.resource.attributes, "resource.") : {};
    const scopeGroups = Array.isArray(resourceSpan.scopeSpans) ? resourceSpan.scopeSpans : Array.isArray(resourceSpan.instrumentationLibrarySpans) ? resourceSpan.instrumentationLibrarySpans : undefined;
    if (!scopeGroups) return undefined;
    for (const scopeGroup of scopeGroups) {
      if (!isRecord(scopeGroup) || !Array.isArray(scopeGroup.spans)) return undefined;
      for (const span of scopeGroup.spans) {
        if (!isRecord(span)) return undefined;
        output.push({ span, resource });
      }
    }
  }
  return output;
}

function spanType(span: RecordValue, failed: boolean): string {
  const spanName = typeof span.name === "string" && span.name.trim() ? span.name : "span";
  const semanticType = attributes(span.attributes)["agent.event.type"];
  const candidate = typeof semanticType === "string" && semanticType.trim() ? semanticType : spanName;
  const suffix = failed ? "failed" : "completed";
  if (/\.(started|completed|failed|error)$/i.test(candidate)) {
    return failed
      ? candidate.replace(/\.(started|completed|error)$/i, ".failed")
      : candidate.replace(/\.(started|error)$/i, ".completed");
  }
  if (/^(run|llm|retrieval|rag|vector|tool|memory)\./i.test(candidate)) return `${candidate}.${suffix}`;
  return `span.${suffix}`;
}

export const otelStyleJsonAdapter: TraceAdapter = {
  id: "otel-style-json",
  name: "OTel-style JSON subset",
  priority: 10,
  canHandle(input) { return isRecord(input) && (Array.isArray(input.resourceSpans) || Array.isArray(input.spans)); },
  convert(input) {
    if (!isRecord(input)) return parseTraceValue(input);
    const groups = extractSpans(input);
    if (!groups) return { ok: false, errors: [{ path: "resourceSpans", message: "OTel-style input must contain spans or resourceSpans with scopeSpans[].spans[]." }] };
    const traceIds = [...new Set(groups.map(({ span }) => span.traceId).filter((id): id is string => typeof id === "string" && id.length > 0))];
    if (traceIds.length > 1) return { ok: false, errors: [{ path: "resourceSpans", message: "This OTel-style subset accepts one trace per import." }] };
    const spanTimes: Array<{ start: string; end?: string }> = [];
    const events = groups.map(({ span, resource }, index) => {
      const start = timestamp(span.startTimeUnixNano ?? span.start_time ?? span.startTime);
      const end = timestamp(span.endTimeUnixNano ?? span.end_time ?? span.endTime);
      if (start) spanTimes.push({ start, end });
      const spanAttributes = attributes(span.attributes);
      const code = isRecord(span.status) ? span.status.code : undefined;
      const failed = code === 2 || code === "ERROR";
      const metadata = {
        ...resource,
        ...spanAttributes,
        span_name: typeof span.name === "string" ? span.name : "span",
        ...(typeof span.traceId === "string" ? { trace_id: span.traceId } : {}),
        ...(typeof span.spanId === "string" ? { span_id: span.spanId } : {}),
        ...(typeof span.parentSpanId === "string" ? { parent_span_id: span.parentSpanId } : {}),
      };
      return {
        id: typeof span.spanId === "string" ? span.spanId : `span-${index + 1}`,
        type: spanType(span, failed),
        timestamp: start ?? "invalid-timestamp",
        ...(start && end ? { duration_ms: Math.max(0, Date.parse(end) - Date.parse(start)) } : {}),
        metadata,
      };
    });
    const starts = spanTimes.map((item) => Date.parse(item.start)).filter(Number.isFinite);
    const ends = spanTimes.map((item) => Date.parse(item.end ?? item.start)).filter(Number.isFinite);
    const result = parseTraceValue({
      run_id: traceIds.length === 1 ? traceIds[0] : "otel-style-run",
      name: typeof input.name === "string" ? input.name : "OTel-style trace",
      status: input.status,
      ...(starts.length > 0 ? { started_at: new Date(Math.min(...starts)).toISOString(), completed_at: new Date(Math.max(...ends)).toISOString() } : {}),
      events,
    });
    return result;
  },
};
