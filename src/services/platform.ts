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
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
    return null;
  }
  return `/proxy/mal${malPath}`;
}
