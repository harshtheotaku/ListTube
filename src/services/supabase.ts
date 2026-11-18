import { createClient } from '@supabase/supabase-js';
import { isNativeCapacitor } from './platform';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://kypafzhjdwnhsiyltndw.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_p-5p3ZhELAxfZu7IaaC2rA_1vCIv22R';
export const EDGE_API_BASE = `${SUPABASE_URL}/functions/v1/listtube-api`;

/**
 * Builds a direct episode-targeted URL for KotoPlay / streaming destinations when clicking an episode tile.
 */
export function buildEpisodeWatchUrl(baseUrl: string, siteKey: string, episodeNumber: number): string {
  try {
    const u = new URL(baseUrl);
    if (siteKey === 'kotoplay' && /\/watch\//i.test(u.pathname)) {
      u.searchParams.set('ep', String(episodeNumber));
      return u.toString();
    }
    if (siteKey === 'kotoplay' && !u.searchParams.has('ep')) {
      u.searchParams.set('ep', String(episodeNumber));
    } else if (siteKey === 'reanime') {
      u.searchParams.set('ep', String(episodeNumber));
    }
    return u.toString();
  } catch {
    return baseUrl;
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export interface ResolvedReaderLink {
  site: string;
  key: 'comix' | 'kagane' | 'reanime' | 'kotoplay' | string;
  url: string;
  isDirect: boolean;
  recommended?: boolean;
}

export interface OAuthServerStatus {
  anilistConfigured: boolean;
  anilistCodeFlowReady?: boolean;
  anilistClientId?: string;
  malConfigured: boolean;
  malClientId?: string;
}

export interface OAuthBridgePayload {
  bridgeEmail: string;
  bridgeTokenHash: string;
  userId: string;
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...init.headers,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function getAppBaseUrl(): string {
  if (typeof window === 'undefined' || isNativeCapacitor() || !window.location.protocol.startsWith('http')) {
    return 'https://listtube.vercel.app';
  }
  const base = import.meta.env.BASE_URL && import.meta.env.BASE_URL !== './'
    ? import.meta.env.BASE_URL
    : window.location.pathname.startsWith('/ListTube')
      ? '/ListTube/'
      : '/';
  return `${window.location.origin}${base}`.replace(/\/+$/, '');
}

export function getOAuthRedirectUri(): string {
  if (typeof window === 'undefined' || isNativeCapacitor() || !window.location.protocol.startsWith('http')) {
    return 'https://listtube.vercel.app/';
  }
  if (window.location.hostname === 'listtube.vercel.app' || window.location.hostname.endsWith('.vercel.app')) {
    return 'https://listtube.vercel.app/';
  }
  return `${window.location.origin}/`;
}

export function buildSharePreviewUrl(mediaId: string): string {
  const origin = getAppBaseUrl();
  const qs = new URLSearchParams({ id: mediaId, origin });
  return `${EDGE_API_BASE}/share?${qs.toString()}`;
}

export async function checkGoogleProviderEnabled(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { Accept: 'application/json' },
    }, 6000);
    if (!res.ok) return false;
    const json = (await res.json()) as { external?: { google?: boolean } };
    return Boolean(json.external?.google);
  } catch {
    return false;
  }
}

/**
 * Queries AniList GraphQL through ListTube's Postgres-backed L2 Edge Cache.
 */
export async function edgeAniList<T>(
  query: string,
  variables: Record<string, unknown>,
  ttlSeconds?: number
): Promise<T> {
  const res = await fetchWithTimeout(`${EDGE_API_BASE}/anilist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables, ttlSeconds }),
  });

  if (!res.ok) {
    throw new Error(`Edge AniList HTTP ${res.status}`);
  }

  const json = (await res.json()) as { data?: T; errors?: { message: string }[]; error?: string };
  if (json.error) throw new Error(json.error);
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error('Empty Edge AniList response');
  return json.data;
}

export async function fetchMalEdgeHtml(
  type: 'anime' | 'manga',
  id: number,
  kind: 'reviews' | 'userrecs'
): Promise<string> {
  if (!id) return '';
  try {
    const res = await fetchWithTimeout(
      `${EDGE_API_BASE}/mal?type=${type}&id=${id}&kind=${kind}`,
      { headers: { Accept: 'application/json' } },
      8500
    );
    if (!res.ok) return '';
    const json = (await res.json()) as { html?: string };
    return json.html ?? '';
  } catch {
    return '';
  }
}

export async function fetchMalThemesEdge(
  id: number
): Promise<{ openings: string[]; endings: string[] }> {
  if (!id) return { openings: [], endings: [] };
  try {
    const res = await fetchWithTimeout(
      `${EDGE_API_BASE}/mal-themes?id=${id}`,
      { headers: { Accept: 'application/json' } },
      9500
    );
    if (!res.ok) return { openings: [], endings: [] };
    const json = (await res.json()) as { openings?: string[]; endings?: string[] };
    return {
      openings: Array.isArray(json.openings) ? json.openings : [],
      endings: Array.isArray(json.endings) ? json.endings : [],
    };
  } catch {
    return { openings: [], endings: [] };
  }
}

export async function fetchNewsEdge(source: 'ann' | 'mal', id = 0): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      `${EDGE_API_BASE}/news?source=${source}&id=${id}`,
      { headers: { Accept: 'application/json' } },
      9000
    );
    if (!res.ok) return '';
    const json = (await res.json()) as { text?: string };
    return json.text ?? '';
  } catch {
    return '';
  }
}

const linkCache = new Map<string, ResolvedReaderLink[]>();

export async function resolveExternalLinksEdge(
  mediaType: 'ANIME' | 'MANGA',
  title: string,
  romaji?: string
): Promise<ResolvedReaderLink[]> {
  const cleanTitle = title.trim();
  const cleanRomaji = (romaji ?? '').trim();
  const cacheKey = `${mediaType}||${cleanTitle.toLowerCase()}||${cleanRomaji.toLowerCase()}`;
  const cached = linkCache.get(cacheKey);
  if (cached) return cached;

  const q = encodeURIComponent(cleanTitle || cleanRomaji);
  const fallback: ResolvedReaderLink[] =
    mediaType === 'ANIME'
      ? [
          { site: 'KotoPlay', key: 'kotoplay', url: `https://kotoplay.to/search?keyword=${q}`, isDirect: false, recommended: true },
          { site: 'Re Anime', key: 'reanime', url: `https://reanime.cc/?s=${q}`, isDirect: false },
        ]
      : [
          { site: 'Comix.to', key: 'comix', url: `https://comix.to/browse?keyword=${q}`, isDirect: false, recommended: true },
          { site: 'Kagane', key: 'kagane', url: `https://kagane.org/search?q=${q}`, isDirect: false },
        ];

  try {
    const qs = new URLSearchParams({ type: mediaType, title: cleanTitle });
    if (cleanRomaji) qs.set('romaji', cleanRomaji);
    const res = await fetchWithTimeout(
      `${EDGE_API_BASE}/readers?${qs.toString()}`,
      { headers: { Accept: 'application/json' } },
      7000
    );
    if (!res.ok) return fallback;
    const json = (await res.json()) as { readers?: ResolvedReaderLink[] };
    const resolved = Array.isArray(json.readers) && json.readers.length > 0 ? json.readers : fallback;
    linkCache.set(cacheKey, resolved);
    return resolved;
  } catch {
    return fallback;
  }
}

export async function resolveMangaReadersEdge(
  title: string,
  romaji?: string
): Promise<ResolvedReaderLink[]> {
  return resolveExternalLinksEdge('MANGA', title, romaji);
}

export async function fetchOAuthServerStatus(): Promise<OAuthServerStatus> {
  try {
    const res = await fetchWithTimeout(`${EDGE_API_BASE}/oauth/status`, {
      headers: { Accept: 'application/json' },
    }, 6000);
    if (!res.ok) return { anilistConfigured: false, malConfigured: false };
    return (await res.json()) as OAuthServerStatus;
  } catch {
    return { anilistConfigured: false, malConfigured: false };
  }
}

export async function exchangeAniListOAuthEdge(params: {
  code: string;
  redirectUri: string;
  clientId?: string;
  clientSecret?: string;
}): Promise<{ access_token: string; expires_in?: number; bridge?: OAuthBridgePayload | null }> {
  const res = await fetchWithTimeout(`${EDGE_API_BASE}/oauth/anilist/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(json?.error || `AniList OAuth exchange HTTP ${res.status}`);
  }
  return json;
}

export async function createAniListBridgeSessionEdge(
  accessToken: string
): Promise<{ viewer?: any; bridge?: OAuthBridgePayload | null }> {
  const res = await fetchWithTimeout(`${EDGE_API_BASE}/oauth/anilist/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error || `AniList session bridge HTTP ${res.status}`);
  }
  return json;
}

export async function exchangeMalOAuthEdge(params: {
  grantType: 'authorization_code' | 'refresh_token';
  code?: string;
  codeVerifier?: string;
  redirectUri?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  bridge?: OAuthBridgePayload | null;
}> {
  const res = await fetchWithTimeout(`${EDGE_API_BASE}/oauth/mal/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(json?.error || `MAL OAuth token HTTP ${res.status}`);
  }
  return json;
}

export async function fetchMalOAuthListEdge(token: string): Promise<{
  user: { id: number; name: string; picture?: string };
  anime: any[];
  manga: any[];
}> {
  const res = await fetchWithTimeout(`${EDGE_API_BASE}/oauth/mal/list`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  }, 15000);
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json?.error || `MAL OAuth list HTTP ${res.status}`);
  }
  return json;
}

export async function writeBackAniListEdge(params: {
  token: string;
  mediaId: number;
  action?: 'save' | 'delete';
  status?: string;
  score?: number;
  progress?: number;
  progressVolumes?: number;
  repeat?: number;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
  isPrivate?: boolean;
  customLists?: string[];
  priority?: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      `${EDGE_API_BASE}/anilist-writeback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
      10000
    );
    const json = await res.json();
    if (!res.ok || json.error) {
      return { ok: false, error: json.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'AniList write-back error' };
  }
}

export async function writeBackMalEdge(params: {
  token: string;
  malId: number;
  mediaType: 'ANIME' | 'MANGA';
  action?: 'save' | 'delete';
  status?: string;
  score?: number;
  progress?: number;
  progressVolumes?: number;
  repeat?: number;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      `${EDGE_API_BASE}/mal-writeback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
      10000
    );
    const json = await res.json();
    if (!res.ok || json.error) {
      return { ok: false, error: json.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'MAL write-back error' };
  }
}
