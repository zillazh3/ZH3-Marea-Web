/** Resolves the configured repository URL from `VITE_SOURCE_URL`, allowing only HTTP(S) schemes. */
export function configuredSourceUrl(): string | null {
  const raw = (import.meta.env.VITE_SOURCE_URL as string | undefined)?.trim() ?? '';
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
