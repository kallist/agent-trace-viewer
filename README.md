# Agent Trace Viewer

Agent Trace Viewer is a small, local-first browser tool for inspecting AI agent execution traces. It parses, normalizes, analyzes, and visualizes a trace; it does not execute agents or upload trace data.

## Features

- Load successful and failed demo traces.
- Paste or upload a JSON trace (up to 5 MB).
- View run summary, duration and token metrics, a timestamp-ordered timeline, event metadata, raw JSON, and failure signals.
- Keep the last valid trace visible when a new import is malformed.
- Classify common `run`, `llm`, `retrieval`/`rag`/`vector`, `tool`, and `memory` events; unknown types remain visible as `other`.

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

## Architecture

```text
Raw JSON → parser / validation → normalized trace model → metrics → React UI
```

The domain code in `src/trace` does not depend on React. Metrics are pure functions. The timeline is HTML and CSS, with no charting dependency. There is no backend, database, network API, telemetry, analytics, or persistence layer.

## Privacy and limitations

Agent Trace Viewer V0.1 processes imported traces locally in the browser. It does not send trace content to a server or third party. JSON is displayed as text produced by `JSON.stringify`; imported strings are never evaluated as code.

V0.1 does not support real-time ingestion, OpenTelemetry, external provider adapters, cloud persistence, distributed traces, or agent execution. Future versions may consider adapters, live trace streams, and OpenTelemetry import.
