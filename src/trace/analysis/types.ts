export type InsightSeverity = "info" | "notice" | "warning";
export type InsightType = "dominant-category" | "slowest-event" | "repeated-tool" | "failure-hotspot" | "retrieval-heavy" | "missing-duration";

export interface TraceInsight {
  id: string;
  severity: InsightSeverity;
  type: InsightType;
  title: string;
  evidence: string;
  eventIds?: string[];
}
