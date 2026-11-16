import { Anime, ListStatus, MediaType, TrackerAccount } from '../types';
import { fetchAniListViewer, fetchByMalIds, mapMedia } from './anilist';
import { importMALList, ImportedEntry } from './jikan';

const ENDPOINT = 'https://graphql.anilist.co';

/**
 * Lightweight list query for fast import (< 2s even for 400+ entries).
 */
const LIST_QUERY = `
  query Profile($name: String, $type: MediaType) {
    MediaListCollection(userName: $name, type: $type, sort: [UPDATED_TIME_DESC]) {
      lists {
        name
        status
        entries {
          status
          score(format: POINT_10)
          progress
          media {
            id
            idMal
            type
            title { english romaji native }
            coverImage { extraLarge large }
            bannerImage
            genres
            tags { name rank isMediaSpoiler }
            studios(isMain: true) { nodes { name } }
            startDate { year }
            season
            format
            episodes
            chapters
            volumes
            duration
            averageScore
            popularity
            status
            trailer { id site thumbnail }
          }
        }
      }
    }
  }
`;

const ANILIST_STATUS: Record<string, ListStatus> = {
  CURRENT: 'watching',
  REPEATING: 'watching',
  PLANNING: 'planned',
  COMPLETED: 'completed',
  PAUSED: 'on_hold',
  DROPPED: 'dropped',
};

const MAL_LOAD_STATUS: Record<number, ListStatus> = {
  1: 'watching',
  2: 'completed',
  3: 'on_hold',
  4: 'dropped',
  6: 'planned',
};

interface AniListEntry {
  status?: string;
  score?: number;
  progress?: number;
  media?: Parameters<typeof mapMedia>[0];
}

interface AniListList {
  entries?: AniListEntry[];
}

interface AniListResponse {
  data?: { MediaListCollection?: { lists?: AniListList[] } | null };
  errors?: { message: string }[];
}

export interface TrackerImport {
  entries: ImportedEntry[];
  account: TrackerAccount;
}

export function extractUsername(raw: string): string {
  let clean = raw.trim();
  // Support pasting full URLs like https://anilist.co/user/harsh or https://myanimelist.net/profile/harsh
  const urlMatch = clean.match(/(?:user|profile|animelist|mangalist)\/([a-zA-Z0-9_-]+)/i);
  if (urlMatch?.[1]) return urlMatch[1];
  if (clean.startsWith('@')) clean = clean.slice(1);
  return clean.trim();
}

function isNativeCapacitor(): boolean {
  return Boolean(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  );
}

async function graphql<T>(
  query: string,
  variables: Record<string, unknown>,
  token?: string
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(json.errors[0].message);
    if (!json.data) throw new Error('AniList did not return a list for that user.');
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

export async function importAniList(rawUsername: string, token?: string): Promise<TrackerImport> {
  const name = extractUsername(rawUsername);
  if (!name) throw new Error('Enter an AniList username or profile link.');

  const fetchType = async (type: MediaType): Promise<ImportedEntry[]> => {
    try {
      const data = await graphql<AniListResponse['data']>(LIST_QUERY, { name, type }, token);
      const lists = data?.MediaListCollection?.lists ?? [];
      const out: ImportedEntry[] = [];
      for (const list of lists) {
        for (const row of list.entries ?? []) {
          if (!row.media) continue;
          const anime: Anime = mapMedia(row.media, type);
          if (!anime.cover) continue;
          out.push({
            anime,
            status: ANILIST_STATUS[row.status ?? ''] ?? 'planned',
            score: row.score && row.score > 0 ? Math.min(10, Math.round(row.score)) : undefined,
            progress: row.progress || undefined,
          });
        }
      }
      return out;
    } catch (error) {
      if (type === 'MANGA') return [];
      const message = error instanceof Error ? error.message : '';
      if (/not found|404|Private/i.test(message)) {
        throw new Error(
          `AniList list for "${name}" is private or not found. If private, sign in with the AniList App button.`
        );
      }
      throw error;
    }
  };

  const [animeEntries, mangaEntries] = await Promise.all([
    fetchType('ANIME'),
    fetchType('MANGA'),
  ]);

  const entries = [...animeEntries, ...mangaEntries];
  if (!entries.length) {
    throw new Error(`"${name}" has no anime or manga on their AniList list.`);
  }

  return {
    entries,
    account: {
      provider: 'anilist',
      username: name,
      connectedAt: Date.now(),
      imported: entries.length,
    },
  };
}

export async function importAniListWithToken(token: string): Promise<TrackerImport> {
  const cleanToken = token.trim().replace(/^Bearer\s+/i, '');
  if (!cleanToken) throw new Error('Paste your AniList access token.');
  const viewer = await fetchAniListViewer(cleanToken);
  return importAniList(viewer.name, cleanToken);
}

interface MalLoadJsonRow {
  status: number;
  score: number;
  num_watched_episodes?: number;
  num_read_chapters?: number;
  anime_id?: number;
  manga_id?: number;
  anime_title?: string;
  anime_title_eng?: string;
  manga_title?: string;
  manga_english?: string;
  anime_num_episodes?: number;
  manga_num_chapters?: number;
  anime_image_path?: string;
  manga_image_path?: string;
  anime_media_type_string?: string;
  manga_media_type_string?: string;
  anime_start_date_string?: string;
}

async function fetchMalLoadJson(
  username: string,
  mediaType: MediaType
): Promise<ImportedEntry[]> {
  const listKind = mediaType === 'MANGA' ? 'mangalist' : 'animelist';
  const collected: MalLoadJsonRow[] = [];

  for (let page = 0; page < 3; page += 1) {
    const offset = page * 300;
    const url = isNativeCapacitor()
      ? `https://myanimelist.net/${listKind}/${encodeURIComponent(username)}/load.json?status=7&offset=${offset}`
      : `/proxy/mal/${listKind}/${encodeURIComponent(username)}/load.json?status=7&offset=${offset}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 400 || res.status === 403 || res.status === 404) {
        if (page === 0 && mediaType === 'ANIME') {
          throw new Error(
            `MyAnimeList profile "${username}" is private or not found. Make sure your MAL list is set to Public.`
          );
        }
        break;
      }
      if (!res.ok) break;
      const rows = (await res.json()) as MalLoadJsonRow[];
      if (!Array.isArray(rows) || rows.length === 0) break;
      collected.push(...rows);
      if (rows.length < 300) break;
    } catch (err) {
      clearTimeout(timer);
      if (page === 0 && mediaType === 'ANIME') throw err;
      break;
    }
  }

  if (!collected.length) return [];

  // Batch-hydrate MAL entries via AniList GraphQL so every entry gets high-res 16:9 banners, trailers & tags!
  const malIds = collected
    .map((r) => (mediaType === 'MANGA' ? r.manga_id : r.anime_id))
    .filter((id): id is number => Boolean(id));

  const hydrated = await fetchByMalIds(malIds, mediaType);
  const byMalId = new Map<number, Anime>();
  for (const item of hydrated) {
    if (item.malId) byMalId.set(item.malId, item);
  }

  return collected.map((row) => {
    const malId = (mediaType === 'MANGA' ? row.manga_id : row.anime_id) ?? 0;
    const rich = byMalId.get(malId);
    const rawCover = (mediaType === 'MANGA' ? row.manga_image_path : row.anime_image_path) ?? '';
    const cover = rawCover.replace('/r/96x136/', '/').replace('/r/116x180/', '/');
    const title =
      (mediaType === 'MANGA'
        ? row.manga_english || row.manga_title
        : row.anime_title_eng || row.anime_title) || 'Untitled';

    const fallbackAnime: Anime = {
      id: `${mediaType === 'MANGA' ? 'mal-manga' : 'mal'}:${malId}`,
      mediaType,
      source: 'mal',
      malId,
      title: String(title),
      cover,
      banner: cover,
      description: '',
      genres: [],
      tags: [],
      studios: [],
      format:
        (mediaType === 'MANGA' ? row.manga_media_type_string : row.anime_media_type_string) ??
        undefined,
      episodes: row.anime_num_episodes || undefined,
      chapters: row.manga_num_chapters || undefined,
      streaming: [],
      similar: [],
      fetchedAt: Date.now(),
    };

    const progress =
      mediaType === 'MANGA' ? row.num_read_chapters : row.num_watched_episodes;

    return {
      anime: rich ?? fallbackAnime,
      status: MAL_LOAD_STATUS[row.status] ?? 'planned',
      score: row.score && row.score > 0 ? row.score : undefined,
      progress: progress && progress > 0 ? progress : undefined,
    };
  });
}

export async function importMyAnimeList(rawUsername: string): Promise<TrackerImport> {
  const name = extractUsername(rawUsername);
  if (!name) throw new Error('Enter a MyAnimeList username or profile link.');

  let entries: ImportedEntry[] = [];

  try {
    const [animeEntries, mangaEntries] = await Promise.all([
      fetchMalLoadJson(name, 'ANIME'),
      fetchMalLoadJson(name, 'MANGA').catch(() => [] as ImportedEntry[]),
    ]);
    entries = [...animeEntries, ...mangaEntries];
  } catch (primaryError) {
    // Fallback to Jikan API if direct MAL endpoint wasn't available
    try {
      entries = await importMALList(name);
    } catch {
      throw primaryError;
    }
  }

  if (!entries.length) {
    throw new Error(`"${name}" has no anime or manga on their MyAnimeList list.`);
  }

  return {
    entries,
    account: {
      provider: 'mal',
      username: name,
      connectedAt: Date.now(),
      imported: entries.length,
    },
  };
}

/**
 * Parses an exported MyAnimeList XML file or JSON backup file directly offline.
 */
export async function importFromExportFile(text: string): Promise<TrackerImport> {
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(trimmed, 'text/xml');
    const animeNodes = Array.from(xml.querySelectorAll('anime'));
    if (!animeNodes.length) throw new Error('No <anime> entries found in this XML file.');

    const mapXmlStatus: Record<string, ListStatus> = {
      Watching: 'watching',
      Completed: 'completed',
      'On-Hold': 'on_hold',
      Dropped: 'dropped',
      'Plan to Watch': 'planned',
    };

    const rawRows = animeNodes.map((node) => ({
      malId: Number(node.querySelector('series_animedb_id')?.textContent ?? 0),
      title: node.querySelector('series_title')?.textContent ?? 'Untitled',
      episodes: Number(node.querySelector('series_episodes')?.textContent ?? 0),
      progress: Number(node.querySelector('my_watched_episodes')?.textContent ?? 0),
      score: Number(node.querySelector('my_score')?.textContent ?? 0),
      status: mapXmlStatus[node.querySelector('my_status')?.textContent ?? ''] ?? 'planned',
    }));

    const malIds = rawRows.map((r) => r.malId).filter((id) => id > 0);
    const hydrated = await fetchByMalIds(malIds, 'ANIME');
    const byMal = new Map(hydrated.map((a) => [a.malId, a]));

    const entries: ImportedEntry[] = rawRows
      .filter((r) => r.malId > 0)
      .map((r) => ({
        anime:
          byMal.get(r.malId) ??
          ({
            id: `mal:${r.malId}`,
            mediaType: 'ANIME',
            source: 'mal',
            malId: r.malId,
            title: r.title,
            cover: '',
            banner: '',
            description: '',
            genres: [],
            tags: [],
            studios: [],
            episodes: r.episodes || undefined,
            streaming: [],
            similar: [],
            fetchedAt: Date.now(),
          } satisfies Anime),
        status: r.status,
        score: r.score > 0 ? r.score : undefined,
        progress: r.progress > 0 ? r.progress : undefined,
      }));

    return {
      entries,
      account: {
        provider: 'mal',
        username: 'MAL XML Import',
        connectedAt: Date.now(),
        imported: entries.length,
      },
    };
  }

  throw new Error('Unsupported file format. Please upload a MyAnimeList .xml export file.');
}
