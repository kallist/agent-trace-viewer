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
