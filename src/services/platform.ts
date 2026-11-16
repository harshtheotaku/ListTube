export function isNativeCapacitor(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  );
}

/**
 * Resolves a MyAnimeList path for the current runtime:
 * - Capacitor Android/iOS native: direct HTTPS (handled by native CapacitorHttp)
 * - Vite dev/preview or Vercel deployment: same-origin `/proxy/mal/...`
 * - Static hosts without server rewrites (e.g. GitHub Pages): returns null so callers
 *   go directly to CORS-enabled APIs without 404 console noise.
 */
export function resolveMalUrl(malPath: string): string | null {
  if (isNativeCapacitor()) return `https://myanimelist.net${malPath}`;
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    const hasProxy =
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h.endsWith('.vercel.app') ||
      window.location.port === '5173';
    if (!hasProxy) return null;
  }
  return `/proxy/mal${malPath}`;
}
