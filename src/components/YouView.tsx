import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  Compass,
  Download,
  Film,
  Newspaper,
  Settings,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import { LibraryState, MediaType } from '../types';
import { animeStore } from '../services/animeStore';
import { buildTasteProfile } from '../services/recommender';
import { library } from '../services/library';
import { useProfile } from '../services/profile';
import { toast } from './Toast';

interface YouViewProps {
  libraryState: LibraryState;
  mediaType: MediaType;
  onMediaTypeChange: (type: MediaType) => void;
  onOpenTrackers: () => void;
  onOpenSettings: () => void;
  onOpenSchedule: () => void;
  onOpenNews: () => void;
  onExplore: () => void;
}

const CARD = 'rounded-2xl border border-white/[0.08] bg-[#181818] p-4 sm:p-5';

export const YouView: React.FC<YouViewProps> = ({
  libraryState,
  mediaType,
  onMediaTypeChange,
  onOpenTrackers,
  onOpenSettings,
  onOpenSchedule,
  onOpenNews,
  onExplore,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const isManga = mediaType === 'MANGA';

  const stats = useMemo(() => {
    const entries = Object.values(libraryState.entries).filter((entry) => {
      const anime = animeStore.get(entry.animeId);
      return anime
        ? (anime.mediaType ?? 'ANIME') === mediaType
        : (entry.mediaType ?? 'ANIME') === mediaType;
    });

    const minutes = entries.reduce((total, entry) => {
      const anime = animeStore.get(entry.animeId);
      const perUnit = isManga ? 8 : anime?.duration ?? 24;
      return total + (entry.progress ?? 0) * perUnit;
    }, 0);

    return {
      tracked: entries.length,
      watching: entries.filter((entry) => entry.status === 'watching').length,
      completed: entries.filter((entry) => entry.status === 'completed').length,
      scored: entries.filter((entry) => entry.score).length,
      hours: Math.round(minutes / 60),
    };
  }, [libraryState.entries, mediaType, isManga]);

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
        .slice(0, 3)
        .map(([name]) => name),
    [profile]
  );

  const exportData = () => {
    const blob = new Blob([library.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `anitube-list-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast('Exported list backup to JSON');
  };

  const connected = libraryState.trackers[0];
  const profileData = useProfile();

  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-5 bg-[#0F0F0F] px-4 pb-24 pt-5 text-white sm:px-6 lg:px-8 lg:pb-16">
      {/* Profile Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
        <button
          type="button"
          onClick={onOpenSettings}
          title="Change profile & character avatar"
          className="group flex items-center gap-3 text-left"
        >
          <img
            src={profileData.avatarUrl}
            alt={profileData.name}
            className="h-14 w-14 shrink-0 rounded-full border-2 border-white/15 object-cover bg-[#272727] transition group-hover:border-[#FF0000]"
          />
          <div>
            <h1 className="text-[20px] font-black tracking-tight text-white">
              {connected ? `${profileData.name}` : profileData.name}
            </h1>
            <p className="text-[12px] text-[#AAAAAA]">
              {profileData.handle} ·{' '}
              {connected
                ? `Synced with ${connected.provider === 'anilist' ? 'AniList' : 'MyAnimeList'} (${connected.username})`
                : 'Tap to customize PFP & name'}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 rounded-full bg-[#272727] px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-[#383838]"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings &amp; PFP
          </button>
          <button
            type="button"
            onClick={onOpenTrackers}
            className="rounded-full bg-[#F1F1F1] px-4 py-2 text-[12px] font-bold text-[#0F0F0F] transition hover:bg-white"
          >
            {connected ? 'Manage Sync' : 'Connect Account'}
          </button>
        </div>
      </div>

      {/* Mode Switch & Quick Hub (Anime | Manga, Schedule, News, Explore) */}
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

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.08] pt-4">
          <button
            type="button"
            onClick={onOpenSchedule}
            className="flex flex-col items-center gap-1.5 rounded-xl bg-[#272727]/80 px-2 py-3 text-[12px] font-semibold text-white transition hover:bg-[#383838]"
          >
            <CalendarDays className="h-4 w-4 text-[#FF0000]" />
            <span>Schedule</span>
          </button>
          <button
            type="button"
            onClick={onOpenNews}
            className="flex flex-col items-center gap-1.5 rounded-xl bg-[#272727]/80 px-2 py-3 text-[12px] font-semibold text-white transition hover:bg-[#383838]"
          >
            <Newspaper className="h-4 w-4 text-[#3EA6FF]" />
            <span>News</span>
          </button>
          <button
            type="button"
            onClick={onExplore}
            className="flex flex-col items-center gap-1.5 rounded-xl bg-[#272727]/80 px-2 py-3 text-[12px] font-semibold text-white transition hover:bg-[#383838]"
          >
            <Compass className="h-4 w-4 text-emerald-400" />
            <span>Explore</span>
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={CARD}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
            {isManga ? 'Manga' : 'Anime'}
          </p>
          <p className="mt-1 text-[22px] font-black text-white">{stats.tracked}</p>
          <p className="text-[11px] text-[#AAAAAA]">
            {stats.watching} {isManga ? 'reading' : 'watching'}
          </p>
        </div>

        <div className={CARD}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">Completed</p>
          <p className="mt-1 text-[22px] font-black text-emerald-400">{stats.completed}</p>
          <p className="text-[11px] text-[#AAAAAA]">Series finished</p>
        </div>

        <div className={CARD}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
            {isManga ? 'Hours Read' : 'Hours Watched'}
          </p>
          <p className="mt-1 text-[22px] font-black text-[#FF0000]">{stats.hours}</p>
          <p className="text-[11px] text-[#AAAAAA]">Estimated time</p>
        </div>

        <div className={CARD}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">Scored</p>
          <p className="mt-1 text-[22px] font-black text-amber-300">{stats.scored}</p>
          <p className="text-[11px] text-[#AAAAAA]">Rated titles</p>
        </div>
      </div>

      {/* Algorithm Taste Vector */}
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

      {/* Data & Backup */}
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
  );
};
