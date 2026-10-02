import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import path from "node:path";

const FIXTURE = "http://127.0.0.1:4174";

async function connectControlled(page: Page, request: APIRequestContext, scenario: string, control: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await page.getByLabel("SSE endpoint").fill(`${FIXTURE}/sse/${scenario}?control=${control}`);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("status", { name: "Connection LIVE", exact: true })).toBeVisible();
  return async (count = 1) => {
    const response = await request.post(`${FIXTURE}/control/${control}?count=${count}`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
}

test("successful trace flows from sample to tool inspector", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Load Successful Sample/i }).click();
  await expect(page.getByText("run_001", { exact: true })).toBeVisible();
  await expect(page.getByText("retrieval.completed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /tool\.completed/i }).click();
  await expect(page.getByRole("heading", { name: "tool.completed" })).toBeVisible();
  await expect(page.getByText("calculator", { exact: true })).toBeVisible();
  await expect(page.getByText("5192", { exact: true })).toBeVisible();
});

test("failed trace shows failure summary and error signal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Load Failed Sample/i }).click();
  await expect(page.getByRole("heading", { name: "2 failed events" })).toBeVisible();
  await expect(page.getByRole("button", { name: /retrieval\.failed.*VectorStoreUnavailable/i })).toBeVisible();
  await expect(page.getByText("Failures").locator(".."))
    .toContainText("2");
});

test("malformed paste reports validation while the app remains usable", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Paste JSON").fill("{ bad json");
  await page.getByRole("button", { name: /Parse pasted JSON/i }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid JSON");
  await expect(page.getByText("run_001", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Load Failed Sample/i }).click();
  await expect(page.getByText("run_failed_001", { exact: true })).toBeVisible();
});

test("uploading the fixture replaces the current trace", async ({ page }) => {
  await page.goto("/");
  await page.locator("#trace-file").setInputFiles(path.resolve("src/fixtures/failed-run.json"));
  await expect(page.getByText("run_failed_001", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /retrieval\.failed.*VectorStoreUnavailable/i })).toBeVisible();
});

test("live SSE success updates the timeline, metrics, inspector, and ends cleanly", async ({ page, request }, testInfo) => {
  const advance = await connectControlled(page, request, "success", `success-${testInfo.retry}`);
  await advance();
  await expect(page.getByText("run_live_001", { exact: true })).toBeVisible();
  await expect(page.locator(".timeline-event")).toHaveCount(0);
  await advance();
  await expect(page.locator(".timeline-event")).toHaveCount(1);
  await expect(page.locator(".metric-card").filter({ hasText: "Tool calls" }).locator("strong")).toHaveText("0");
  await advance(6);
  await expect(page.locator(".timeline-event")).toHaveCount(7);
  await expect(page.locator(".metric-card").filter({ hasText: "Tool calls" }).locator("strong")).toHaveText("1");
  await expect(page.locator(".metric-card").filter({ hasText: "Tokens" }).locator("strong")).toHaveText("1,380");
  await expect(page.getByRole("button", { name: /tool\.completed/i })).toBeVisible();
  await page.getByRole("button", { name: /tool\.completed/i }).click();
  await expect(page.getByRole("heading", { name: "tool.completed" })).toBeVisible();
  await expect(page.getByText("calculator", { exact: true })).toBeVisible();
  await expect(page.getByText("5192", { exact: true })).toBeVisible();
  await advance(3);
  await expect(page.getByRole("status", { name: /ENDED/i })).toBeVisible();
  await expect(page.locator(".timeline-event")).toHaveCount(9);
  await expect(page.getByRole("heading", { name: "tool.completed" })).toBeVisible();
  await expect(page.locator(".run-status")).toHaveText("✓Completed");
  await expect.poll(async () => (await request.get(`${FIXTURE}/control/success-${testInfo.retry}`)).json().then((state) => state.closed)).toBe(true);
});

test("malformed live data warns without stopping later events", async ({ page, request }, testInfo) => {
  const advance = await connectControlled(page, request, "malformed", `malformed-${testInfo.retry}`);
  await advance(2);
  await expect(page.locator(".timeline-event")).toHaveCount(1);
  await advance();
  await expect(page.getByRole("heading", { name: "Stream warnings" })).toBeVisible();
  await expect(page.locator(".timeline-event")).toHaveCount(1);
  await advance();
  await expect(page.getByRole("button", { name: /tool\.completed/i })).toBeVisible();
  await advance();
  await expect(page.getByRole("status", { name: /ENDED/i })).toBeVisible();
  await expect(page.locator(".timeline-event")).toHaveCount(2);
});

test("duplicate live event IDs do not duplicate the timeline or tool metric", async ({ page, request }, testInfo) => {
  const advance = await connectControlled(page, request, "duplicate", `duplicate-${testInfo.retry}`);
  await advance(5);
  await expect(page.getByRole("status", { name: /ENDED/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /tool\.completed/i })).toHaveCount(1);
  await expect(page.locator(".timeline-event")).toHaveCount(1);
  await expect(page.locator(".metric-card").filter({ hasText: "Tool calls" }).locator("strong")).toHaveText("1");
  await expect(page.locator(".metric-card").filter({ hasText: /^Tools/ }).locator("strong")).toHaveText("12 ms");
  await expect(page.getByRole("heading", { name: "Stream warnings" })).toBeVisible();
  await expect(page.getByText("Duplicate SSE message dropped.", { exact: true })).toBeVisible();
  await expect(page.getByText("Duplicate event 'duplicate-event' dropped.", { exact: true })).toBeVisible();
});

test("disconnect stops a slow live stream and leaves the received trace visible", async ({ page, request }, testInfo) => {
  const control = `disconnect-${testInfo.retry}`;
  const advance = await connectControlled(page, request, "slow", control);
  await advance(2);
  await expect(page.getByRole("button", { name: /run\.started/i })).toBeVisible();
  await expect(page.locator(".timeline-event")).toHaveCount(1);
  const before = await page.locator(".summary, .metrics-section, .timeline-list").allTextContents();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByRole("status", { name: /DISCONNECTED/i })).toBeVisible();
  await expect.poll(async () => (await request.get(`${FIXTURE}/control/${control}`)).json().then((state) => state.closed)).toBe(true);
  const progressed = await advance(9);
  expect(progressed.attempted).toBe(progressed.total);
  expect(progressed.closed).toBe(true);
  await expect(page.locator(".timeline-event")).toHaveCount(1);
  expect(await page.locator(".summary, .metrics-section, .timeline-list").allTextContents()).toEqual(before);
  await expect(page.getByRole("button", { name: /retrieval\.started/i })).toHaveCount(0);
});

test("inherited SSE IDs preserve unique events and terminal stream closure", async ({ page, request }, testInfo) => {
  const advance = await connectControlled(page, request, "inherited-id", `inherited-${testInfo.retry}`);
  await advance(3);
  await expect(page.getByRole("status", { name: "Connection ENDED", exact: true })).toBeVisible();
  await expect(page.locator(".timeline-event")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /tool\.completed/i })).toBeVisible();
  await expect(page.locator(".metric-card").filter({ hasText: "Tool calls" }).locator("strong")).toHaveText("1");
  await expect(page.getByRole("heading", { name: "Stream warnings" })).toHaveCount(0);
});

test("a permanently rejected endpoint reports disconnected rather than retrying", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("SSE endpoint").fill(`${FIXTURE}/sse/not-found`);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("status", { name: "Connection DISCONNECTED", exact: true })).toBeVisible();
  await expect(page.getByText(/SSE connection closed; check the endpoint/)).toBeVisible();
  await expect(page.getByRole("status", { name: "Connection RECONNECTING", exact: true })).toHaveCount(0);
});

test("Replay Theater seeks and steps the existing timeline without rerunning the agent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(page.getByRole("status", { name: "Replay IDLE", exact: true })).toBeVisible();
  const slider = page.getByRole("slider", { name: "Replay position" });
  await slider.focus();
  await slider.press("End");
  await expect(page.getByRole("status", { name: "Replay ENDED", exact: true })).toBeVisible();
  await expect(page.locator(".timeline-event")).toHaveCount(9);
  await page.getByRole("button", { name: /tool\.completed/i }).click();
  await expect(page.getByRole("heading", { name: "tool.completed" })).toBeVisible();
  await page.getByRole("button", { name: "Step backward" }).click();
  await expect(page.getByRole("heading", { name: "tool.completed" })).toBeVisible();
  await expect(page.locator(".timeline-event")).toHaveCount(8);
});

test("Run Compare renders the measured demo-pair deltas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Compare measured run data" })).toBeVisible();
  await expect(page.getByText("-750 ms", { exact: true })).toBeVisible();
  await expect(page.getByText("-23.4%", { exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /Tool duration.*300 ms.*200 ms.*-100 ms/ })).toBeVisible();
  await expect(page.getByText("Deltas report recorded values only.")).toBeVisible();
});

test("Bottleneck Lens reports measured latency evidence for the latency scenario", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load scenario" }).nth(2).click();
  await expect(page.getByText("Before Optimization", { exact: true })).toBeVisible();
  await expect(page.getByText("Heuristic analysis", { exact: true })).toBeVisible();
  await expect(page.getByText(/LLM stages account for 69% of measured stage duration/)).toBeVisible();
  await expect(page.getByText(/The LLM caused your performance problem|Your LLM is inefficient/i)).toHaveCount(0);
});

test("Generic event list adapter auto-detects and imports the demo JSON", async ({ page }) => {
  await page.goto("/");
  await page.locator("#trace-file").setInputFiles(path.resolve("src/fixtures/generic-event-list.json"));
  await expect(page.getByText("generic-run", { exact: true })).toBeVisible();
  await expect(page.getByText("Input format: Generic Event List detected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /tool\.completed/i })).toBeVisible();
});

test("OTel-style subset converts resource spans into the normalized timeline", async ({ page }) => {
  await page.goto("/");
  await page.locator("#trace-file").setInputFiles(path.resolve("src/fixtures/otel-style-trace.json"));
  await expect(page.getByText("otel_demo_001", { exact: true })).toBeVisible();
  await expect(page.getByText("Input format: OTel-style JSON subset detected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /retrieval\.search\.completed/i })).toBeVisible();
  await page.getByRole("button", { name: /retrieval\.search\.completed/i }).click();
  await expect(page.getByText("demo-agent", { exact: true })).toBeVisible();
});

test("a delayed file read cannot clear a selected event after connecting Live", async ({ page, request }, testInfo) => {
  const control = `stale-import-${testInfo.retry}`;
  await page.addInitScript(() => {
    const nativeText = File.prototype.text;
    File.prototype.text = function () {
      if (this.name === "delayed.json") {
        return new Promise((resolve) => {
          (window as Window & { __resolveDelayedFile?: () => void }).__resolveDelayedFile = () => resolve(JSON.stringify({ run_id: "stale-offline", events: [{ type: "run.completed", timestamp: "2026-01-01T00:00:00Z" }] }));
        });
      }
      return nativeText.call(this);
    };
  });
  await page.goto("/");
  await page.locator("#trace-file").setInputFiles({ name: "delayed.json", mimeType: "application/json", buffer: Buffer.from("pending") });
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await page.getByLabel("SSE endpoint").fill(`${FIXTURE}/sse/success?control=${control}`);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("status", { name: "Connection LIVE", exact: true })).toBeVisible();
  await request.post(`${FIXTURE}/control/${control}?count=8`);
  await expect(page.getByRole("button", { name: /tool\.completed/i })).toBeVisible();
  await page.getByRole("button", { name: /tool\.completed/i }).click();
  await expect(page.getByRole("heading", { name: "tool.completed" })).toBeVisible();
  await page.evaluate(() => (window as Window & { __resolveDelayedFile?: () => void }).__resolveDelayedFile?.());
  await expect(page.getByRole("heading", { name: "tool.completed" })).toBeVisible();
  await expect(page.getByText("run_live_001", { exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Connection LIVE", exact: true })).toBeVisible();
});
