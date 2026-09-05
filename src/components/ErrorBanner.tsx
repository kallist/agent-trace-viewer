import type { TraceValidationError } from "../trace/types";

export default function ErrorBanner({ errors }: { errors: TraceValidationError[] | null }) {
  if (!errors || errors.length === 0) return null;
  return <section className="error-banner" role="alert" aria-labelledby="error-heading"><div className="error-mark" aria-hidden="true">!</div><div><h2 id="error-heading">Trace could not be imported</h2><ul>{errors.map((error) => <li key={`${error.path}-${error.message}`}><span className="mono">{error.path}</span>: {error.message}</li>)}</ul><p>Your current valid trace is still open.</p></div></section>;
}
