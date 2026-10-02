# Agent Trace Viewer

Agent Trace Viewer is a local-first observability workbench for replaying, comparing, and diagnosing AI agent traces.

Agent runs are difficult to understand from raw logs. This browser tool turns an imported trace or an explicitly selected live SSE stream into a normalized timeline, replayable run, factual comparison, and evidence-based latency observations. It does not execute agents or upload imported traces.

## Features

- **Observe:** inspect normalized events, metrics, failures, metadata, and raw JSON.
- **Live SSE:** connect to one user-provided HTTP/HTTPS endpoint and inspect a run as it arrives.
- **Replay Theater:** seek, step through timestamp boundaries, pause, and play at 0.5×, 1×, 2×, or 4×. Replay advances a virtual clock; it never reruns an agent.
- **Run Compare:** compare two completed traces and show measured duration, stage, call, failure, and token deltas. Deltas are Run B − Run A and do not choose a winner.
- **Bottleneck Lens:** deterministic observations about measured stage latency and event evidence. This is a heuristic, not an AI diagnosis or confirmed root cause.
- **Adapter Registry:** import Native Trace, Generic Event List, and a documented OTel-style JSON subset.
- **Demo Scenarios:** load a RAG workflow, a tool failure with fallback, or a latency-heavy run. The latency pair is also available in Compare.

## 60-second Demo

1. In **Observe**, choose **Load scenario** under **RAG Agent**.
2. Open **Replay**, press **Play**, or seek to the tool event and inspect its input and output.
3. Use **Step backward/forward** and change playback speed.
4. Open **Compare** and review **Before Optimization** versus **After Optimization**.
5. Return to **Observe**, load **Latency Heavy Run**, and inspect the measured evidence in **Bottleneck Lens**.
6. Optionally upload `src/fixtures/generic-event-list.json` or `src/fixtures/otel-style-trace.json` to see adapter detection.

## Quick Start

Requires a Node.js version supported by the project dependencies (Node 22 or 24+).

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. Quality checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e
```

## Trace Model

The application works with one `NormalizedTrace`: run identity and status, start/completion times, total duration, timestamp-ordered events, event categories and statuses, optional measured durations, metadata, and preserved raw input. Adapters convert supported input shapes into this model. Replay frames, comparisons, metrics, the timeline, the inspector, and the Lens all derive from it.

The Native Trace format uses an `events` array. Each event requires a non-empty `type` and valid `timestamp`; optional fields include `id`, `duration_ms`, and object `metadata`. Run fields such as `run_id`, `name`, `status`, `started_at`, and `completed_at` are optional. If an events-only document contains only Native Trace event fields, it is classified as Native; generic extra event fields such as top-level `tool` or `output` select Generic Event List. The parser preserves unknown fields in raw JSON and reports malformed inputs as structured validation errors.

## Live SSE Protocol

Live mode accepts one `trace.start`, zero or more `trace.event`, then `trace.end` messages. Each message identifies a `run_id`; `trace.event` carries one Native Trace event. Malformed or mismatched messages are isolated and reported. Disconnect, clear, mode changes, and unmount invalidate stale callbacks. The browser EventSource transport accepts credential-free HTTP/HTTPS endpoint URLs and sets `withCredentials: false`.

Cross-origin endpoints must allow browser CORS. EventSource may still send browser-managed same-origin cookies. There is no login, API-key field, custom authorization header, or authentication implementation.

## Replay

Replay derives `visibleEvents` from `event.elapsedMs <= cursorMs`, then builds a partial normalized trace and reuses the existing metrics, timeline, and inspector. Identical trace and cursor inputs produce the same frame. Play uses a virtual cursor advanced by animation-frame deltas; speed changes affect the cursor rate. Seek clamps to the run bounds, and stepping moves between unique event-time boundaries. Selecting an event and seeking it out of view clears the selection. Replaying an ended trace restarts from zero.

## Compare

Compare accepts completed or failed normalized runs. The current trace appears as an option only after it is terminal; an active Live trace is excluded. Stage durations, counts, failures, and available token totals are computed in the domain layer. Numeric deltas are `B − A`; the percentage uses A as its baseline. When A is zero and B is non-zero, the percentage is unavailable and shown as `—` rather than `NaN` or infinity. Missing token measurements remain unavailable rather than being invented as zero.

## Bottleneck Lens

The Lens reports observed facts only:

- Largest measured latency category when a category accounts for at least 60% of measured stage duration.
- Slowest event with a duration measurement.
- Repeated tool names observed at least three times.
- Failed-event counts and retrieval share when retrieval is at least 40% of measured stage duration.
- Events without duration measurements.

Thresholds live in `src/trace/analysis/bottlenecks.ts`. Missing durations are excluded from measured totals, never treated as zero. Findings do not claim root cause or recommend an unverified fix.

## Adapters

| Adapter | Accepted input | Notes |
|---|---|---|
| Native Trace | Agent Trace Viewer `events` schema | Uses the existing parser and validation. |
| Generic Event List | `{ "events": [{ "type": "...", "timestamp": "..." }] }` | Additional event fields become metadata. |
| OTel-style JSON subset | `spans[]` or `resourceSpans[].scopeSpans[].spans[]` | Reads span name/IDs, scalar attributes, start/end times, and error status for one trace. |

OTel-style JSON import is not full OTLP support and does not include an OpenTelemetry Collector or SDK. Multiple trace IDs in one import are rejected rather than combined.

### Build an Adapter

An adapter recognizes a data shape and returns the shared parser's result. Conversion works on JSON data only; it never executes payload content.

```ts
import { parseTraceValue } from "../parser";
import type { TraceAdapter } from "./types";

export const agentStudioAdapter: TraceAdapter = {
  id: "agent-studio",
  name: "Agent Studio Trace",
  priority: 15,
  canHandle(input) {
    return typeof input === "object" && input !== null && "agent_events" in input;
  },
  convert(input) {
    if (typeof input !== "object" || input === null) return parseTraceValue(input);
    const source = input as { agent_events?: unknown[]; run_id?: string };
    const events = (source.agent_events ?? []).filter(
      (event): event is Record<string, unknown> => typeof event === "object" && event !== null && !Array.isArray(event),
    );
    return parseTraceValue({ run_id: source.run_id, events });
  },
};
```

Register a new adapter in `src/trace/adapters/registry.ts` with an explicit priority and add conversion and detection tests. Future formats can follow this boundary without changing downstream trace views.

## Security and Privacy

- Imported trace data, adapter attributes, and raw payloads remain in browser memory and are rendered as text.
- There is no backend, database, cloud upload, analytics, telemetry, or remote logging.
- Live mode opens only the endpoint the user enters; the viewer does not upload the trace elsewhere.
- URL credentials and non-HTTP protocols are rejected. No arbitrary-code evaluation or unsafe HTML rendering is used.

## Architecture

See [docs/architecture.md](docs/architecture.md) for boundaries and data flow.

## Testing

Vitest covers parser compatibility, Live lifecycle, adapters, deterministic replay frames, comparison math, heuristic boundaries, and UI integration. Playwright covers offline and Live flows plus Replay, Compare, the Lens, Generic/OTel-style imports, and stale-import protection. Hosted CI runs dependency installation, lint, typecheck, tests, build, and Chromium E2E.

## Limitations and Roadmap

Imports are limited to 5 MB. The OTel-style adapter supports the subset documented above, not full OTLP. Large/unbounded Live streams and traces at extreme scale have not been performance-certified. Refreshing the browser tab clears in-memory traces and compare state.

Future work, if separately approved, could add more framework adapters, expand the supported OTel JSON subset, or offer optional local persistence. This release does not include those capabilities.
