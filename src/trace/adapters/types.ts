import type { ParseResult } from "../types";

export interface TraceAdapter {
  id: string;
  name: string;
  priority: number;
  canHandle(input: unknown): boolean;
  convert(input: unknown): ParseResult;
}

export type AdaptedTraceResult =
  | { ok: true; trace: Extract<ParseResult, { ok: true }>["trace"]; warnings: Extract<ParseResult, { ok: true }>["warnings"]; adapterId: string; adapterName: string }
  | { ok: false; errors: Extract<ParseResult, { ok: false }>["errors"]; adapterId?: string; adapterName?: string };
