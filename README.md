# Agent Trace Viewer V0.2

Agent Trace Viewer is a small, local-first browser tool for inspecting AI agent execution traces. It parses, normalizes, analyzes, and visualizes a trace; it does not execute agents or upload trace data.

## Features

- Load successful and failed demo traces.
- Paste or upload a JSON trace (up to 5 MB).
- View run summary, duration and token metrics, a timestamp-ordered timeline, event metadata, raw JSON, and failure signals.
- Keep the last valid trace visible when a new import is malformed.
- Classify common `run`, `llm`, `retrieval`/`rag`/`vector`, `tool`, and `memory` events; unknown types remain visible as `other`.
- Connect to a user-provided HTTP or HTTPS SSE endpoint and inspect one live run incrementally.
- Reuse the offline normalized trace, metrics, timeline, inspector, and failure summary while a stream is live.
- Surface connection lifecycle, malformed-message warnings, duplicate suppression, and stale-connection protection.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Production verification uses:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e
```

## Supported trace format

The required root field is `events`, an array of event objects. Each event requires `type` and a valid `timestamp`. `id`, `metadata`, `duration_ms`, `run_id`, `name`, `status`, `started_at`, and `completed_at` are supported optional fields. Unknown root and event fields are preserved in the raw JSON view.

```json
{
  "run_id": "run_001",
  "name": "Calculator Agent",
  "status": "completed",
  "started_at": "2026-09-05T10:00:00.000Z",
  "completed_at": "2026-09-05T10:00:01.610Z",
  "events": [
    { "type": "run.started", "timestamp": "2026-09-05T10:00:00.000Z" },
    {
      "type": "tool.completed",
      "timestamp": "2026-09-05T10:00:01.536Z",
      "duration_ms": 12,
      "metadata": { "tool": "calculator", "output": "5192" }
    }
  ]
}
```

Invalid timestamps and missing event types are validation errors. Missing IDs receive deterministic local IDs, duplicate IDs are renamed, invalid optional durations are ignored with a warning, and events are sorted by timestamp. When an explicit duration is absent, only an obvious same-operation `started` → `completed`/`failed` pair is used.

## Live Trace

Open **Live**, enter an SSE endpoint, and choose **Connect**. The browser supports this small V0.2 protocol:

```text
trace.start -> trace.event* -> trace.end
```

Each `trace.start` and `trace.end` message contains a `run_id`. Each `trace.event` message contains a `run_id` and one event in the offline trace format. A connection is bound to one run; malformed messages, mismatched run IDs, and duplicate SSE/event IDs are dropped with a visible warning. EventSource may reconnect after a network error, but **Disconnect**, **Clear**, and switching back to Offline invalidate old callbacks.

The browser only accepts `http:` and `https:` endpoints. URL credentials, authentication headers, API keys, telemetry, and trace persistence are not supported. The endpoint must allow CORS when it is on another origin.

The repository includes a deterministic test-only SSE fixture server for browser tests. It is not started by the production build and is not a production backend.

EventSource carries the last SSE ID forward when a later message omits `id:`. Transport deduplication therefore compares the ID and parsed message together; an identical replay is dropped, while a distinct message with an inherited ID is processed. Event IDs provide additional deduplication. If both IDs are absent, reliable deduplication is unavailable. Keep IDs stable and unique at the endpoint. A terminal EventSource error (for example, HTTP 404) shows Disconnected instead of waiting for a retry that will not occur.

Live traces and deduplication identities remain in tab memory until cleared or replaced. The viewer rebuilds normalization and metrics per event; unbounded streams and large traces are outside V0.2's tested limits. Stream warnings are capped at eight.

`withCredentials: false` disables cross-origin credential inclusion. Native EventSource can still send browser-managed same-origin cookies; V0.2 provides no login flow or credential controls.

## Architecture

```text
Offline JSON -> parser / validation -> normalized trace model -> metrics -> React UI
SSE -> transport -> live protocol parser -> live accumulator -> normalized trace model -> existing metrics / timeline / inspector
```

The domain code in `src/trace` does not depend on React. Metrics are pure functions. The timeline is HTML and CSS, with no charting dependency. There is no backend, database, telemetry, analytics, or persistence layer; live mode only opens the user-selected SSE connection.

## Privacy and limitations

Agent Trace Viewer processes imported traces locally in the browser. Live mode sends no trace data from the viewer; it only reads the endpoint selected by the user. JSON and event metadata are displayed as text produced by `JSON.stringify`; imported strings are never evaluated as code.

V0.2 does not support WebSocket, OpenTelemetry/OTLP, external provider adapters, authentication, cloud persistence, trace history, multi-run multiplexing, distributed traces, or agent execution.
