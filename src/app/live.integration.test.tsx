import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { LiveTraceHandlers, LiveTraceTransport } from "../trace/live/transport";
import type { LiveTransportMessage } from "../trace/live/types";

class FakeTransport implements LiveTraceTransport {
  handlers: LiveTraceHandlers | null = null;
  closed = false;

  connect(_url: string, handlers: LiveTraceHandlers) {
    this.handlers = handlers;
    this.closed = false;
    return { close: () => { this.closed = true; } };
  }

  open(): void { act(() => this.handlers?.onOpen()); }
  emit(message: LiveTransportMessage): void { act(() => this.handlers?.onMessage(message)); }
  fail(): void { act(() => this.handlers?.onError()); }
}

function startMessage(): LiveTransportMessage {
  return { eventType: "trace.start", transportId: "1", data: JSON.stringify({ run_id: "fake-live", name: "Fake Live" }) };
}

function toolMessage(id = "tool-1"): LiveTransportMessage {
  return { eventType: "trace.event", transportId: id, data: JSON.stringify({ run_id: "fake-live", event: { id, type: "tool.completed", timestamp: "2026-09-06T10:00:00.100Z", metadata: { tool: "calculator", output: "5192" } } }) };
}

describe("live trace product integration", () => {
  it("connects, ingests events, and keeps the existing inspector working", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransport();
    render(<App liveTransport={transport} />);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByRole("status", { name: /CONNECTING/i })).toBeTruthy();
    transport.open();
    expect(screen.getByRole("status", { name: /LIVE/i })).toBeTruthy();
    transport.emit(startMessage());
    transport.emit(toolMessage());
    expect(screen.getByText("fake-live")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /tool\.completed/i }));
    expect(screen.getByRole("heading", { name: "tool.completed" })).toBeTruthy();
    expect(screen.getAllByText("5192", { exact: true }).length).toBeGreaterThan(0);
  });

  it("shows a warning for malformed data and continues with later messages", () => {
    const transport = new FakeTransport();
    render(<App liveTransport={transport} />);
    act(() => screen.getByRole("button", { name: "Connect" }).click());
    transport.emit(startMessage());
    transport.emit({ eventType: "trace.event", data: "not-json" });
    transport.emit(toolMessage());
    expect(screen.getByRole("heading", { name: "Stream warnings" })).toBeTruthy();
    expect(screen.getByText("tool.completed")).toBeTruthy();
    expect(screen.getByText("fake-live")).toBeTruthy();
  });

  it("preserves the trace during reconnect and ignores the replaced connection", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransport();
    render(<App liveTransport={transport} />);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    const oldHandlers = transport.handlers;
    transport.emit(startMessage());
    transport.fail();
    expect(screen.getByRole("status", { name: /RECONNECTING/i })).toBeTruthy();
    expect(screen.getByText("fake-live")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Connect" }));
    act(() => oldHandlers?.onMessage(toolMessage("stale-after-reconnect")));
    transport.emit({ ...startMessage(), transportId: "new-1", data: JSON.stringify({ run_id: "new-live" }) });
    expect(screen.getByText("new-live")).toBeTruthy();
    expect(screen.queryByText("fake-live")).toBeNull();
    expect(screen.queryByRole("button", { name: /tool\.completed/i })).toBeNull();
  });

  it("disconnects and ignores stale callbacks when offline trace is loaded", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransport();
    render(<App liveTransport={transport} />);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    transport.emit(startMessage());
    const oldHandlers = transport.handlers;
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(transport.closed).toBe(true);
    await user.click(screen.getByRole("button", { name: /Load Failed Sample/i }));
    act(() => oldHandlers?.onMessage(toolMessage("stale")));
    expect(screen.getByText("run_failed_001")).toBeTruthy();
    expect(screen.queryByText("fake-live")).toBeNull();
  });

  it("rejects a credential-bearing endpoint without opening transport", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransport();
    render(<App liveTransport={transport} />);
    await user.clear(screen.getByLabelText("SSE endpoint"));
    await user.type(screen.getByLabelText("SSE endpoint"), "https://user:pass@example.test/sse");
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByRole("alert").textContent).toContain("credentials");
    expect(transport.handlers).toBeNull();
  });
});
