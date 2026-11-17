import React, { useEffect, useMemo, useState } from 'react';
import { Bell, BookOpen, Calendar, Clock, Film, RefreshCw } from 'lucide-react';
import { Anime, LibraryState, MediaType, ScheduleItem } from '../types';
import {
  fetchAiringSchedule,
  fetchMangaReleaseSchedule,
  MangaScheduleItem,
} from '../services/anilist';
import { franchiseNameOf } from '../services/franchise';

interface ScheduleViewProps {
  libraryState: LibraryState;
  mediaType?: MediaType;
  query: string;
  onOpen: (anime: Anime) => void;
  onOpenChannel: (anime: Anime) => void;
  onQuickAdd: (anime: Anime) => void;
}

function formatDayLabel(timestampSec: number): string {
  const date = new Date(timestampSec * 1000);
  const now = new Date();
  const diffDays = Math.floor(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatTime(timestampSec: number): string {
  return new Date(timestampSec * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCountdown(timestampSec: number): string {
  const diff = timestampSec * 1000 - Date.now();
  if (diff <= 0) return 'Aired';
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `in ${days}d ${hours % 24}h`;
  }
  return hours > 0 ? `in ${hours}h ${mins}m` : `in ${mins}m`;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  libraryState,
  mediaType = 'ANIME',
  query,
  onOpen,
  onOpenChannel,
  onQuickAdd,
}) => {
  const [mode, setMode] = useState<MediaType>(mediaType);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [mangaItems, setMangaItems] = useState<MangaScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlySubscribed, setOnlySubscribed] = useState(false);

  useEffect(() => {
    setMode(mediaType);
  }, [mediaType]);

  const load = (targetMode: MediaType = mode) => {
    setLoading(true);
    if (targetMode === 'MANGA') {
      fetchMangaReleaseSchedule()
        .then(setMangaItems)
        .catch(() => setMangaItems([]))
        .finally(() => setLoading(false));
    } else {
      fetchAiringSchedule()
        .then(setItems)
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    load(mode);
  }, [mode]);

  const normalizedQuery = query.trim().toLowerCase();

  const grouped = useMemo(() => {
    const filtered = items.filter((item) => {
      if (onlySubscribed && !libraryState.entries[item.anime.id]) return false;
      if (!normalizedQuery) return true;
      const ch = franchiseNameOf(item.anime.title).toLowerCase();
      return (
        item.anime.title.toLowerCase().includes(normalizedQuery) ||
        ch.includes(normalizedQuery)
      );
    });

    const map = new Map<string, ScheduleItem[]>();
    for (const item of filtered) {
      const label = formatDayLabel(item.airingAt);
      const bucket = map.get(label) ?? [];
      bucket.push(item);
      map.set(label, bucket);
    }
    return [...map.entries()];
  }, [items, onlySubscribed, normalizedQuery, libraryState.entries]);

  const groupedManga = useMemo(() => {
    const filtered = mangaItems.filter((item) => {
      if (onlySubscribed && !libraryState.entries[item.anime.id]) return false;
      if (!normalizedQuery) return true;
      const ch = franchiseNameOf(item.anime.title).toLowerCase();
      return (
        item.anime.title.toLowerCase().includes(normalizedQuery) ||
        ch.includes(normalizedQuery)
      );
    });

    const map = new Map<string, MangaScheduleItem[]>();
    for (const item of filtered) {
      const bucket = map.get(item.group) ?? [];
      bucket.push(item);
      map.set(item.group, bucket);
    }
    return [...map.entries()];
  }, [mangaItems, onlySubscribed, normalizedQuery, libraryState.entries]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 bg-[#0F0F0F] px-4 pb-28 pt-5 text-white sm:px-6 lg:px-8 lg:pb-16 min-h-screen">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-black tracking-tight text-white">
            <Calendar className="h-5 w-5 text-[#FF0000]" />
            {mode === 'MANGA' ? 'Manga Release Schedule' : 'Airing Schedule'}
          </h1>
          <p className="mt-0.5 text-[12px] text-[#AAAAAA]">
            {mode === 'MANGA'
              ? 'Live ongoing serializations, weekly manhwa & upcoming debuts powered by AniList'
              : 'Live 7-day official broadcast countdowns powered by AniList'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-full border border-white/[0.12] bg-[#181818] p-0.5">
            <button
              type="button"
              onClick={() => setMode('ANIME')}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-bold transition ${
                mode === 'ANIME' ? 'bg-[#FF0000] text-white' : 'text-[#AAAAAA] hover:text-white'
              }`}
            >
              <Film className="h-3 w-3" />
              Anime
            </button>
            <button
              type="button"
              onClick={() => setMode('MANGA')}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-bold transition ${
                mode === 'MANGA' ? 'bg-[#FF0000] text-white' : 'text-[#AAAAAA] hover:text-white'
              }`}
            >
              <BookOpen className="h-3 w-3" />
              Manga
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOnlySubscribed(!onlySubscribed)}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${
              onlySubscribed
                ? 'bg-[#FF0000] text-white'
                : 'border border-white/[0.12] bg-[#272727] text-neutral-200 hover:bg-[#383838]'
            }`}
          >
            Subscribed Only
          </button>
          <button
            type="button"
            onClick={() => load(mode)}
            className="rounded-full border border-white/[0.12] bg-[#272727] p-2 text-white hover:bg-[#383838]"
            aria-label="Refresh schedule"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-2xl bg-[#1A1A1A]" />
          ))}
        </div>
      ) : mode === 'MANGA' ? (
        groupedManga.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#1A1A1A] p-10 text-center">
            <Clock className="mx-auto mb-3 h-10 w-10 text-[#AAAAAA]/50" />
            <p className="text-[14px] font-bold text-white">
              {onlySubscribed ? 'None of your subscribed manga are currently ongoing' : 'No ongoing manga found'}
            </p>
            {onlySubscribed && (
              <button
                type="button"
                onClick={() => setOnlySubscribed(false)}
                className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              >
                Show All Ongoing Manga
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {groupedManga.map(([groupLabel, list]) => (
              <section key={groupLabel} className="space-y-3">
                <h2 className="text-[15px] font-bold text-white">{groupLabel}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {list.map((item) => {
                    const isSub = Boolean(libraryState.entries[item.anime.id]);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#1A1A1A] p-3 transition hover:border-white/[0.16] hover:bg-[#222222]"
                      >
                        <button
                          type="button"
                          onClick={() => onOpen(item.anime)}
                          className="relative h-24 w-16 shrink-0 overflow-hidden rounded-xl bg-[#121216]"
                        >
                          <img
                            src={item.anime.cover}
                            alt={item.anime.title}
                            className="h-full w-full object-cover"
                          />
                          <span className="lt-overlay-badge absolute bottom-1 right-1 rounded bg-black/85 px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                            {item.badge}
                          </span>
                        </button>

                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => onOpen(item.anime)}
                            className="line-clamp-2 text-left text-[13px] font-bold text-white hover:underline"
                          >
                            {item.anime.title}
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenChannel(item.anime)}
                            className="mt-0.5 block max-w-full truncate text-left text-[11px] font-medium text-[#AAAAAA] hover:text-white hover:underline"
                          >
                            {franchiseNameOf(item.anime.title)}
                          </button>
                          <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-emerald-400 font-medium">
                            <BookOpen className="h-3 w-3 text-[#FF0000]" />
                            <span className="truncate">{item.subtitle}</span>
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onQuickAdd(item.anime)}
                          title={isSub ? 'Subscribed' : 'Subscribe'}
                          className={`shrink-0 rounded-full p-2 transition ${
                            isSub
                              ? 'bg-[#FF0000]/20 text-[#FF0000]'
                              : 'bg-[#272727] text-neutral-300 hover:bg-[#FF0000] hover:text-white'
                          }`}
                        >
                          <Bell className={`h-4 w-4 ${isSub ? 'fill-current' : ''}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#1A1A1A] p-10 text-center">
          <Clock className="mx-auto mb-3 h-10 w-10 text-[#AAAAAA]/50" />
          <p className="text-[14px] font-bold text-white">
            {onlySubscribed ? 'None of your subscribed anime air this week' : 'No schedule entries found'}
          </p>
          {onlySubscribed && (
            <button
              type="button"
              onClick={() => setOnlySubscribed(false)}
              className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
            >
              Show All Airing Anime
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, list]) => (
            <section key={day} className="space-y-3">
              <h2 className="text-[15px] font-bold text-white">{day}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((item) => {
                  const isSub = Boolean(libraryState.entries[item.anime.id]);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#1A1A1A] p-3 transition hover:border-white/[0.16] hover:bg-[#222222]"
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(item.anime)}
                        className="relative aspect-video h-20 w-32 shrink-0 overflow-hidden rounded-xl bg-[#121216]"
                      >
                        {item.anime.hasOfficialBanner && item.anime.banner && item.anime.banner !== item.anime.cover ? (
                          <img
                            src={item.anime.banner}
                            alt={item.anime.title}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <>
                            <img
                              src={item.anime.cover}
                              alt=""
                              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-md"
                            />
                            <div className="absolute inset-0 z-[1] flex items-center justify-center">
                              <img
                                src={item.anime.cover}
                                alt={item.anime.title}
                                className="h-full w-auto max-w-[72%] object-contain"
                              />
                            </div>
                          </>
                        )}
                        <span className="absolute bottom-1 right-1 z-[2] rounded bg-black/85 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          EP {item.episode}
                        </span>
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onOpen(item.anime)}
                          className="line-clamp-2 text-left text-[13px] font-bold text-white hover:underline"
                        >
                          {item.anime.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenChannel(item.anime)}
                          className="mt-0.5 block max-w-full truncate text-left text-[11px] font-medium text-[#AAAAAA] hover:text-white hover:underline"
                        >
                          {franchiseNameOf(item.anime.title)}
                        </button>
                        <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-[#AAAAAA]">
                          <Clock className="h-3 w-3 text-[#FF0000]" />
                          <span>{formatTime(item.airingAt)}</span>
                          <span>•</span>
                          <span className="font-semibold text-emerald-400">
                            {formatCountdown(item.airingAt)}
                          </span>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onQuickAdd(item.anime)}
                        title={isSub ? 'Subscribed' : 'Subscribe'}
                        className={`shrink-0 rounded-full p-2 transition ${
                          isSub
                            ? 'bg-[#FF0000]/20 text-[#FF0000]'
                            : 'bg-[#272727] text-neutral-300 hover:bg-[#FF0000] hover:text-white'
                        }`}
                      >
                        <Bell className={`h-4 w-4 ${isSub ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
