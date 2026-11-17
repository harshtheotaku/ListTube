import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Clock,
  Cloud,
  CloudOff,
  Compass,
  Download,
  ExternalLink,
  Film,
  Heart,
  Loader2,
  MapPin,
  Newspaper,
  Pencil,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { LibraryState, ListEntry, MediaType, statusLabel } from '../types';
import { animeStore } from '../services/animeStore';
import { buildTasteProfile } from '../services/recommender';
import { library } from '../services/library';
import { BUILT_IN_AVATARS, useProfile } from '../services/profile';
import { cloudSync, useCloudSync } from '../services/cloudSync';
import { formatUserScore } from '../services/scoring';
import { useSettings } from '../services/settings';
import { toast } from './Toast';

interface YouViewProps {
  libraryState: LibraryState;
  mediaType: MediaType;
  onMediaTypeChange: (type: MediaType) => void;
  onOpenTrackers: () => void;
  onOpenSettings: () => void;
  onEditProfile: () => void;
  onOpenSchedule: () => void;
  onOpenNews: () => void;
  onExplore: () => void;
  onOpenFeed?: () => void;
  onOpenAnime?: (animeId: string) => void;
}

type ChannelTab = 'overview' | 'stats' | 'favorites' | 'about';

const CARD = 'rounded-2xl border border-white/[0.08] bg-[#181818] p-4 sm:p-5';

interface MalMediaStats {
  total: number;
  watching: number;
  completed: number;
  onHold: number;
  dropped: number;
  planned: number;
  days: number;
  meanScore: number;
  scoredCount: number;
  units: number;
  scoreDist: Record<number, number>;
}

function computeMalStats(entries: Record<string, ListEntry>, targetType: MediaType): MalMediaStats {
  const list = Object.values(entries).filter((e) => {
    const a = animeStore.get(e.animeId);
    return (a?.mediaType ?? e.mediaType ?? 'ANIME') === targetType;
  });

  let minutes = 0;
  let units = 0;
  let scoreSum = 0;
  let scoredCount = 0;
  const scoreDist: Record<number, number> = { 10: 0, 9: 0, 8: 0, 7: 0, 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  let watching = 0;
  let completed = 0;
  let onHold = 0;
  let dropped = 0;
  let planned = 0;

  for (const e of list) {
    if (e.status === 'watching') watching++;
    else if (e.status === 'completed') completed++;
    else if (e.status === 'on_hold') onHold++;
    else if (e.status === 'dropped') dropped++;
    else if (e.status === 'planned') planned++;

    const a = animeStore.get(e.animeId);
    const prog = e.progress ?? 0;
    units += prog;
    minutes += prog * (targetType === 'MANGA' ? 8 : a?.duration ?? 24);

    if (e.score && e.score > 0) {
      scoreSum += e.score;
      scoredCount += 1;
      const bucket = Math.min(10, Math.max(1, Math.round(e.score)));
      scoreDist[bucket] = (scoreDist[bucket] ?? 0) + 1;
    }
  }

  return {
    total: list.length,
    watching,
    completed,
    onHold,
    dropped,
    planned,
    days: Math.round((minutes / 1440) * 10) / 10,
    meanScore: scoredCount > 0 ? Math.round((scoreSum / scoredCount) * 100) / 100 : 0,
    scoredCount,
    units,
    scoreDist,
  };
}

function formatTimeAgo(ts: number): string {
  const sec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return 'Just now';
  const mins = Math.floor(sec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

const MalDistributionBar: React.FC<{ stats: MalMediaStats; isManga: boolean }> = ({ stats, isManga }) => {
  const denom = Math.max(stats.total, 1);
  const segs = [
    { key: 'watching', label: isManga ? 'Reading' : 'Watching', count: stats.watching, color: 'bg-emerald-500' },
    { key: 'completed', label: 'Completed', count: stats.completed, color: 'bg-sky-500' },
    { key: 'onHold', label: 'On-Hold', count: stats.onHold, color: 'bg-amber-400' },
    { key: 'dropped', label: 'Dropped', count: stats.dropped, color: 'bg-rose-500' },
    { key: 'planned', label: isManga ? 'Plan to Read' : 'Plan to Watch', count: stats.planned, color: 'bg-neutral-500' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.08]">
        {stats.total > 0 &&
          segs.map((s) =>
            s.count > 0 ? (
              <div
                key={s.key}
                className={s.color}
                style={{ width: `${(s.count / denom) * 100}%` }}
                title={`${s.label}: ${s.count}`}
              />
            ) : null
          )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px] sm:grid-cols-3">
        {segs.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[#AAAAAA]">
              <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
              {s.label}
            </span>
            <span className="font-bold text-white">{s.count}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#AAAAAA]">Total Entries</span>
          <span className="font-bold text-white">{stats.total}</span>
        </div>
      </div>
    </div>
  );
};

export const YouView: React.FC<YouViewProps> = ({
  libraryState,
  mediaType,
  onMediaTypeChange,
  onOpenTrackers,
  onOpenSettings,
  onEditProfile,
  onOpenSchedule,
  onOpenNews,
  onExplore,
  onOpenFeed,
  onOpenAnime,
}) => {
  const settings = useSettings();
  const [channelTab, setChannelTab] = useState<ChannelTab>('overview');
  const [confirmClear, setConfirmClear] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [selectedFavCharId, setSelectedFavCharId] = useState<string | null>(null);
  const isManga = mediaType === 'MANGA';

  const animeStats = useMemo(() => computeMalStats(libraryState.entries, 'ANIME'), [libraryState.entries]);
  const mangaStats = useMemo(() => computeMalStats(libraryState.entries, 'MANGA'), [libraryState.entries]);
  const activeStats = isManga ? mangaStats : animeStats;

  const recentUpdates = useMemo(
    () =>
      Object.values(libraryState.entries)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 5)
        .map((entry) => ({ entry, media: animeStore.get(entry.animeId) }))
        .filter((x) => Boolean(x.media)),
    [libraryState.entries]
  );

  const profile = useMemo(
    () => buildTasteProfile(libraryState, mediaType),
    [libraryState, mediaType]
  );
  const topGenres = profile.topGenres.slice(0, 6);
  const maxWeight = topGenres[0]?.weight ?? 1;

  const topStudios = useMemo(
    () =>
      Object.entries(profile.vector.studios)
        .filter(([, weight]) => weight > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name]) => name),
    [profile]
  );

  const connected = libraryState.trackers[0];
  const profileData = useProfile();
  const cloud = useCloudSync();

  const favAnime = useMemo(
    () =>
      (profileData.favoriteAnimeIds ?? [])
        .map((id) => animeStore.get(id))
        .filter((a): a is NonNullable<typeof a> => Boolean(a)),
    [profileData.favoriteAnimeIds]
  );
  const favManga = useMemo(
    () =>
      (profileData.favoriteMangaIds ?? [])
        .map((id) => animeStore.get(id))
        .filter((a): a is NonNullable<typeof a> => Boolean(a)),
    [profileData.favoriteMangaIds]
  );
  const favChars = useMemo(() => {
    const fromData = (profileData.favoriteCharactersData ?? []).map((c) => ({
      id: String(c.id),
      name: c.name,
      series: c.mediaTitle || 'Character',
      url: c.image,
    }));
    const fromPresets = (profileData.favoriteCharacters ?? [])
      .map((id) => BUILT_IN_AVATARS.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    const seen = new Set<string>();
    return [...fromData, ...fromPresets].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [profileData.favoriteCharacters, profileData.favoriteCharactersData]);

  const likedItems = useMemo(
    () =>
      (libraryState.likedIds ?? [])
        .map((id) => animeStore.get(id))
        .filter((a): a is NonNullable<typeof a> => Boolean(a)),
    [libraryState.likedIds]
  );

  const exportData = () => {
    const blob = new Blob([library.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `listtube-list-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast('Exported list backup to JSON');
  };

  const handleGoogleLogin = async () => {
    setGoogleBusy(true);
    try {
      await cloudSync.signInWithGoogle();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Google sign-in failed');
      setGoogleBusy(false);
    }
  };

  const joinedLabel = profileData.joinedAt
    ? new Date(profileData.joinedAt).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      })
    : '2026';

  const maxScoreCount = Math.max(1, ...Object.values(activeStats.scoreDist));

  return (
    <div className="mx-auto min-h-screen max-w-4xl space-y-5 bg-[#0F0F0F] px-4 pb-24 pt-4 text-white sm:px-6 lg:px-8 lg:pb-16">
      {/* YouTube Channel Banner + Header */}
      <div className="space-y-4">
        <div className="relative h-28 w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-r from-[#221114] via-[#18181B] to-[#121826] sm:h-40">
          {profileData.bannerUrl && (
            <img
              src={profileData.bannerUrl}
              alt="Channel banner"
              className="h-full w-full object-cover opacity-80"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0F0F0F]/85 via-black/20 to-transparent" />
          <button
            type="button"
            onClick={onEditProfile}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-md transition hover:bg-black/90"
          >
            <Pencil className="h-3 w-3" />
            Customize Channel
          </button>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 px-1">
          <div className="flex items-start gap-3.5 sm:items-center">
            <img
              src={profileData.avatarUrl}
              alt={profileData.name}
              className="-mt-10 relative z-10 h-20 w-20 shrink-0 rounded-full border-4 border-[#0F0F0F] object-cover bg-[#272727] shadow-xl sm:-mt-12 sm:h-24 sm:w-24"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[20px] font-black tracking-tight text-white sm:text-[24px]">
                  {profileData.name}
                </h1>
                <button
                  type="button"
                  onClick={onEditProfile}
                  aria-label="Edit profile and PFP"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-[#272727] text-[#AAAAAA] transition hover:bg-[#383838] hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[#AAAAAA]">
                <span className="font-semibold text-neutral-300">{profileData.handle}</span>
                <span>·</span>
                <span>
                  {animeStats.total} Anime · {mangaStats.total} Manga
                </span>
                {profileData.location ? (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {profileData.location}
                    </span>
                  </>
                ) : null}
                <span>· Joined {joinedLabel}</span>
              </p>
              {profileData.bio && (
                <p className="mt-1.5 line-clamp-2 max-w-xl text-[12.5px] leading-snug text-neutral-300">
                  {profileData.bio}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 rounded-full bg-[#272727] px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-[#383838]"
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </button>
            <button
              type="button"
              onClick={onOpenTrackers}
              className="rounded-full bg-[#F1F1F1] px-4 py-2 text-[12px] font-bold text-[#0F0F0F] transition hover:bg-white"
            >
              {connected || cloud.isLinked ? 'Manage Sync' : 'Connect Account'}
            </button>
          </div>
        </div>
      </div>

      {/* YouTube Channel Navigation Tabs */}
      <div className="flex items-center gap-6 overflow-x-auto border-b border-white/[0.1] px-1 no-scrollbar">
        {([
          { id: 'overview', label: 'Overview' },
          { id: 'stats', label: 'Statistics & DNA' },
          {
            id: 'favorites',
            label: `Favorites (${favAnime.length + favManga.length + favChars.length})`,
          },
          { id: 'about', label: 'About & Hub' },
        ] as { id: ChannelTab; label: string }[]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setChannelTab(tab.id)}
            className={`shrink-0 border-b-2 pb-2.5 text-[13px] font-bold transition ${
              channelTab === tab.id
                ? 'border-white text-white'
                : 'border-transparent text-[#AAAAAA] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: OVERVIEW */}
      {channelTab === 'overview' && (
        <div className="space-y-5">
          {/* MAL Signature Dual Anime & Manga Statistics Card */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Anime Stats */}
            <div className={CARD}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-white">
                  <Film className="h-4 w-4 text-[#FF0000]" />
                  Anime Stats
                </h2>
                <div className="flex items-center gap-3 text-[12px]">
                  <span className="text-[#AAAAAA]">
                    Days: <strong className="text-white">{animeStats.days}</strong>
                  </span>
                  <span className="text-[#AAAAAA]">
                    Mean: <strong className="text-amber-300">{animeStats.meanScore || '—'}</strong>
                  </span>
                </div>
              </div>
              <MalDistributionBar stats={animeStats} isManga={false} />
            </div>

            {/* Manga Stats */}
            <div className={CARD}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-white">
                  <BookOpen className="h-4 w-4 text-[#3EA6FF]" />
                  Manga Stats
                </h2>
                <div className="flex items-center gap-3 text-[12px]">
                  <span className="text-[#AAAAAA]">
                    Days: <strong className="text-white">{mangaStats.days}</strong>
                  </span>
                  <span className="text-[#AAAAAA]">
                    Mean: <strong className="text-amber-300">{mangaStats.meanScore || '—'}</strong>
                  </span>
                </div>
              </div>
              <MalDistributionBar stats={mangaStats} isManga={true} />
            </div>
          </div>

          {/* Last List Updates (MAL-style Activity Stream in YouTube style) */}
          <div className={CARD}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-white">
                <Clock className="h-4 w-4 text-[#3EA6FF]" />
                Last List Updates
              </h2>
              <span className="text-[11px] text-[#AAAAAA]">{recentUpdates.length} recent</span>
            </div>
            {recentUpdates.length === 0 ? (
              <p className="text-[12px] text-[#AAAAAA]">
                No updates yet — subscribe or log episodes/chapters to see live activity here.
              </p>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {recentUpdates.map(({ entry, media }) => {
                  if (!media) return null;
                  const unitLabel = media.mediaType === 'MANGA' ? 'ch' : 'ep';
                  const total = media.mediaType === 'MANGA' ? media.chapters : media.episodes;
                  return (
                    <button
                      key={entry.animeId}
                      type="button"
                      onClick={() => onOpenAnime?.(media.id)}
                      className="flex items-center gap-3 rounded-xl bg-[#222222]/80 p-2.5 text-left transition hover:bg-[#2C2C2C]"
                    >
                      <img
                        src={media.cover}
                        alt={media.title}
                        className="h-14 w-10 shrink-0 rounded-lg object-cover bg-black"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-white">{media.title}</p>
                        <p className="mt-0.5 text-[11px] text-[#AAAAAA]">
                          {statusLabel(entry.status, media.mediaType)}
                          {typeof entry.progress === 'number'
                            ? ` · ${entry.progress}${total ? `/${total}` : ''} ${unitLabel}`
                            : ''}
                          {entry.score ? ` · ★ ${formatUserScore(entry.score, settings.scoreFormat)}` : ''}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[#777777]">
                          {formatTimeAgo(entry.updatedAt)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Favorites Preview Strip */}
          <div className={CARD}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-white">
                <Heart className="h-4 w-4 text-rose-400 fill-current" />
                Channel Favorites Showcase
              </h2>
              <button
                type="button"
                onClick={onEditProfile}
                className="text-[11.5px] font-bold text-[#3EA6FF] hover:underline"
              >
                Edit Favorites
              </button>
            </div>
            {favAnime.length === 0 && favManga.length === 0 && favChars.length === 0 ? (
              <p className="text-[12px] text-[#AAAAAA]">
                Feature your top anime, manga, and favorite characters here from any Watch page or Customize Channel.
              </p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                {[...favAnime, ...favManga].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpenAnime?.(item.id)}
                    className="w-24 shrink-0 text-left group"
                  >
                    <img
                      src={item.cover}
                      alt={item.title}
                      className="aspect-[3/4] w-24 rounded-xl border border-white/10 object-cover transition group-hover:scale-[1.03]"
                    />
                    <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-neutral-200">
                      {item.title}
                    </p>
                  </button>
                ))}
                {favChars.map((ch) => (
                  <div key={ch.id} className="flex w-20 shrink-0 flex-col items-center text-center">
                    <img
                      src={ch.url}
                      alt={ch.name}
                      className="h-16 w-16 rounded-full border-2 border-white/15 object-cover bg-black"
                    />
                    <p className="mt-1.5 line-clamp-1 text-[11px] font-semibold text-neutral-200">
                      {ch.name}
                    </p>
                    <p className="line-clamp-1 text-[9.5px] text-[#AAAAAA]">{ch.series}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Google Account & Multi-Device Profile Sync */}
          <div className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {cloud.state === 'offline' ? (
                  <CloudOff className="h-4 w-4 text-[#AAAAAA]" />
                ) : (
                  <Cloud
                    className={`h-4 w-4 ${cloud.isLinked ? 'text-emerald-400' : 'text-[#3EA6FF]'}`}
                  />
                )}
                <p className="text-[12px] font-bold uppercase tracking-wider text-white">
                  Google Account &amp; Cloud Profile
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
                    cloud.state === 'synced'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : cloud.state === 'syncing'
                      ? 'bg-amber-500/15 text-amber-300'
                      : cloud.state === 'error'
                      ? 'bg-rose-500/15 text-rose-300'
                      : 'bg-white/10 text-[#AAAAAA]'
                  }`}
                >
                  {cloud.state === 'synced'
                    ? 'Synced with Google'
                    : cloud.state === 'syncing'
                    ? 'Syncing…'
                    : cloud.state === 'error'
                    ? 'Sync Error'
                    : cloud.state === 'offline'
                    ? 'Offline'
                    : 'Not Signed In'}
                </span>
                {cloud.isLinked && (
                  <button
                    type="button"
                    disabled={cloud.state === 'syncing'}
                    onClick={() => void cloudSync.syncNow()}
                    className="flex items-center gap-1 rounded-full bg-[#272727] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#383838] disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${cloud.state === 'syncing' ? 'animate-spin' : ''}`}
                    />
                    Refresh
                  </button>
                )}
              </div>
            </div>

            <p className="mt-1 text-[11.5px] text-[#AAAAAA]">
              Connect with Google to keep your watchlist, decimal ratings, likes, reviews, comments, followers, and channel customization across devices.
            </p>

            {cloud.userEmail ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-[#121212] px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                  <p className="truncate text-[13px] font-bold text-white">{cloud.userEmail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void cloudSync.signOut();
                    toast('Signed out of Google');
                  }}
                  className="text-[11.5px] font-bold text-rose-400 hover:underline"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={googleBusy}
                  onClick={handleGoogleLogin}
                  className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-[12.5px] font-bold text-[#111111] transition hover:bg-neutral-200 disabled:opacity-50"
                >
                  {googleBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>Continue with Google</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenTrackers}
                  className="rounded-xl bg-[#272727] px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-[#383838]"
                >
                  Connect Username / OAuth
                </button>
              </div>
            )}
          </div>

          {/* Mode Switch & Quick Hub */}
          <div className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-wider text-white">
                  Library Mode
                </p>
                <p className="text-[11.5px] text-[#AAAAAA]">
                  Switch between 16:9 Anime &amp; 4:5 Manga feeds
                </p>
              </div>
              <div
                className="flex items-center rounded-full border border-white/[0.12] bg-[#0F0F0F] p-1"
                role="group"
                aria-label="Media Mode"
              >
                <button
                  type="button"
                  onClick={() => onMediaTypeChange('ANIME')}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-bold transition ${
                    mediaType === 'ANIME'
                      ? 'bg-[#FF0000] text-white shadow'
                      : 'text-[#AAAAAA] hover:text-white'
                  }`}
                >
                  <Film className="h-3.5 w-3.5" />
                  Anime
                </button>
                <button
                  type="button"
                  onClick={() => onMediaTypeChange('MANGA')}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-bold transition ${
                    mediaType === 'MANGA'
                      ? 'bg-[#FF0000] text-white shadow'
                      : 'text-[#AAAAAA] hover:text-white'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Manga
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/[0.08] pt-4">
              {onOpenFeed && (
                <button
                  type="button"
                  onClick={onOpenFeed}
                  className="flex flex-col items-center gap-1.5 rounded-xl bg-[#272727]/80 px-2 py-3 text-[11.5px] font-semibold text-white transition hover:bg-[#383838]"
                >
                  <Users className="h-4 w-4 text-rose-400" />
                  <span>Community</span>
                </button>
              )}
              <button
                type="button"
                onClick={onOpenSchedule}
                className="flex flex-col items-center gap-1.5 rounded-xl bg-[#272727]/80 px-2 py-3 text-[11.5px] font-semibold text-white transition hover:bg-[#383838]"
              >
                <CalendarDays className="h-4 w-4 text-[#FF0000]" />
                <span>Schedule</span>
              </button>
              <button
                type="button"
                onClick={onOpenNews}
                className="flex flex-col items-center gap-1.5 rounded-xl bg-[#272727]/80 px-2 py-3 text-[11.5px] font-semibold text-white transition hover:bg-[#383838]"
              >
                <Newspaper className="h-4 w-4 text-[#3EA6FF]" />
                <span>News</span>
              </button>
              <button
                type="button"
                onClick={onExplore}
                className="flex flex-col items-center gap-1.5 rounded-xl bg-[#272727]/80 px-2 py-3 text-[11.5px] font-semibold text-white transition hover:bg-[#383838]"
              >
                <Compass className="h-4 w-4 text-emerald-400" />
                <span>Explore</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: STATISTICS & TASTE DNA */}
      {channelTab === 'stats' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className={CARD}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                {isManga ? 'Manga' : 'Anime'}
              </p>
              <p className="mt-1 text-[22px] font-black text-white">{activeStats.total}</p>
              <p className="text-[11px] text-[#AAAAAA]">
                {activeStats.watching} {isManga ? 'reading' : 'watching'}
              </p>
            </div>
            <div className={CARD}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                {isManga ? 'Days Read' : 'Days Watched'}
              </p>
              <p className="mt-1 text-[22px] font-black text-[#FF0000]">{activeStats.days}</p>
              <p className="text-[11px] text-[#AAAAAA]">
                {activeStats.units.toLocaleString()} {isManga ? 'chapters' : 'episodes'}
              </p>
            </div>
            <div className={CARD}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">Mean Score</p>
              <p className="mt-1 text-[22px] font-black text-amber-300">
                {activeStats.meanScore || '—'}
              </p>
              <p className="text-[11px] text-[#AAAAAA]">{activeStats.scoredCount} rated</p>
            </div>
            <div className={CARD}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">Completed</p>
              <p className="mt-1 text-[22px] font-black text-emerald-400">{activeStats.completed}</p>
              <p className="text-[11px] text-[#AAAAAA]">Series finished</p>
            </div>
          </div>

          {/* Score Distribution Histogram */}
          <div className={CARD}>
            <div className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-white">
              <BarChart3 className="h-4 w-4 text-amber-300" />
              {isManga ? 'Manga' : 'Anime'} Score Distribution
            </div>
            <div className="space-y-1.5">
              {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => {
                const count = activeStats.scoreDist[score] ?? 0;
                return (
                  <div key={score} className="flex items-center gap-2.5 text-[11.5px]">
                    <span className="flex w-8 items-center gap-0.5 font-mono font-bold text-amber-300">
                      <Star className="h-3 w-3 fill-current" />
                      {score}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-amber-400/80"
                        style={{ width: `${(count / maxScoreCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-7 text-right font-mono text-[#AAAAAA]">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Taste Vector */}
          <div className={CARD}>
            <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-white">
              <Sparkles className="h-4 w-4 text-[#FF0000]" />
              Your {isManga ? 'Manga' : 'Anime'} Taste DNA
            </div>
            <p className="mt-1 text-[12px] text-[#AAAAAA]">
              This feature vector ranks your For You recommendations on every refresh.
            </p>

            {topGenres.length === 0 ? (
              <p className="mt-4 text-[12px] italic text-[#AAAAAA]">
                Subscribe to {isManga ? 'manga' : 'anime'} to build your taste profile.
              </p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {topGenres.map((g) => (
                  <div key={g.name} className="space-y-1">
                    <div className="flex justify-between text-[11.5px] font-bold">
                      <span className="text-white">{g.name}</span>
                      <span className="font-mono text-rose-400">
                        {Math.round((g.weight / maxWeight) * 100)}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#FF0000] to-orange-500"
                        style={{ width: `${Math.min(100, (g.weight / maxWeight) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {topStudios.length > 0 && (
              <div className="mt-4 flex items-center gap-2 border-t border-white/[0.08] pt-3 text-[11.5px] text-[#AAAAAA]">
                <span className="font-bold text-white">
                  {isManga ? 'Top Authors:' : 'Top Studios:'}
                </span>
                <span>{topStudios.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: FAVORITES */}
      {channelTab === 'favorites' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] text-[#AAAAAA]">
              Curated favorites pinned to your YouTube × MAL Channel profile.
            </p>
            <button
              type="button"
              onClick={onEditProfile}
              className="rounded-full bg-[#272727] px-3.5 py-1.5 text-[12px] font-bold text-white hover:bg-[#383838]"
            >
              Customize Favorites
            </button>
          </div>

          {favAnime.length > 0 && (
            <div className={CARD}>
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-white">
                Favorite Anime ({favAnime.length})
              </h2>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {favAnime.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onOpenAnime?.(a.id)}
                    className="group text-left"
                  >
                    <img
                      src={a.cover}
                      alt={a.title}
                      className="aspect-[3/4] w-full rounded-xl border border-white/10 object-cover transition group-hover:scale-[1.03]"
                    />
                    <p className="mt-1.5 line-clamp-2 text-[11.5px] font-semibold text-white">
                      {a.title}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {favManga.length > 0 && (
            <div className={CARD}>
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-white">
                Favorite Manga ({favManga.length})
              </h2>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {favManga.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onOpenAnime?.(m.id)}
                    className="group text-left"
                  >
                    <img
                      src={m.cover}
                      alt={m.title}
                      className="aspect-[3/4] w-full rounded-xl border border-white/10 object-cover transition group-hover:scale-[1.03]"
                    />
                    <p className="mt-1.5 line-clamp-2 text-[11.5px] font-semibold text-white">
                      {m.title}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {favChars.length > 0 && (
            <div className={CARD}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-white">
                  Favorite Characters ({favChars.length})
                </h2>
                <span className="text-[11px] text-[#AAAAAA]">
                  Tap character for Wikipedia / MAL links
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {favChars.map((ch) => {
                  const active = selectedFavCharId === ch.id;
                  const malUrl = `https://myanimelist.net/character.php?q=${encodeURIComponent(ch.name)}`;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        if (active) {
                          window.open(malUrl, '_blank', 'noopener,noreferrer');
                        } else {
                          setSelectedFavCharId(ch.id);
                        }
                      }}
                      className={`flex flex-col items-center rounded-2xl p-2 text-center transition ${
                        active ? 'bg-[#FF0000]/15 ring-1 ring-[#FF0000]/50' : 'hover:bg-white/[0.06]'
                      }`}
                    >
                      <img
                        src={ch.url}
                        alt={ch.name}
                        className="h-16 w-16 rounded-full border-2 border-white/15 object-cover bg-black"
                      />
                      <p className="mt-1.5 text-[12px] font-bold text-white">{ch.name}</p>
                      <p className="text-[10px] text-[#AAAAAA]">{ch.series}</p>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const picked = favChars.find((c) => c.id === selectedFavCharId);
                if (!picked) return null;
                const numericId = Number(picked.id);
                return (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#121212] px-3.5 py-2.5 text-[12px]">
                    <span className="font-bold text-white">
                      {picked.name} <span className="font-normal text-[#AAAAAA]">· {picked.series}</span>
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(`${picked.name} ${picked.series}`)}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/20"
                      >
                        Wikipedia <ExternalLink className="h-3 w-3" />
                      </a>
                      <a
                        href={`https://myanimelist.net/character.php?q=${encodeURIComponent(picked.name)}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 rounded-full bg-[#3EA6FF]/15 px-2.5 py-1 text-[11px] font-bold text-[#3EA6FF] hover:bg-[#3EA6FF]/25"
                      >
                        MyAnimeList <ExternalLink className="h-3 w-3" />
                      </a>
                      {Number.isFinite(numericId) && numericId > 0 && (
                        <a
                          href={`https://anilist.co/character/${numericId}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-neutral-200 hover:bg-white/20"
                        >
                          AniList <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedFavCharId(null)}
                        className="text-[11px] font-semibold text-[#AAAAAA] hover:text-white"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {likedItems.length > 0 && (
            <div className={CARD}>
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-white">
                Liked Titles ({likedItems.length})
              </h2>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {likedItems.slice(0, 12).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onOpenAnime?.(a.id)}
                    className="group text-left"
                  >
                    <img
                      src={a.cover}
                      alt={a.title}
                      className="aspect-[3/4] w-full rounded-xl border border-white/10 object-cover transition group-hover:scale-[1.03]"
                    />
                    <p className="mt-1.5 line-clamp-2 text-[11.5px] font-semibold text-white">
                      {a.title}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {favAnime.length === 0 && favManga.length === 0 && favChars.length === 0 && likedItems.length === 0 && (
            <div className={`${CARD} py-10 text-center`}>
              <Heart className="mx-auto mb-2.5 h-8 w-8 text-rose-400/50" />
              <p className="text-[14px] font-bold text-white">No Favorites Selected Yet</p>
              <p className="mt-1 text-[12px] text-[#AAAAAA]">
                Tap the Favorite heart on any anime or manga Watch page, or choose characters in Customize Channel.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB: ABOUT & DATA */}
      {channelTab === 'about' && (
        <div className="space-y-5">
          <div className={CARD}>
            <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-white">
              About Channel
            </h2>
            <p className="whitespace-pre-line text-[13px] text-neutral-200">
              {profileData.bio || 'No bio added yet.'}
            </p>
            <div className="mt-4 space-y-1.5 border-t border-white/[0.08] pt-3 text-[12px] text-[#AAAAAA]">
              <p>Handle: {profileData.handle}</p>
              {profileData.location && <p>Location: {profileData.location}</p>}
              <p>Joined: {joinedLabel}</p>
              <p>
                Google Account:{' '}
                {cloud.userEmail || 'Not signed in'}
              </p>
            </div>
          </div>

          <div className={CARD}>
            <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-white">
              Data &amp; Backup
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportData}
                className="flex items-center gap-1.5 rounded-xl bg-[#272727] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#383838]"
              >
                <Download className="h-3.5 w-3.5" />
                Export JSON Backup
              </button>

              {confirmClear ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      library.clearAll();
                      setConfirmClear(false);
                      toast('All data reset');
                    }}
                    className="rounded-xl bg-[#FF0000] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#CC0000]"
                  >
                    Confirm Delete All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="text-[12px] text-[#AAAAAA] hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Reset Local Data
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
