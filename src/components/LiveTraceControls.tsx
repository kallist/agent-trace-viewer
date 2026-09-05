import type { LiveTracePhase } from "../trace/live/types";

const DEFAULT_ENDPOINT = "http://127.0.0.1:4174/sse/success";

interface LiveTraceControlsProps {
  mode: "offline" | "live";
  phase: LiveTracePhase;
  endpointError: string | null;
  hasTrace: boolean;
  onModeChange: (mode: "offline" | "live") => void;
  onConnect: (endpoint: string) => void;
  onDisconnect: () => void;
  onClear: () => void;
}

function phaseLabel(phase: LiveTracePhase): string {
  return phase.toUpperCase();
}

export default function LiveTraceControls({ mode, phase, endpointError, hasTrace, onModeChange, onConnect, onDisconnect, onClear }: LiveTraceControlsProps) {
  return <section className="panel live-controls" aria-labelledby="live-heading">
    <div className="section-heading">
      <div><p className="eyebrow">V0.2 · Live trace</p><h2 id="live-heading">Connect to an SSE stream</h2></div>
      <div className={`connection-status status-${phase}`} role="status" aria-label={`Connection ${phaseLabel(phase)}`}><span className="status-dot" aria-hidden="true" /> {phaseLabel(phase)}</div>
    </div>
    <div className="mode-switch" aria-label="Trace mode">
      <button className={`button ${mode === "offline" ? "button-dark" : "button-quiet"}`} type="button" aria-pressed={mode === "offline"} onClick={() => onModeChange("offline")}>Offline</button>
      <button className={`button ${mode === "live" ? "button-primary" : "button-quiet"}`} type="button" aria-pressed={mode === "live"} onClick={() => onModeChange("live")}>Live</button>
    </div>
    <div className="live-endpoint-row">
      <label htmlFor="live-endpoint">SSE endpoint</label>
      <input id="live-endpoint" type="url" defaultValue={DEFAULT_ENDPOINT} placeholder="https://example.test/trace" aria-invalid={endpointError ? "true" : undefined} />
      <button className="button button-primary" type="button" onClick={(event) => {
        const input = event.currentTarget.parentElement?.querySelector<HTMLInputElement>("#live-endpoint");
        if (input) onConnect(input.value);
      }}>Connect</button>
      <button className="button button-quiet" type="button" onClick={onDisconnect} disabled={phase === "idle" || phase === "disconnected" || phase === "ended"}>Disconnect</button>
      {hasTrace && <button className="button button-quiet" type="button" onClick={onClear}>Clear live trace</button>}
    </div>
    {endpointError && <p className="endpoint-error" role="alert">{endpointError}</p>}
    <p className="live-help">HTTP/HTTPS only. No credentials, auth headers, API keys, or trace persistence.</p>
  </section>;
}
