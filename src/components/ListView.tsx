import React, { useMemo, useState } from 'react';
import { Minus, Plus, Star, Tv } from 'lucide-react';
import {
  Anime,
  LibraryState,
  ListEntry,
  LIST_STATUS_ORDER,
  ListStatus,
  MediaType,
  statusLabel,
} from '../types';
import { animeStore } from '../services/animeStore';
import { library } from '../services/library';

interface ListViewProps {
  libraryState: LibraryState;
  mediaType: MediaType;
  onOpen: (anime: Anime) => void;
  onExplore: () => void;
}

type Filter = 'all' | ListStatus;

interface RowProps {
  anime: Anime;
  entry: ListEntry;
  onOpen: (anime: Anime) => void;
}

const Row: React.FC<RowProps> = ({ anime, entry, onOpen }) => {
  const isManga = (anime.mediaType ?? 'ANIME') === 'MANGA';
  const total = isManga
    ? anime.chapters ?? 0
    : anime.episodes ?? (anime.nextEpisode ? Math.max(1, anime.nextEpisode.number - 1) : 0);
  const progress = entry.progress ?? 0;
  const percent = total > 0 ? Math.min(100, (progress / total) * 100) : 0;
  const wideThumb =
    anime.hasOfficialBanner && anime.banner && anime.banner !== anime.cover
      ? anime.banner
      : null;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#181818] p-3 transition hover:border-white/[0.16] hover:bg-[#222222] sm:p-4">
      <div className="flex gap-3 sm:gap-4">
        {/* 16:9 Thumbnail with Red Watch Progress Bar */}
        <button
          type="button"
          onClick={() => onOpen(anime)}
          className="relative aspect-video h-20 shrink-0 overflow-hidden rounded-xl bg-black text-left focus:outline-none sm:h-24"
        >
          {wideThumb ? (
            <img
              src={wideThumb}
              alt={anime.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="relative h-full w-full overflow-hidden bg-[#121216]">
              <img
                src={anime.cover}
                alt=""
                className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-md"
              />
              <img
                src={anime.cover}
                alt={anime.title}
                loading="lazy"
                className="relative z-[1] mx-auto h-full w-auto max-w-[70%] object-contain"
              />
            </div>
          )}
          {total > 0 && percent > 0 && (
            <div className="absolute inset-x-0 bottom-0 z-[2] h-1 bg-white/25">
              <div className="h-full bg-[#FF0000]" style={{ width: `${percent}%` }} />
            </div>
          )}
        </button>

        {/* Details & Quick Progress */}
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <button
              type="button"
              onClick={() => onOpen(anime)}
              className="line-clamp-1 text-left text-[14.5px] font-bold text-white hover:text-neutral-200"
            >
              {anime.title}
            </button>
            <p className="mt-0.5 truncate text-[11.5px] text-[#AAAAAA]">
              {[
                anime.studios[0] || (isManga ? 'Manga' : 'Studio'),
                anime.year,
                anime.format,
                total ? `${total} ${isManga ? 'ch' : 'eps'}` : null,
              ]
                .filter(Boolean)
                .join(' • ')}
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                  entry.status === 'watching'
                    ? 'bg-[#FF0000]/20 text-[#FF0000]'
                    : 'bg-white/10 text-neutral-300'
                }`}
              >
                {statusLabel(entry.status, anime.mediaType)}
              </span>
              {entry.score ? (
                <span className="flex items-center gap-0.5 text-[11px] font-bold text-amber-300">
                  <Star className="h-3 w-3 fill-current" />
                  {entry.score}/10
                </span>
              ) : null}
            </div>

            {total > 0 && entry.status === 'watching' && (
              <div className="flex items-center gap-1 rounded-full bg-[#272727] px-2 py-0.5">
                <button
                  type="button"
                  aria-label="Decrease progress"
                  onClick={() => library.setProgress(anime.id, Math.max(0, progress - 1))}
                  className="p-1 text-[#AAAAAA] hover:text-white"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="min-w-[36px] text-center text-[11px] font-bold text-white">
                  {progress}/{total}
                </span>
                <button
                  type="button"
                  aria-label="Increase progress"
                  onClick={() => library.setProgress(anime.id, Math.min(total, progress + 1))}
                  className="p-1 text-[#AAAAAA] hover:text-white"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ListView: React.FC<ListViewProps> = ({
  libraryState,
  mediaType,
  onOpen,
  onExplore,
}) => {
  const [filter, setFilter] = useState<Filter>('all');
  const isManga = mediaType === 'MANGA';

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All Subscriptions' },
    ...LIST_STATUS_ORDER.map((status) => ({
      id: status as Filter,
      label: statusLabel(status, mediaType),
    })),
  ];

  const entries = useMemo(
    () =>
      Object.values(libraryState.entries).filter((entry) => {
        const anime = animeStore.get(entry.animeId);
        return anime
          ? (anime.mediaType ?? 'ANIME') === mediaType
          : (entry.mediaType ?? 'ANIME') === mediaType;
      }),
    [libraryState.entries, mediaType]
  );

  const rows = useMemo(() => {
    return entries
      .map((entry) => ({ entry, anime: animeStore.get(entry.animeId) }))
      .filter((row): row is { entry: ListEntry; anime: Anime } => Boolean(row.anime))
      .filter((row) => (filter === 'all' ? true : row.entry.status === filter))
      .sort((a, b) => b.entry.updatedAt - a.entry.updatedAt);
  }, [entries, filter]);

  const subscribedChannels = useMemo(() => {
    return entries
      .filter((e) => e.status === 'watching')
      .map((e) => animeStore.get(e.animeId))
      .filter((a): a is Anime => Boolean(a));
  }, [entries]);

  return (
    <div className="mx-auto min-h-screen max-w-5xl space-y-5 bg-[#0F0F0F] px-4 pb-24 pt-5 text-white sm:px-6 lg:px-8 lg:pb-16">
      <div>
        <h1 className="flex items-center gap-2 text-[22px] font-black tracking-tight text-white">
          <Tv className="h-5 w-5 text-[#FF0000]" />
          {isManga ? 'Manga Subscriptions' : 'Anime Subscriptions'}
        </h1>
        <p className="mt-0.5 text-[12px] text-[#AAAAAA]">
          {entries.length === 0
            ? `Subscribe to ${isManga ? 'manga' : 'anime'} to track releases and fuel your recommendation algorithm.`
            : `${entries.length} ${isManga ? 'manga' : 'anime'} series subscribed · Auto-synced locally`}
        </p>
      </div>

      {/* Top Story Avatars */}
      {subscribedChannels.length > 0 && (
        <div className="flex items-center gap-4 overflow-x-auto border-b border-white/[0.08] pb-3 no-scrollbar">
          {subscribedChannels.map((anime) => (
            <button
              key={anime.id}
              type="button"
              onClick={() => onOpen(anime)}
              className="group flex shrink-0 flex-col items-center gap-1.5 focus:outline-none"
            >
              <div className="relative">
                <img
                  src={anime.cover}
                  alt={anime.title}
                  className="h-14 w-14 rounded-full border-2 border-[#FF0000] object-cover p-0.5 transition group-hover:scale-105"
                />
                <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#0F0F0F] bg-emerald-500" />
              </div>
              <span className="max-w-[68px] truncate text-[11px] font-medium text-neutral-300 group-hover:text-white">
                {anime.title}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 5 List Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {filters.map((f) => {
          const isSelected = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition ${
                isSelected
                  ? 'bg-[#F1F1F1] font-semibold text-[#0F0F0F]'
                  : 'bg-[#272727] text-[#F1F1F1] hover:bg-[#3F3F3F]'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#181818] p-10 text-center">
          <Tv className="mx-auto mb-3 h-12 w-12 text-[#AAAAAA]/40" />
          <h2 className="text-[16px] font-bold text-white">
            No {isManga ? 'manga' : 'anime'} subscriptions yet
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] text-[#AAAAAA]">
            Tap Subscribe on any series and pick one of the 5 lists to start tracking and generating tailored recommendations.
          </p>
          <button
            type="button"
            onClick={onExplore}
            className="mt-4 rounded-full bg-[#FF0000] px-5 py-2 text-[12.5px] font-bold text-white transition hover:bg-[#CC0000]"
          >
            Explore Trending {isManga ? 'Manga' : 'Anime'}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#181818] p-8 text-center text-[#AAAAAA]">
          <p className="text-[13px] font-semibold">No titles in this list yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ anime, entry }) => (
            <Row key={anime.id} anime={anime} entry={entry} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
};
