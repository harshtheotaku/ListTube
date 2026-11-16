import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://kypafzhjdwnhsiyltndw.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_p-5p3ZhELAxfZu7IaaC2rA_1vCIv22R';
export const EDGE_API_BASE = `${SUPABASE_URL}/functions/v1/listtube-api`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export interface ResolvedReaderLink {
  site: string;
  key: 'comix' | 'kagane' | 'asura' | string;
  url: string;
  isDirect: boolean;
}

export interface SyncVaultPayload {
  library: {
    entries: Record<string, unknown>;
    notInterested: string[];
    events: unknown[];
    trackers: unknown[];
    interests: string[];
    mangaInterests: string[];
    updatedAt: number;
  };
  profile?: unknown;
  profileUpdatedAt?: number;
  settings?: unknown;
  comments?: Record<string, unknown[]>;
  snapshots?: Record<string, unknown>;
  deletedEntryIds?: string[];
  deletedCommentIds?: string[];
}

export interface SyncVaultResponse {
  ok?: boolean;
  code: string;
  payload: SyncVaultPayload;
  version: number;
  updatedAt: string;
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

/**
 * Fetches CORS-free HTML from MyAnimeList (/reviews or /userrecs) via Postgres-cached Edge Proxy.
 */
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

/**
 * Fetches CORS-free ANN RSS XML or MAL News HTML via Postgres-cached Edge Proxy.
 */
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

const readerCache = new Map<string, ResolvedReaderLink[]>();

/**
 * Resolves exact canonical reader series URLs from Supabase reader_catalog
 * (89k+ indexed Comix.to series) with search query fallbacks for CF-gated sites.
 */
export async function resolveMangaReadersEdge(
  title: string,
  romaji?: string
): Promise<ResolvedReaderLink[]> {
  const cleanTitle = title.trim();
  const cleanRomaji = (romaji ?? '').trim();
  const cacheKey = `${cleanTitle.toLowerCase()}||${cleanRomaji.toLowerCase()}`;
  const cached = readerCache.get(cacheKey);
  if (cached) return cached;

  const q = encodeURIComponent(cleanTitle || cleanRomaji);
  const fallback: ResolvedReaderLink[] = [
    { site: 'Comix.to', key: 'comix', url: `https://comix.to/browse?keyword=${q}`, isDirect: false },
    { site: 'Kagane', key: 'kagane', url: `https://kagane.org/search?q=${q}`, isDirect: false },
    { site: 'Asura Scans', key: 'asura', url: `https://asuracomic.net/series?page=1&name=${q}`, isDirect: false },
  ];

  try {
    const qs = new URLSearchParams({ title: cleanTitle });
    if (cleanRomaji) qs.set('romaji', cleanRomaji);
    const res = await fetchWithTimeout(
      `${EDGE_API_BASE}/readers?${qs.toString()}`,
      { headers: { Accept: 'application/json' } },
      6500
    );
    if (!res.ok) return fallback;
    const json = (await res.json()) as { readers?: ResolvedReaderLink[] };
    const resolved = Array.isArray(json.readers) && json.readers.length > 0 ? json.readers : fallback;
    readerCache.set(cacheKey, resolved);
    return resolved;
  } catch {
    return fallback;
  }
}

export async function syncVaultCreate(payload: SyncVaultPayload): Promise<SyncVaultResponse> {
  const res = await fetchWithTimeout(
    `${EDGE_API_BASE}/sync`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', payload }),
    },
    12000
  );
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `Sync create failed (${res.status})`);
  return json as SyncVaultResponse;
}

export async function syncVaultPush(code: string, payload: SyncVaultPayload): Promise<SyncVaultResponse> {
  const res = await fetchWithTimeout(
    `${EDGE_API_BASE}/sync`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'push', code, payload }),
    },
    12000
  );
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `Sync push failed (${res.status})`);
  return json as SyncVaultResponse;
}

export async function syncVaultPull(code: string): Promise<{ payload: SyncVaultPayload; version: number; updatedAt: string }> {
  const res = await fetchWithTimeout(
    `${EDGE_API_BASE}/sync?code=${encodeURIComponent(code)}`,
    { headers: { Accept: 'application/json' } },
    10000
  );
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `Sync code not found (${res.status})`);
  return json as { payload: SyncVaultPayload; version: number; updatedAt: string };
}

export async function writeBackAniListEdge(params: {
  token: string;
  mediaId: number;
  status?: string;
  score?: number;
  progress?: number;
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
    return { ok: false, error: err instanceof Error ? err.message : 'Write-back network error' };
  }
}
