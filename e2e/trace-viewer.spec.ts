import { test, expect } from "@playwright/test";
import path from "node:path";

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

test("live SSE success updates the timeline, metrics, inspector, and ends cleanly", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Live" }).click();
  await page.getByLabel("SSE endpoint").fill("http://127.0.0.1:4174/sse/success");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("status", { name: /LIVE/i })).toBeVisible();
  await expect(page.getByText("run_live_001", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /tool\.completed/i })).toBeVisible();
  await page.getByRole("button", { name: /tool\.completed/i }).click();
  await expect(page.getByRole("heading", { name: "tool.completed" })).toBeVisible();
  await expect(page.getByText("calculator", { exact: true })).toBeVisible();
  await expect(page.getByText("5192", { exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: /ENDED/i })).toBeVisible();
});

test("malformed live data warns without stopping later events", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("SSE endpoint").fill("http://127.0.0.1:4174/sse/malformed");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("heading", { name: "Stream warnings" })).toBeVisible();
  await expect(page.getByRole("button", { name: /tool\.completed/i })).toBeVisible();
  await expect(page.getByRole("status", { name: /ENDED/i })).toBeVisible();
});

test("duplicate live event IDs do not duplicate the timeline or tool metric", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("SSE endpoint").fill("http://127.0.0.1:4174/sse/duplicate");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: /tool\.completed/i })).toHaveCount(1);
  await expect(page.locator(".metric-card").filter({ hasText: "Tool calls" })).toContainText("1");
  await expect(page.getByRole("status", { name: /ENDED/i })).toBeVisible();
});

test("disconnect stops a slow live stream and leaves the received trace visible", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("SSE endpoint").fill("http://127.0.0.1:4174/sse/slow");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: /run\.started/i })).toBeVisible();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("status", { name: /DISCONNECTED/i })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole("button", { name: /retrieval\.started/i })).toHaveCount(0);
});
