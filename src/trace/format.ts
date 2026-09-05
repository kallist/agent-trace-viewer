export function formatNumber(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "—" : new Intl.NumberFormat("en-US").format(value);
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return "Unable to display this value.";
  }
}

export function displayMetadataValue(value: unknown): string {
  if (typeof value === "string") return value;
  return prettyJson(value);
}
