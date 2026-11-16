export type MediaType = 'ANIME' | 'MANGA';
export type MediaSource = 'anilist' | 'mal';

export interface StreamingLink {
  site: string;
  url: string;
  language?: string;
}

export interface RelatedTitle {
  id: string;
  title: string;
  cover: string;
  banner?: string;
  relation?: string;
  rating?: number;
  mediaType?: MediaType;
}

export interface Anime {
  /** Namespaced id, e.g. "anilist:21" or "mal:5114". */
  id: string;
  mediaType: MediaType;
  source: MediaSource;
  anilistId?: number;
  malId?: number;
  title: string;
  titleRomaji?: string;
  titleNative?: string;
  cover: string;
  banner: string;
  trailerThumbnail?: string;
  hasWideBanner?: boolean;
  hasOfficialBanner?: boolean;
  description: string;
  genres: string[];
  tags: string[];
  studios: string[];
  year?: number;
  season?: string;
  format?: string;
  countryOfOrigin?: string;
  mediaLabel?: string;
  episodes?: number;
  chapters?: number;
  volumes?: number;
  duration?: number;
  score?: number;
  popularity?: number;
  status?: string;
  trailerYoutubeId?: string;
  nextEpisode?: { number: number; airingAt: number };
  streaming: StreamingLink[];
  similar: RelatedTitle[];
  fetchedAt: number;
  /** Cached records referenced by the user's list must survive storage trimming. */
  pinned?: boolean;
}

export type ListStatus = 'watching' | 'completed' | 'planned' | 'on_hold' | 'dropped';

export interface ListEntry {
  animeId: string;
  mediaType?: MediaType;
  status: ListStatus;
  score?: number;
  progress?: number;
  addedAt: number;
  updatedAt: number;
}

export type FeedbackType =
  | 'open'
  | 'add'
  | 'rate'
  | 'progress'
  | 'complete'
  | 'hold'
  | 'drop'
  | 'not_interested';

export interface FeedbackEvent {
  animeId: string;
  type: FeedbackType;
  value?: number;
  at: number;
}

export interface TrackerAccount {
  provider: 'anilist' | 'mal';
  username: string;
  connectedAt: number;
  imported: number;
}

export interface LibraryState {
  entries: Record<string, ListEntry>;
  notInterested: string[];
  events: FeedbackEvent[];
  trackers: TrackerAccount[];
  interests: string[];
  mangaInterests?: string[];
  updatedAt: number;
}

export interface ScoredAnime {
  anime: Anime;
  score: number;
  reason: string;
}

export interface AppSettings {
  autoplayTrailer: boolean;
}

export interface ScheduleItem {
  id: string;
  airingAt: number;
  episode: number;
  anime: Anime;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  date: string;
  author?: string;
  excerpt: string;
  image?: string;
  animeTitle?: string;
  sourceName: string;
}

export const LIST_STATUS_LABEL: Record<ListStatus, string> = {
  watching: 'Watching',
  completed: 'Completed',
  planned: 'Plan to watch',
  on_hold: 'On hold',
  dropped: 'Dropped',
};

export const MANGA_STATUS_LABEL: Record<ListStatus, string> = {
  watching: 'Reading',
  completed: 'Completed',
  planned: 'Plan to read',
  on_hold: 'On hold',
  dropped: 'Dropped',
};

export function statusLabel(status: ListStatus, mediaType: MediaType = 'ANIME'): string {
  return mediaType === 'MANGA' ? MANGA_STATUS_LABEL[status] : LIST_STATUS_LABEL[status];
}

export const LIST_STATUS_ORDER: ListStatus[] = [
  'watching',
  'planned',
  'completed',
  'on_hold',
  'dropped',
];

export function mangaOriginLabel(item: {
  countryOfOrigin?: string;
  format?: string;
  mediaLabel?: string;
}): string {
  if (item.countryOfOrigin === 'KR') return 'MANHWA';
  if (item.countryOfOrigin === 'CN' || item.countryOfOrigin === 'TW') return 'MANHUA';
  if (item.countryOfOrigin === 'JP') return 'MANGA';
  if (item.mediaLabel && ['MANGA', 'MANHWA', 'MANHUA'].includes(item.mediaLabel)) {
    return item.mediaLabel;
  }
  const fmt = item.format?.toUpperCase();
  if (fmt === 'MANHWA') return 'MANHWA';
  if (fmt === 'MANHUA') return 'MANHUA';
  return item.mediaLabel || 'MANGA';
}
