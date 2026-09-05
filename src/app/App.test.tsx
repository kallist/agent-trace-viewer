import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

describe("Agent Trace Viewer product flows", () => {
  it("loads the successful sample and shows metrics, timeline, and tool inspector", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText("run_001")).toBeTruthy();
    expect(screen.getAllByText("1.42 s").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("retrieval.completed")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /tool\.completed/i }));
    expect(screen.getByText("calculator")).toBeTruthy();
    expect(screen.getAllByText(/5192/).length).toBeGreaterThanOrEqual(1);
  });

  it("loads the failed sample and exposes failure details", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Load Failed Sample/i }));
    expect(screen.getByText("run_failed_001")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "2 failed events" })).toBeTruthy();
    expect(screen.getAllByText(/VectorStoreUnavailable/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Failures").parentElement?.textContent).toContain("2");
  });

  it("shows malformed JSON without destroying the currently loaded trace", async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(screen.getByLabelText("Paste JSON"), { target: { value: "{ bad json" } });
    await user.click(screen.getByRole("button", { name: /Parse pasted JSON/i }));
    expect(screen.getByRole("alert").textContent).toContain("Invalid JSON");
    expect(screen.getByText("run_001")).toBeTruthy();
    expect(screen.getByText("tool.completed")).toBeTruthy();
  });

  it("parses a valid pasted trace and replaces the current run", async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(screen.getByLabelText("Paste JSON"), {
      target: { value: JSON.stringify({ run_id: "pasted", status: "completed", events: [{ type: "run.completed", timestamp: "2026-01-01T00:00:00Z" }] }) },
    });
    await user.click(screen.getByRole("button", { name: /Parse pasted JSON/i }));
    expect(screen.getByText("pasted")).toBeTruthy();
    expect(screen.queryByText("run_001")).toBeNull();
  });

  it("imports a JSON file and resets the selected event for the new trace", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /tool\.completed/i }));
    expect(screen.getByRole("heading", { name: "tool.completed" })).toBeTruthy();
    const file = new File([JSON.stringify({ run_id: "uploaded", events: [{ type: "run.completed", timestamp: "2026-01-01T00:00:00Z" }] })], "uploaded.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("Upload .json"), file);
    await waitFor(() => expect(screen.getByText("uploaded")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Select an event" })).toBeTruthy();
  });

  it("does not let a stale file read overwrite a newer sample import", async () => {
    const user = userEvent.setup();
    render(<App />);
    let resolveFirst: (value: string) => void = () => undefined;
    const firstRead = new Promise<string>((resolve) => { resolveFirst = resolve; });
    const delayedFile = new File(["ignored until read"], "delayed.json", { type: "application/json" });
    Object.defineProperty(delayedFile, "text", { configurable: true, value: () => firstRead });
    await user.upload(screen.getByLabelText("Upload .json"), delayedFile);
    await user.click(screen.getByRole("button", { name: /Load Failed Sample/i }));
    resolveFirst(JSON.stringify({ run_id: "stale", events: [{ type: "run.completed", timestamp: "2026-01-01T00:00:00Z" }] }));
    await waitFor(() => expect(screen.getByText("run_failed_001")).toBeTruthy());
    expect(screen.queryByText("stale")).toBeNull();
  });
});
