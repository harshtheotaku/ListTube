import { Anime, LibraryState, ListEntry, ListStatus, MediaType } from '../types';

export interface ProviderSnapshotItem {
  provider: 'listtube' | 'anilist' | 'mal';
  animeId: string;
  anilistId?: number;
  malId?: number;
  mediaType: MediaType;
  title: string;
  cover?: string;
  status: ListStatus;
  progress: number;
  score: number;
}

export interface ThreeWayDiffRow {
  key: string;
  title: string;
  cover?: string;
  mediaType: MediaType;
  listtube?: ProviderSnapshotItem;
  anilist?: ProviderSnapshotItem;
  mal?: ProviderSnapshotItem;
  recommended: {
    status: ListStatus;
    progress: number;
    score: number;
  };
  mismatchReasons: string[];
}

const STATUS_RANK: Record<ListStatus, number> = {
  completed: 5,
  watching: 4,
  on_hold: 3,
  planned: 2,
  dropped: 1,
};

function normTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’`:!?.,()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function itemMatchKey(item: {
  anilistId?: number;
  malId?: number;
  mediaType: MediaType;
  title: string;
  animeId: string;
}): string {
  if (item.malId && item.malId > 0) return `mal:${item.mediaType}:${item.malId}`;
  if (item.anilistId && item.anilistId > 0) return `al:${item.mediaType}:${item.anilistId}`;
  if (item.title) return `title:${item.mediaType}:${normTitle(item.title)}`;
  return item.animeId;
}

export function buildLocalSnapshots(
  libraryState: LibraryState,
  resolveMedia: (id: string) => Anime | undefined
): ProviderSnapshotItem[] {
  return Object.values(libraryState.entries).map((e) => {
    const a = resolveMedia(e.animeId);
    const mType: MediaType = a?.mediaType ?? e.mediaType ?? 'ANIME';
    const anilistId =
      a?.anilistId ?? (e.animeId.startsWith('anilist') ? Number(e.animeId.split(':')[1]) : undefined);
    const malId =
      a?.malId ?? (e.animeId.startsWith('mal') ? Number(e.animeId.split(':')[1]) : undefined);

    return {
      provider: 'listtube',
      animeId: e.animeId,
      anilistId: anilistId || undefined,
      malId: malId || undefined,
      mediaType: mType,
      title: a?.title || e.animeId,
      cover: a?.cover,
      status: e.status,
      progress: e.progress ?? 0,
      score: e.score ?? 0,
    };
  });
}

export function computeThreeWaySyncDiffs(params: {
  localItems: ProviderSnapshotItem[];
  anilistItems: ProviderSnapshotItem[];
  malItems: ProviderSnapshotItem[];
}): ThreeWayDiffRow[] {
  const buckets = new Map<
    string,
    {
      listtube?: ProviderSnapshotItem;
      anilist?: ProviderSnapshotItem;
      mal?: ProviderSnapshotItem;
    }
  >();

  // Link AniList/MAL cross-IDs via local snapshots first so malId matches anilistId cleanly
  const alToBucket = new Map<string, string>();
  const malToBucket = new Map<string, string>();
  const titleToBucket = new Map<string, string>();

  const registerBucket = (bucketKey: string, item: ProviderSnapshotItem) => {
    if (item.anilistId) alToBucket.set(`${item.mediaType}:${item.anilistId}`, bucketKey);
    if (item.malId) malToBucket.set(`${item.mediaType}:${item.malId}`, bucketKey);
    if (item.title) titleToBucket.set(`${item.mediaType}:${normTitle(item.title)}`, bucketKey);
  };

  const resolveBucketKey = (item: ProviderSnapshotItem): string => {
    if (item.malId && malToBucket.has(`${item.mediaType}:${item.malId}`)) {
      return malToBucket.get(`${item.mediaType}:${item.malId}`)!;
    }
    if (item.anilistId && alToBucket.has(`${item.mediaType}:${item.anilistId}`)) {
      return alToBucket.get(`${item.mediaType}:${item.anilistId}`)!;
    }
    if (item.title && titleToBucket.has(`${item.mediaType}:${normTitle(item.title)}`)) {
      return titleToBucket.get(`${item.mediaType}:${normTitle(item.title)}`)!;
    }
    return itemMatchKey(item);
  };

  const insert = (item: ProviderSnapshotItem) => {
    const key = resolveBucketKey(item);
    const prev = buckets.get(key) ?? {};
    prev[item.provider] = item;
    buckets.set(key, prev);
    registerBucket(key, item);
  };

  for (const x of params.localItems) insert(x);
  for (const x of params.anilistItems) insert(x);
  for (const x of params.malItems) insert(x);

  const diffs: ThreeWayDiffRow[] = [];

  for (const [key, group] of buckets.entries()) {
    const present = [group.listtube, group.anilist, group.mal].filter(
      (x): x is ProviderSnapshotItem => Boolean(x)
    );
    if (present.length < 2) continue;

    const statuses = new Set(present.map((p) => p.status));
    const progresses = new Set(present.map((p) => p.progress));
    const scores = new Set(present.filter((p) => p.score > 0).map((p) => Math.round(p.score)));

    const mismatchReasons: string[] = [];
    if (progresses.size > 1) mismatchReasons.push('Progress differs');
    if (statuses.size > 1) mismatchReasons.push('Status differs');
    if (scores.size > 1) mismatchReasons.push('Score differs');

    if (mismatchReasons.length === 0) continue;

    const maxProgress = Math.max(...present.map((p) => p.progress));
    const bestScoreItem = present.find((p) => p.provider === 'listtube' && p.score > 0)
      ?? present.find((p) => p.score > 0);
    const bestStatus = present
      .slice()
      .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status])[0].status;

    const rep = group.listtube ?? group.anilist ?? group.mal!;
    diffs.push({
      key,
      title: rep.title,
      cover: rep.cover,
      mediaType: rep.mediaType,
      listtube: group.listtube,
      anilist: group.anilist,
      mal: group.mal,
      recommended: {
        status: bestStatus,
        progress: maxProgress,
        score: bestScoreItem?.score ?? 0,
      },
      mismatchReasons,
    });
  }

  return diffs.sort((a, b) => b.mismatchReasons.length - a.mismatchReasons.length);
}
