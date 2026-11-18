export type MediaType = 'ANIME' | 'MANGA';
export type MediaSource = 'anilist' | 'mal';

export type ScoreFormat =
  | 'POINT_10_DECIMAL'
  | 'POINT_10'
  | 'POINT_100'
  | 'POINT_5';

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

export interface CharacterCredit {
  id: number;
  name: string;
  nativeName?: string;
  image: string;
  role: string;
  description?: string;
  siteUrl?: string;
  voiceActor?: {
    id?: number;
    name: string;
    image?: string;
    language?: string;
    siteUrl?: string;
  };
  englishVoiceActor?: {
    id?: number;
    name: string;
    image?: string;
    siteUrl?: string;
  };
}

export interface StaffCredit {
  id: number;
  name: string;
  nativeName?: string;
  image?: string;
  role: string;
  siteUrl?: string;
}

export interface PersonCreditWork {
  id: string;
  title: string;
  cover: string;
  mediaType: MediaType;
  role?: string;
  year?: number;
  score?: number;
  popularity?: number;
}

export interface StaffPersonDetail {
  id: number;
  name: string;
  nativeName?: string;
  image?: string;
  description?: string;
  primaryOccupations: string[];
  homeTown?: string;
  gender?: string;
  age?: number;
  yearsActive?: number[];
  favourites?: number;
  siteUrl?: string;
  works: PersonCreditWork[];
  hasMoreWorks?: boolean;
  totalWorks?: number;
}

export interface StaffSearchItem {
  id: number;
  name: string;
  nativeName?: string;
  image?: string;
  primaryOccupations: string[];
}

export interface CharacterDetailExtra {
  id: number;
  name?: string;
  nativeName?: string;
  image?: string;
  description?: string;
  gender?: string;
  age?: string;
  favourites?: number;
  siteUrl?: string;
  appearances: PersonCreditWork[];
}

export interface StudioDetail {
  id?: number;
  name: string;
  isAnimationStudio?: boolean;
  favourites?: number;
  siteUrl?: string;
  works: Anime[];
}

export interface ThemeSong {
  number: number;
  title: string;
  artists?: string;
  episodes?: string;
}

export interface ScoreDistBucket {
  score: number;
  amount: number;
}

export interface StatusDistBucket {
  status: string;
  amount: number;
}

export interface FavoriteCharacterItem {
  id: string | number;
  name: string;
  image: string;
  mediaTitle?: string;
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
  characters?: CharacterCredit[];
  staff?: StaffCredit[];
  openings?: ThemeSong[];
  endings?: ThemeSong[];
  scoreStats?: ScoreDistBucket[];
  statusStats?: StatusDistBucket[];
  fetchedAt: number;
  /** Cached records referenced by the user's list must survive storage trimming. */
  pinned?: boolean;
}

export type ListStatus = 'watching' | 'completed' | 'planned' | 'on_hold' | 'dropped';

export interface ListEntry {
  animeId: string;
  mediaType?: MediaType;
  status: ListStatus;
  /** Canonical 0.5..10 decimal score (e.g. 8.5 = 85/100 = 4.25/5★). */
  score?: number;
  progress?: number;
  progressVolumes?: number;
  repeat?: number;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
  isPrivate?: boolean;
  customLists?: string[];
  priority?: 0 | 1 | 2;
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
  | 'not_interested'
  | 'like';

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
  oauthConnected?: boolean;
  avatar?: string;
}

export interface LibraryState {
  entries: Record<string, ListEntry>;
  likedIds: string[];
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

export type ThemePreset = 'main' | 'dark' | 'light' | 'custom';
export type ContentFilterLevel = 'safe' | 'balanced' | 'mature';
export type FontStylePreset = 'default' | 'rounded' | 'serif' | 'mono';
export type ExternalLinkMode = 'external' | 'ask' | 'inapp';

export interface ThemeColors {
  bg: string;
  text: string;
  accent: string;
}

export interface ProfileVisibilitySettings {
  hideActivity: boolean;
  hideStats: boolean;
  hideLists: boolean;
  hideFavorites: boolean;
}

export interface AppSettings {
  autoplayTrailer: boolean;
  scoreFormat: ScoreFormat;
  showCommunityLinks: boolean;
  liquidGlass: boolean;
  themePreset: ThemePreset;
  themeColors: ThemeColors;
  fontFamily: FontStylePreset;
  reduceMotion: boolean;
  reduceBlur: boolean;
  disableBlend: boolean;
  autoHideBars: boolean;
  ambientMode: boolean;
  dimAmbientOnScroll: boolean;
  autoSkipFillerNotice: boolean;
  externalLinkMode: ExternalLinkMode;
  contentFilter: ContentFilterLevel;
  blockedGenres: string[];
  showHomeForYou: boolean;
  showHomeSubscriptions: boolean;
  showHomeDiscoveryShelves: boolean;
  homeStatusFolders: ListStatus[];
  autoLoadComments: boolean;
  autoClearCache: boolean;
  notifyFolders: ListStatus[];
  notifyCommentLikes: boolean;
  profileVisibility: ProfileVisibilitySettings;
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

export type ReviewVerdict = 'Recommended' | 'Mixed Feelings' | 'Not Recommended';

export interface UserReview {
  id: string;
  animeId: string;
  mediaType: MediaType;
  userId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  headline?: string;
  body: string;
  overallScore?: number;
  storyScore?: number;
  artScore?: number;
  soundScore?: number;
  enjoymentScore?: number;
  verdict: ReviewVerdict;
  isSpoiler: boolean;
  helpfulCount: number;
  votedByMe: boolean;
  source?: 'listtube' | 'anilist';
  externalUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export type ActivityKind = 'status' | 'progress' | 'score' | 'review' | 'post' | 'favorite';

export interface ActivityReply {
  id: string;
  activityId: string;
  userId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  body: string;
  createdAt: number;
}

export interface ActivityItem {
  id: string;
  userId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  kind: ActivityKind;
  animeId?: string;
  animeTitle?: string;
  animeCover?: string;
  mediaType?: MediaType;
  statusText: string;
  progress?: number;
  score?: number;
  likeCount: number;
  likedByMe: boolean;
  replies: ActivityReply[];
  source?: 'listtube' | 'anilist';
  externalUrl?: string;
  createdAt: number;
}

export interface EpisodePollSummary {
  mediaId: string;
  episodeNumber: number;
  average: number;
  totalVotes: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  myRating?: 1 | 2 | 3 | 4 | 5;
}

export interface WikipediaSummary {
  title: string;
  extract: string;
  description?: string;
  thumbnail?: string;
  url: string;
}

export interface SocialNotificationItem {
  id: string;
  kind: 'reply' | 'follow' | 'vote';
  title: string;
  subtitle: string;
  avatar?: string;
  createdAt: number;
  targetId?: string;
}

export interface PublicUserSummary {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  bannerUrl?: string;
  bio?: string;
  location?: string;
  favoriteAnimeIds: string[];
  favoriteMangaIds: string[];
  favoriteCharactersData: FavoriteCharacterItem[];
  profileVisibility?: ProfileVisibilitySettings;
  updatedAt: string;
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
