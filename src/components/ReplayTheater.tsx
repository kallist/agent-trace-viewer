import { useEffect, useMemo, useState } from "react";
import EventInspector from "./EventInspector";
import TraceMetrics from "./TraceMetrics";
import TraceSummary from "./TraceSummary";
import TraceTimeline from "./TraceTimeline";
import { advanceReplay, createReplayFrame, createReplayState, pauseReplay, playReplay, seekReplay, setReplaySpeed, stepReplay } from "../trace/replay/replay";
import type { ReplaySpeed, ReplayState } from "../trace/replay/types";
import type { NormalizedTrace, TraceEvent } from "../trace/types";

function clockLabel(milliseconds: number): string {
  const value = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.floor((value % 60_000) / 1000);
  const millis = value % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export default function ReplayTheater({ trace }: { trace: NormalizedTrace }) {
  const [state, setState] = useState<ReplayState>(() => createReplayState(trace));
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const frame = useMemo(() => createReplayFrame(trace, state.cursorMs), [trace, state.cursorMs]);
  const currentEvent = frame.currentEvent;
  const selectedEvent = frame.visibleEvents.find((event) => event.id === selectedEventId) ?? null;
  const boundaries = trace.events.map((event) => event.elapsedMs);

  useEffect(() => {
    if (selectedEventId && !frame.visibleEvents.some((event) => event.id === selectedEventId)) setSelectedEventId(null);
  }, [frame.visibleEvents, selectedEventId]);

  useEffect(() => {
    if (state.status !== "playing") return;
    let frameId = 0;
    let previousTime: number | undefined;
    const request = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16);
    const cancel = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : window.clearTimeout;
    const tick: FrameRequestCallback = (now) => {
      if (previousTime !== undefined) setState((current) => advanceReplay(current, now - previousTime!));
      previousTime = now;
      frameId = request(tick);
    };
    frameId = request(tick);
    return () => cancel(frameId);
  }, [state.status]);

  function updateCursor(value: number) {
    setState((current) => seekReplay(current, value));
  }

  function selectEvent(event: TraceEvent) {
    setSelectedEventId(event.id);
  }

  return <section className="replay-workspace" aria-labelledby="replay-heading">
    <div className="panel replay-theater">
      <div className="section-heading">
        <div><p className="eyebrow">Trace Replay Theater</p><h2 id="replay-heading">Replay this run</h2></div>
        <span className={`replay-state replay-${state.status}`} role="status" aria-label={`Replay ${state.status.toUpperCase()}`}>{state.status === "ended" ? "ENDED" : state.status.toUpperCase()}</span>
      </div>
      <div className="replay-current-event" aria-live="polite">
        <span className="eyebrow">Current event</span>
        <strong>{currentEvent?.type ?? "Before first event"}</strong>
        <span>{currentEvent ? `${currentEvent.category} · ${currentEvent.status}` : "Move the playhead or step forward to inspect the run."}</span>
      </div>
      <div className="replay-controls">
        <button className="button button-quiet" type="button" aria-label="Step backward" onClick={() => setState((current) => stepReplay(current, boundaries, -1))}>|◀</button>
        {state.status === "playing"
          ? <button className="button button-primary" type="button" aria-label="Pause replay" onClick={() => setState((current) => pauseReplay(current))}>Pause</button>
          : <button className="button button-primary" type="button" aria-label="Play replay" onClick={() => setState((current) => playReplay(current))} disabled={state.durationMs === 0}>▶ Play</button>}
        <button className="button button-quiet" type="button" aria-label="Step forward" onClick={() => setState((current) => stepReplay(current, boundaries, 1))}>▶|</button>
        <label htmlFor="replay-speed">Speed</label>
        <select id="replay-speed" aria-label="Replay speed" value={state.speed} onChange={(event) => setState((current) => setReplaySpeed(current, Number(event.target.value) as ReplaySpeed))}>
          {[0.5, 1, 2, 4].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
        </select>
        <output className="replay-time" aria-live="off">{clockLabel(state.cursorMs)} / {clockLabel(state.durationMs)}</output>
      </div>
      <label className="replay-seek-label" htmlFor="replay-seek">Replay position</label>
      <input id="replay-seek" aria-label="Replay position" type="range" min={0} max={state.durationMs} step={1} value={Math.min(state.cursorMs, state.durationMs)} disabled={state.durationMs === 0} onChange={(event) => updateCursor(Number(event.target.value))} />
      <div className="replay-scale" aria-hidden="true"><span>00:00.000</span><span>{clockLabel(state.durationMs)}</span></div>
    </div>
    <TraceSummary trace={frame.partialTrace} />
    <TraceMetrics metrics={frame.metrics} heading="Replay frame metrics" />
    <div className="workspace-grid">
      <TraceTimeline trace={frame.partialTrace} selectedEventId={selectedEventId} currentEventId={currentEvent?.id ?? null} onSelect={selectEvent} />
      <EventInspector event={selectedEvent} />
    </div>
  </section>;
}
