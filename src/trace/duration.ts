export function clamp(value: number, minimum = 0, maximum = 1): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function safeDuration(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

export function calculateRunDuration(
  startedAtMs: number,
  completedAtMs: number | undefined,
  firstEventMs: number | undefined,
  lastEventMs: number | undefined,
): number {
  if (completedAtMs !== undefined && Number.isFinite(startedAtMs) && completedAtMs >= startedAtMs) {
    return completedAtMs - startedAtMs;
  }
  if (firstEventMs !== undefined && lastEventMs !== undefined && lastEventMs >= firstEventMs) {
    return lastEventMs - firstEventMs;
  }
  return 0;
}

export function formatDuration(milliseconds: number | undefined): string {
  if (milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) {
    const seconds = milliseconds / 1000;
    return `${seconds.toFixed(seconds >= 10 ? 1 : 2).replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1")} s`;
  }
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
