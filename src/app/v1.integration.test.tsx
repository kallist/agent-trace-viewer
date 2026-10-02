import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => vi.unstubAllGlobals());

describe("V1.0 product workflows", () => {
  it("replays visible events, seeks selection out of view and steps on timestamp boundaries", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Replay" }));
    expect(screen.getByRole("status", { name: "Replay IDLE" })).toBeTruthy();
    expect(document.querySelectorAll(".timeline-event")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Step forward" }));
    await waitFor(() => expect(document.querySelectorAll(".timeline-event")).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: /retrieval\.started/i }));
    expect(screen.getByRole("heading", { name: "retrieval.started" })).toBeTruthy();
    fireEvent.change(screen.getByRole("slider", { name: "Replay position" }), { target: { value: "5" } });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Select an event" })).toBeTruthy());
    expect(document.querySelectorAll(".timeline-event")).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText("Replay speed"), "4");
    expect((screen.getByLabelText("Replay speed") as HTMLSelectElement).value).toBe("4");
  });

  it("pauses playback and cancels the animation frame when leaving Replay", async () => {
    const user = userEvent.setup();
    const request = vi.fn((_callback: FrameRequestCallback) => 17);
    const cancel = vi.fn((_id: number) => undefined);
    vi.stubGlobal("requestAnimationFrame", request);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Replay" }));
    await user.click(screen.getByRole("button", { name: "Play replay" }));
    expect(screen.getByRole("status", { name: "Replay PLAYING" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Pause replay" }));
    expect(screen.getByRole("status", { name: "Replay PAUSED" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Play replay" }));
    expect(request).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Observe" }));
    expect(cancel).toHaveBeenCalledWith(17);
  });

  it("compares the deterministic demo pair using factual B minus A deltas", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getByRole("heading", { name: "Compare measured run data" })).toBeTruthy();
    expect(screen.getByText("-750 ms")).toBeTruthy();
    expect(screen.getByText("-23.4%")).toBeTruthy();
    expect(screen.getByText("Δ is Run B − Run A")).toBeTruthy();
  });

  it("loads a demo scenario and presents evidence-labelled heuristic observations", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole("button", { name: "Load scenario" })[2]);
    expect(screen.getByText("demo_before_001")).toBeTruthy();
    expect(screen.getByText("Heuristic analysis")).toBeTruthy();
    expect(screen.getByText(/LLM stages account for 69%/)).toBeTruthy();
    expect(screen.queryByText(/root cause confirmed|is inefficient/i)).toBeNull();
  });

  it("auto-detects a generic event list and renders its normalized trace", async () => {
    const user = userEvent.setup();
    render(<App />);
    const file = new File([JSON.stringify({ events: [{ type: "tool.completed", timestamp: "2026-01-01T00:00:00Z", tool: "generic.search" }] })], "generic.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("Upload .json"), file);
    await waitFor(() => expect(screen.getByText("generic-run")).toBeTruthy());
    expect(screen.getByText("Input format: Generic Event List detected")).toBeTruthy();
    expect(screen.getByRole("button", { name: /tool\.completed/i })).toBeTruthy();
  });
});
