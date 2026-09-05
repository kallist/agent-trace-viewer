/* global process, setTimeout, clearTimeout, URL */

import http from "node:http";

const port = Number(process.env.SSE_FIXTURE_PORT ?? 4174);
const origin = process.env.SSE_FIXTURE_ORIGIN ?? "http://127.0.0.1:4173";

const event = (eventType, id, data) => ({ eventType, id, data: JSON.stringify(data) });

const successEvents = [
  event("trace.start", "1", { run_id: "run_live_001", name: "Live Calculator Agent", started_at: "2026-09-06T10:00:00.000Z" }),
  event("trace.event", "2", { run_id: "run_live_001", event: { id: "live-run-start", type: "run.started", timestamp: "2026-09-06T10:00:00.000Z" } }),
  event("trace.event", "3", { run_id: "run_live_001", event: { id: "live-retrieval-start", type: "retrieval.started", timestamp: "2026-09-06T10:00:00.090Z" } }),
  event("trace.event", "4", { run_id: "run_live_001", event: { id: "live-retrieval-end", type: "retrieval.completed", timestamp: "2026-09-06T10:00:00.176Z", duration_ms: 86 } }),
  event("trace.event", "5", { run_id: "run_live_001", event: { id: "live-llm-start", type: "llm.started", timestamp: "2026-09-06T10:00:00.190Z" } }),
  event("trace.event", "6", { run_id: "run_live_001", event: { id: "live-llm-end", type: "llm.completed", timestamp: "2026-09-06T10:00:01.610Z", duration_ms: 1420, metadata: { input_tokens: 1200, output_tokens: 180, total_tokens: 1380 } } }),
  event("trace.event", "7", { run_id: "run_live_001", event: { id: "live-tool-start", type: "tool.started", timestamp: "2026-09-06T10:00:01.620Z", metadata: { tool: "calculator" } } }),
  event("trace.event", "8", { run_id: "run_live_001", event: { id: "live-tool-end", type: "tool.completed", timestamp: "2026-09-06T10:00:01.632Z", duration_ms: 12, metadata: { tool: "calculator", output: "5192" } } }),
  event("trace.event", "9", { run_id: "run_live_001", event: { id: "live-memory", type: "memory.written", timestamp: "2026-09-06T10:00:01.663Z", duration_ms: 31 } }),
  event("trace.event", "10", { run_id: "run_live_001", event: { id: "live-run-end", type: "run.completed", timestamp: "2026-09-06T10:00:01.694Z" } }),
  event("trace.end", "11", { run_id: "run_live_001", status: "completed", completed_at: "2026-09-06T10:00:01.694Z" }),
];

const malformedEvents = [
  successEvents[0],
  successEvents[1],
  { eventType: "trace.event", id: "malformed", data: "{not valid json" },
  event("trace.event", "3", { run_id: "run_live_001", event: { id: "after-malformed", type: "tool.completed", timestamp: "2026-09-06T10:00:00.120Z", metadata: { tool: "calculator", output: "5192" } } }),
  event("trace.end", "4", { run_id: "run_live_001", status: "completed", completed_at: "2026-09-06T10:00:00.120Z" }),
];

const duplicateEvents = [
  successEvents[0],
  event("trace.event", "2", { run_id: "run_live_001", event: { id: "duplicate-event", type: "tool.completed", timestamp: "2026-09-06T10:00:00.100Z", duration_ms: 12, metadata: { tool: "calculator", output: "5192" } } }),
  event("trace.event", "3", { run_id: "run_live_001", event: { id: "duplicate-event", type: "tool.completed", timestamp: "2026-09-06T10:00:00.100Z", duration_ms: 12, metadata: { tool: "calculator", output: "5192" } } }),
  event("trace.end", "4", { run_id: "run_live_001", status: "completed", completed_at: "2026-09-06T10:00:00.100Z" }),
];

const slowEvents = [successEvents[0], successEvents[1], ...successEvents.slice(2)];

function writeEvent(response, item) {
  response.write(`id: ${item.id}\nevent: ${item.eventType}\ndata: ${item.data}\n\n`);
}

function stream(response, items, delay) {
  let index = 0;
  let timer;
  const send = () => {
    if (index >= items.length || response.writableEnded) {
      response.end();
      return;
    }
    writeEvent(response, items[index]);
    index += 1;
    if (index < items.length) timer = setTimeout(send, delay);
    else timer = setTimeout(() => response.end(), delay);
  };
  send();
  response.on("close", () => clearTimeout(timer));
}

const server = http.createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("ok");
    return;
  }
  const path = new URL(request.url, `http://${request.headers.host}`).pathname;
  const items = path === "/sse/malformed" ? malformedEvents : path === "/sse/duplicate" ? duplicateEvents : path === "/sse/slow" ? slowEvents : path === "/sse/success" ? successEvents : null;
  if (!items) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  response.writeHead(200, { "Cache-Control": "no-cache", Connection: "keep-alive", "Content-Type": "text/event-stream" });
  stream(response, items, path === "/sse/slow" ? 350 : 30);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`SSE fixture listening on http://127.0.0.1:${port}\n`);
});
