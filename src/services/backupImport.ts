import { Anime, LibraryState, ListStatus } from '../types';
import { searchAniList } from './anilist';
import { animeStore } from './animeStore';
import { ImportedEntry } from './jikan';
import { library } from './library';
import { TrackerImport } from './trackers';

export interface ParsedBackupRow {
  title: string;
  mediaType: 'ANIME' | 'MANGA';
  status: ListStatus;
  progress?: number;
  score?: number;
  anilistId?: number;
  malId?: number;
  genres?: string[];
}

function normalizeTitleKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapBackupStatus(raw: unknown): ListStatus {
  if (typeof raw === 'number') {
    if (raw === 1) return 'watching';
    if (raw === 2 || raw === 4) return 'completed';
    if (raw === 5) return 'dropped';
    if (raw === 6) return 'on_hold';
    return 'planned';
  }
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (/watch|read|current|ongoing|1/.test(s)) return 'watching';
  if (/complet|finish|2/.test(s)) return 'completed';
  if (/hold|paus|wait|3/.test(s)) return 'on_hold';
  if (/drop|cancel|4/.test(s)) return 'dropped';
  return 'planned';
}

function readVarint(bytes: Uint8Array, pos: number): [number, number] {
  let result = 0;
  let shift = 0;
  let i = pos;
  while (i < bytes.length) {
    const b = bytes[i++];
    result += (b & 0x7f) * Math.pow(2, shift);
    if ((b & 0x80) === 0) break;
    shift += 7;
    if (shift > 53) break;
  }
  return [result, i];
}

function skipWireField(bytes: Uint8Array, pos: number, wireType: number): number {
  if (wireType === 0) {
    const [, next] = readVarint(bytes, pos);
    return next;
  }
  if (wireType === 1) return Math.min(bytes.length, pos + 8);
  if (wireType === 2) {
    const [len, start] = readVarint(bytes, pos);
    return Math.min(bytes.length, start + len);
  }
  if (wireType === 5) return Math.min(bytes.length, pos + 4);
  return bytes.length;
}

/**
 * Pure TypeScript protobuf wire decoder for Mihon / Tachiyomi (.tachibk / .proto.gz)
 * Backup format: root field 1 -> repeated BackupManga messages.
 */
export function decodeMihonProtobufBytes(bytes: Uint8Array): ParsedBackupRow[] {
  const decoder = new TextDecoder('utf-8');
  const rows: ParsedBackupRow[] = [];

  const parseChapterRead = (buf: Uint8Array): boolean => {
    let i = 0;
    while (i < buf.length) {
      const [tag, afterTag] = readVarint(buf, i);
      const fieldNo = tag >>> 3;
      const wireType = tag & 0x07;
      i = afterTag;
      if (fieldNo === 5 && wireType === 0) {
        const [val, next] = readVarint(buf, i);
        i = next;
        if (val > 0) return true;
      } else {
        i = skipWireField(buf, i, wireType);
      }
    }
    return false;
  };

  const parseTracking = (buf: Uint8Array): { anilistId?: number; malId?: number; progress?: number; score?: number } => {
    let i = 0;
    let syncId = 0;
    let mediaId = 0;
    let lastChapter = 0;
    let score = 0;
    while (i < buf.length) {
      const [tag, afterTag] = readVarint(buf, i);
      const fieldNo = tag >>> 3;
      const wireType = tag & 0x07;
      i = afterTag;
      if (wireType === 0) {
        const [val, next] = readVarint(buf, i);
        i = next;
        if (fieldNo === 1) syncId = val;
        else if (fieldNo === 3) mediaId = val;
      } else if (wireType === 5 && (fieldNo === 6 || fieldNo === 7)) {
        if (i + 4 <= buf.length) {
          const dv = new DataView(buf.buffer, buf.byteOffset + i, 4);
          const f = dv.getFloat32(0, true);
          if (fieldNo === 6 && Number.isFinite(f)) lastChapter = Math.floor(f);
          if (fieldNo === 7 && Number.isFinite(f)) score = Math.round(f * 10) / 10;
        }
        i += 4;
      } else {
        i = skipWireField(buf, i, wireType);
      }
    }
    // Tachiyomi/Mihon tracker IDs: 1 = MAL, 2 = AniList
    return {
      malId: syncId === 1 && mediaId > 0 ? mediaId : undefined,
      anilistId: syncId === 2 && mediaId > 0 ? mediaId : undefined,
      progress: lastChapter > 0 ? lastChapter : undefined,
      score: score > 0 ? (score > 10 ? Math.round((score / 10) * 10) / 10 : score) : undefined,
    };
  };

  const parseMangaMsg = (buf: Uint8Array): ParsedBackupRow | null => {
    let i = 0;
    let title = '';
    let statusRaw = 0;
    let readChapters = 0;
    const genres: string[] = [];
    let trackInfo: ReturnType<typeof parseTracking> = {};

    while (i < buf.length) {
      const [tag, afterTag] = readVarint(buf, i);
      const fieldNo = tag >>> 3;
      const wireType = tag & 0x07;
      i = afterTag;
      if (wireType === 2) {
        const [len, start] = readVarint(buf, i);
        const end = Math.min(buf.length, start + len);
        const slice = buf.subarray(start, end);
        i = end;
        if (fieldNo === 3) {
          title = decoder.decode(slice).trim();
        } else if (fieldNo === 7) {
          const g = decoder.decode(slice).trim();
          if (g) genres.push(g);
        } else if (fieldNo === 16) {
          if (parseChapterRead(slice)) readChapters += 1;
        } else if (fieldNo === 18) {
          const parsed = parseTracking(slice);
          trackInfo = { ...trackInfo, ...parsed };
        }
      } else if (wireType === 0 && fieldNo === 8) {
        const [val, next] = readVarint(buf, i);
        statusRaw = val;
        i = next;
      } else {
        i = skipWireField(buf, i, wireType);
      }
    }

    if (!title) return null;
    const progress = trackInfo.progress ?? (readChapters > 0 ? readChapters : undefined);
    return {
      title,
      mediaType: 'MANGA',
      status: mapBackupStatus(statusRaw),
      progress,
      score: trackInfo.score,
      anilistId: trackInfo.anilistId,
      malId: trackInfo.malId,
      genres,
    };
  };

  let p = 0;
  while (p < bytes.length) {
    const [tag, afterTag] = readVarint(bytes, p);
    const fieldNo = tag >>> 3;
    const wireType = tag & 0x07;
    p = afterTag;
    if (fieldNo === 1 && wireType === 2) {
      const [len, start] = readVarint(bytes, p);
      const end = Math.min(bytes.length, start + len);
      const manga = parseMangaMsg(bytes.subarray(start, end));
      if (manga) rows.push(manga);
      p = end;
    } else {
      p = skipWireField(bytes, p, wireType);
    }
  }
  return rows;
}

async function maybeGunzip(rawBytes: Uint8Array): Promise<Uint8Array> {
  const isGzip = rawBytes.length >= 2 && rawBytes[0] === 0x1f && rawBytes[1] === 0x8b;
  if (!isGzip) return rawBytes;
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress .tachibk gzip archives. Try exporting a JSON or CSV backup.');
  }
  const stream = new Blob([new Uint8Array(rawBytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

function parseCsvLines(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur.trim());
    return out;
  };
  const headers = splitRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  return lines.slice(1).map((line) => {
    const vals = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? '';
    });
    return row;
  });
}

export function parseComixOrJsonBackup(text: string): ParsedBackupRow[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    const arr: Record<string, unknown>[] = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null
      ? (
          (parsed as Record<string, unknown>).backupManga ??
          (parsed as Record<string, unknown>).mangas ??
          (parsed as Record<string, unknown>).comics ??
          (parsed as Record<string, unknown>).bookmarks ??
          (parsed as Record<string, unknown>).items ??
          (parsed as Record<string, unknown>).list ??
          (parsed as Record<string, unknown>).data ??
          []
        ) as Record<string, unknown>[]
      : [];
    if (!Array.isArray(arr)) return [];
    const out: ParsedBackupRow[] = [];
    for (const r of arr) {
      if (!r || typeof r !== 'object') continue;
      const title = String(
        r.title ?? r.name ?? r.comic_title ?? r.manga_title ?? r.series_title ?? ''
      ).trim();
      if (!title) continue;
      const progRaw = Number(
        r.progress ?? r.read ?? r.chapter ?? r.chapters_read ?? r.last_chapter ?? 0
      );
      const scoreRaw = Number(r.score ?? r.rating ?? r.my_score ?? 0);
      const anilistRaw = Number(r.anilistId ?? r.anilist_id ?? 0);
      const malRaw = Number(r.malId ?? r.mal_id ?? 0);
      const mt =
        String(r.mediaType ?? r.media_type ?? r.type ?? '').toUpperCase() === 'ANIME'
          ? 'ANIME'
          : 'MANGA';
      out.push({
        title,
        mediaType: mt,
        status: mapBackupStatus(r.status ?? r.list_status ?? r.reading_status ?? 'reading'),
        progress: Number.isFinite(progRaw) && progRaw > 0 ? Math.floor(progRaw) : undefined,
        score: Number.isFinite(scoreRaw) && scoreRaw > 0 ? Math.min(10, scoreRaw) : undefined,
        anilistId: Number.isFinite(anilistRaw) && anilistRaw > 0 ? anilistRaw : undefined,
        malId: Number.isFinite(malRaw) && malRaw > 0 ? malRaw : undefined,
        genres: Array.isArray(r.genres) ? r.genres.map(String) : undefined,
      });
    }
    return out;
  }

  // CSV parser (Comix / ComicK / Kenmei CSV exports)
  const csvRows = parseCsvLines(trimmed);
  const out: ParsedBackupRow[] = [];
  for (const r of csvRows) {
    const title = (r.title || r.name || r.comic || r.manga || r.series || '').trim();
    if (!title) continue;
    const progRaw = Number(r.progress || r.chapter || r.chapters_read || r.read || 0);
    const scoreRaw = Number(r.score || r.rating || 0);
    const anilistRaw = Number(r.anilist_id || r.anilist || 0);
    const malRaw = Number(r.mal_id || r.mal || 0);
    out.push({
      title,
      mediaType: String(r.type || r.media_type || '').toUpperCase() === 'ANIME' ? 'ANIME' : 'MANGA',
      status: mapBackupStatus(r.status || r.list || 'reading'),
      progress: Number.isFinite(progRaw) && progRaw > 0 ? Math.floor(progRaw) : undefined,
      score: Number.isFinite(scoreRaw) && scoreRaw > 0 ? Math.min(10, scoreRaw) : undefined,
      anilistId: Number.isFinite(anilistRaw) && anilistRaw > 0 ? anilistRaw : undefined,
      malId: Number.isFinite(malRaw) && malRaw > 0 ? malRaw : undefined,
    });
  }
  return out;
}

export function matchRowsAgainstCatalog(
  rows: ParsedBackupRow[],
  sourceLabel: string
): TrackerImport {
  const catalog = animeStore.all();
  const byAni = new Map<number, Anime>();
  const byMal = new Map<number, Anime>();
  const byTitle = new Map<string, Anime>();
  for (const a of catalog) {
    if (a.anilistId) byAni.set(a.anilistId, a);
    if (a.malId) byMal.set(a.malId, a);
    byTitle.set(normalizeTitleKey(a.title), a);
    if (a.titleRomaji) byTitle.set(normalizeTitleKey(a.titleRomaji), a);
  }

  const entries: ImportedEntry[] = rows.map((row, idx) => {
    const matched =
      (row.anilistId ? byAni.get(row.anilistId) : undefined) ??
      (row.malId ? byMal.get(row.malId) : undefined) ??
      byTitle.get(normalizeTitleKey(row.title));

    const anime: Anime =
      matched ??
      ({
        id: row.anilistId
          ? `anilist:${row.anilistId}`
          : row.malId
          ? `mal:${row.malId}`
          : `backup:${normalizeTitleKey(row.title) || idx}`,
        mediaType: row.mediaType,
        source: row.malId ? 'mal' : 'anilist',
        anilistId: row.anilistId,
        malId: row.malId,
        title: row.title,
        cover: '',
        banner: '',
        description: '',
        genres: row.genres ?? [],
        tags: [],
        studios: [],
        streaming: [],
        similar: [],
        fetchedAt: Date.now(),
      } satisfies Anime);

    return {
      anime,
      status: row.status,
      progress: row.progress,
      score: row.score,
    };
  });

  return {
    entries,
    account: {
      provider: 'anilist',
      username: sourceLabel,
      connectedAt: Date.now(),
      imported: entries.length,
    },
  };
}

export async function importComixOrMihonFile(file: File): Promise<TrackerImport> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.tachibk') || name.endsWith('.proto.gz') || name.endsWith('.gz')) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const ungz = await maybeGunzip(buf);
    const rows = decodeMihonProtobufBytes(ungz);
    if (!rows.length) {
      throw new Error('No manga entries found inside this Mihon/Tachiyomi backup.');
    }
    return matchRowsAgainstCatalog(rows, 'Mihon Backup');
  }

  const text = await file.text();
  const rows = parseComixOrJsonBackup(text);
  if (!rows.length) {
    throw new Error('Could not find valid entries in this Comix / Mihon backup file.');
  }
  const sourceLabel = name.includes('mihon') || name.includes('tachiyomi') ? 'Mihon Backup' : 'Comix Backup';
  return matchRowsAgainstCatalog(rows, sourceLabel);
}

/**
 * Resolves unmatched `backup:*` placeholder entries from Comix/Mihon imports
 * against AniList search so niche titles receive real covers, chapters & 2-way sync IDs.
 */
export async function hydrateUnmatchedBackupEntries(entries: ImportedEntry[]): Promise<number> {
  const unmatched = entries.filter((e) => e.anime.id.startsWith('backup:') && !e.anime.cover).slice(0, 25);
  let resolvedCount = 0;

  for (const item of unmatched) {
    try {
      const hits = await searchAniList(item.anime.title, 3, item.anime.mediaType ?? 'MANGA');
      const best = hits[0];
      if (!best) continue;
      animeStore.remember(best);
      animeStore.pin(best.id);
      const oldEntry = library.getSnapshot().entries[item.anime.id];
      if (oldEntry) {
        library.setStatus(best, oldEntry.status);
        library.updateEntryDetails(best.id, {
          progress: oldEntry.progress,
          score: oldEntry.score,
          notes: oldEntry.notes,
        });
        library.remove(item.anime.id);
      }
      resolvedCount += 1;
    } catch {
      /* continue quietly if offline or rate-limited */
    }
  }
  return resolvedCount;
}

export async function gunzipFileToText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const raw = await maybeGunzip(buf);
  return new TextDecoder('utf-8').decode(raw);
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toMalStatus(status: ListStatus, isManga: boolean): string {
  if (status === 'watching') return isManga ? 'Reading' : 'Watching';
  if (status === 'completed') return 'Completed';
  if (status === 'on_hold') return 'On-Hold';
  if (status === 'dropped') return 'Dropped';
  return isManga ? 'Plan to Read' : 'Plan to Watch';
}

/**
 * Exports tracked anime entries as MyAnimeList-compatible XML (`myanimelist`).
 */
export function exportMalXml(libraryState?: LibraryState): string {
  const lib = libraryState ?? library.getSnapshot();
  const entries = Object.values(lib.entries);
  const animeItems: string[] = [];
  let counts = { total: 0, watching: 0, completed: 0, onHold: 0, dropped: 0, ptw: 0 };

  for (const e of entries) {
    const anime = animeStore.get(e.animeId);
    const isManga = (anime?.mediaType ?? e.mediaType ?? 'ANIME') === 'MANGA';
    if (isManga) continue;
    counts.total += 1;
    if (e.status === 'watching') counts.watching += 1;
    else if (e.status === 'completed') counts.completed += 1;
    else if (e.status === 'on_hold') counts.onHold += 1;
    else if (e.status === 'dropped') counts.dropped += 1;
    else counts.ptw += 1;

    const malId = anime?.malId ?? (e.animeId.startsWith('mal:') ? Number(e.animeId.slice(4)) || 0 : 0);
    const title = escapeXml(anime?.title || e.animeId);
    const seriesType = escapeXml(anime?.format || 'TV');
    const totalEps = anime?.episodes ?? 0;
    const score = e.score ? Math.round(e.score) : 0;
    const comments = escapeXml(e.notes || '');

    animeItems.push(
      `  <anime>\n` +
        `    <series_animedb_id>${malId}</series_animedb_id>\n` +
        `    <series_title><![CDATA[${title}]]></series_title>\n` +
        `    <series_type>${seriesType}</series_type>\n` +
        `    <series_episodes>${totalEps}</series_episodes>\n` +
        `    <my_watched_episodes>${e.progress ?? 0}</my_watched_episodes>\n` +
        `    <my_score>${score}</my_score>\n` +
        `    <my_status>${toMalStatus(e.status, false)}</my_status>\n` +
        `    <my_times_watched>${e.repeat ?? 0}</my_times_watched>\n` +
        `    <my_comments><![CDATA[${comments}]]></my_comments>\n` +
        `    <update_on_import>1</update_on_import>\n` +
      `  </anime>`
    );
  }

  return (
    `<?xml version="1.0" encoding="UTF-8" ?>\n` +
    `<myanimelist>\n` +
    `  <myinfo>\n` +
    `    <user_export_type>1</user_export_type>\n` +
    `    <user_total_anime>${counts.total}</user_total_anime>\n` +
    `    <user_total_watching>${counts.watching}</user_total_watching>\n` +
    `    <user_total_completed>${counts.completed}</user_total_completed>\n` +
    `    <user_total_onhold>${counts.onHold}</user_total_onhold>\n` +
    `    <user_total_dropped>${counts.dropped}</user_total_dropped>\n` +
    `    <user_total_plantowatch>${counts.ptw}</user_total_plantowatch>\n` +
    `  </myinfo>\n` +
    animeItems.join('\n') +
    (animeItems.length ? '\n' : '') +
    `</myanimelist>\n`
  );
}
