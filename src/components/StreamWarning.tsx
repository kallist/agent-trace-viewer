import type { LiveTraceWarning } from "../trace/live/types";

export default function StreamWarning({ warnings }: { warnings: LiveTraceWarning[] }) {
  if (warnings.length === 0) return null;
  return <section className="stream-warning" role="status" aria-live="polite" aria-labelledby="stream-warning-heading">
    <div className="warning-icon" aria-hidden="true">!</div>
    <div><h2 id="stream-warning-heading">Stream warnings</h2><ul>{warnings.map((warning, index) => <li key={`${warning.kind}-${warning.message}-${index}`}>{warning.message}</li>)}</ul></div>
  </section>;
}
