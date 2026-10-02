import { act, render, screen, waitFor } from "@testing-library/react";
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
  fail(retrying = true): void { act(() => this.handlers?.onError({ retrying })); }
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

  it("ignores a delayed offline file read after switching to and selecting a live event", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransport();
    render(<App liveTransport={transport} />);
    let resolveRead: (value: string) => void = () => undefined;
    const delayedText = new Promise<string>((resolve) => { resolveRead = resolve; });
    const delayedFile = new File(["pending"], "delayed.json", { type: "application/json" });
    Object.defineProperty(delayedFile, "text", { configurable: true, value: () => delayedText });
    await user.upload(screen.getByLabelText("Upload .json"), delayedFile);
    await user.click(screen.getByRole("button", { name: "Live" }));
    await user.click(screen.getByRole("button", { name: "Connect" }));
    transport.open();
    transport.emit(startMessage());
    transport.emit(toolMessage());
    await user.click(screen.getByRole("button", { name: /tool\.completed/i }));
    expect(screen.getByRole("heading", { name: "tool.completed" })).toBeTruthy();

    resolveRead(JSON.stringify({ run_id: "stale-offline", events: [{ type: "run.completed", timestamp: "2026-01-01T00:00:00Z" }] }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "tool.completed" })).toBeTruthy());
    expect(screen.getByText("fake-live")).toBeTruthy();
    expect(screen.queryByText("stale-offline")).toBeNull();
    expect(screen.getByRole("status", { name: /LIVE/i })).toBeTruthy();
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

  it("keeps selected events and metrics while later events arrive, then closes at trace.end", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransport();
    render(<App liveTransport={transport} />);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    transport.emit(startMessage());
    transport.emit(toolMessage());
    await user.click(screen.getByRole("button", { name: /tool\.completed/i }));
    transport.emit({ eventType: "trace.event", transportId: "later", data: JSON.stringify({ run_id: "fake-live", event: { id: "later", type: "run.completed", timestamp: "2026-09-06T10:00:00.200Z" } }) });
    expect(screen.getByRole("heading", { name: "tool.completed" })).toBeTruthy();
    expect(screen.getByText("Tool calls").parentElement?.querySelector("strong")?.textContent).toBe("1");
    transport.emit({ eventType: "trace.end", transportId: "end", data: JSON.stringify({ run_id: "fake-live", status: "completed" }) });
    expect(transport.closed).toBe(true);
    expect(screen.getByRole("status", { name: "Connection ENDED" })).toBeTruthy();
  });

  it("shows agent failure through the existing Failure Summary but keeps network errors separate", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransport();
    render(<App liveTransport={transport} />);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    transport.emit(startMessage());
    transport.emit(toolMessage());
    transport.fail();
    expect(screen.getByRole("heading", { name: "No failures detected" })).toBeTruthy();
    expect(screen.getByText("fake-live")).toBeTruthy();
    expect(screen.getByText("tool.completed")).toBeTruthy();
    transport.emit({ eventType: "trace.event", transportId: "failure", data: JSON.stringify({ run_id: "fake-live", event: { id: "failure", type: "run.failed", timestamp: "2026-09-06T10:00:00.200Z", metadata: { error: "AgentFailure" } } }) });
    transport.emit({ eventType: "trace.end", transportId: "end", data: JSON.stringify({ run_id: "fake-live", status: "failed" }) });
    expect(screen.getByRole("heading", { name: "1 failed event" })).toBeTruthy();
    expect(screen.getByText("Failures").parentElement?.querySelector("strong")?.textContent).toBe("1");
    expect(screen.getByText("Failed", { selector: ".run-status" })).toBeTruthy();
    expect(transport.closed).toBe(true);
  });

  it("clear closes the connection and rejects callbacks that could restore a cleared trace", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransport();
    render(<App liveTransport={transport} />);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    transport.emit(startMessage());
    transport.emit({ eventType: "trace.event", data: "bad-json" });
    await user.click(screen.getByRole("button", { name: "Clear live trace" }));
    expect(transport.closed).toBe(true);
    transport.open();
    transport.emit(startMessage());
    transport.fail();
    expect(screen.getByRole("status", { name: "Connection IDLE" })).toBeTruthy();
    expect(screen.queryByText("fake-live")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Stream warnings" })).toBeNull();
  });

  it("unmount closes the connection and a remounted app rejects callbacks from the old session", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransport();
    const mounted = render(<App liveTransport={transport} />);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    const old = transport.handlers;
    mounted.unmount();
    expect(transport.closed).toBe(true);
    render(<App liveTransport={transport} />);
    act(() => { old?.onOpen(); old?.onMessage(startMessage()); old?.onError({ retrying: true }); });
    expect(screen.getByRole("status", { name: "Connection IDLE" })).toBeTruthy();
    expect(screen.getByText("run_001")).toBeTruthy();
    expect(screen.queryByText("fake-live")).toBeNull();
  });

  it("offline import closes an active stream and ignores all its delayed callbacks", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransport();
    render(<App liveTransport={transport} />);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    transport.emit(startMessage());
    const old = transport.handlers;
    await user.click(screen.getByRole("button", { name: /Load Failed Sample/i }));
    expect(transport.closed).toBe(true);
    act(() => { old?.onOpen(); old?.onMessage(toolMessage()); old?.onError({ retrying: true }); });
    expect(screen.getByText("run_failed_001")).toBeTruthy();
    expect(screen.queryByText("fake-live")).toBeNull();
    expect(screen.getByRole("status", { name: "Connection IDLE" })).toBeTruthy();
  });

  it("permanent transport closure stops retry messaging without changing agent status", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransport();
    render(<App liveTransport={transport} />);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    transport.emit(startMessage());
    transport.emit(toolMessage());
    transport.fail(false);
    transport.open();
    expect(screen.getByRole("status", { name: "Connection DISCONNECTED" })).toBeTruthy();
    expect(screen.getByText("tool.completed")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "No failures detected" })).toBeTruthy();
    expect(screen.getByText(/SSE connection closed; check the endpoint/)).toBeTruthy();
    expect(transport.closed).toBe(true);
  });

  it("terminal run failure remains visible even without a failed event", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransport();
    render(<App liveTransport={transport} />);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    transport.emit(startMessage());
    transport.emit({ eventType: "trace.end", transportId: "end", data: JSON.stringify({ run_id: "fake-live", status: "failed" }) });
    expect(screen.getByRole("heading", { name: "Run failed" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "No failures detected" })).toBeNull();
    expect(screen.getByRole("status", { name: "Connection ENDED" })).toBeTruthy();
    expect(transport.closed).toBe(true);
  });

  it("explicit disconnect invalidates callbacks before any offline action", async () => {
    const user = userEvent.setup();
    const transport = new FakeTransport();
    render(<App liveTransport={transport} />);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    transport.emit(startMessage());
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    transport.open();
    transport.emit(toolMessage());
    transport.fail();
    expect(screen.getByRole("status", { name: "Connection DISCONNECTED" })).toBeTruthy();
    expect(screen.getByText("fake-live")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /tool\.completed/i })).toBeNull();
    expect(transport.closed).toBe(true);
  });
});
