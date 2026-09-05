import type { TraceCategory, TraceEventStatus } from "./types";

export function classifyEventType(type: string): TraceCategory {
  const prefix = type.toLowerCase().split(".")[0];

  if (prefix === "run") return "run";
  if (prefix === "llm") return "llm";
  if (["retrieval", "rag", "vector"].includes(prefix)) return "retrieval";
  if (prefix === "tool") return "tool";
  if (prefix === "memory") return "memory";
  return "other";
}

export function classifyEventStatus(type: string): TraceEventStatus {
  const suffix = type.toLowerCase().split(".").at(-1);

  if (suffix === "started") return "started";
  if (suffix === "failed" || suffix === "error") return "failed";
  if (["completed", "written", "retrieved"].includes(suffix ?? "")) return "completed";
  return "info";
}

export function logicalOperation(type: string): string {
  const segments = type.toLowerCase().split(".");
  return segments.length > 1 ? segments.slice(0, -1).join(".") : type.toLowerCase();
}
