const MISSING_CONFIG = /Missing Supabase environment variable\(s\):\s*([A-Z_,\s]+)/;

/** Returns the missing Cloud setting names when an error is a missing-configuration error. */
export function missingCloudSettings(error: unknown): string[] | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = MISSING_CONFIG.exec(message);
  if (!match) return null;
  const names = (match[1] ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => (name.startsWith("VITE_") ? name : `VITE_${name}`));
  return names.length ? names : null;
}
