import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bell, Check, ChevronDown, Film, Info, Star } from 'lucide-react';
import {
  Anime,
  LibraryState,
  ListStatus,
  LIST_STATUS_ORDER,
  mangaOriginLabel,
  statusLabel,
} from '../types';
import { channelHandleOf, fetchFranchiseSeasons, franchiseNameOf } from '../services/franchise';
import { getSimilar } from '../services/recommender';
import { library } from '../services/library';
import { AnimeCard } from './AnimeCard';
import { GridSkeleton } from './Skeleton';
import { toast } from './Toast';

interface ChannelViewProps {
  seedAnime: Anime;
  libraryState: LibraryState;
  onOpenAnime: (anime: Anime) => void;
  onOpenChannel?: (anime: Anime) => void;
  onQuickAdd: (anime: Anime) => void;
  onBack: () => void;
}

type ChannelTab = 'videos' | 'related' | 'about';
type SortMode = 'oldest' | 'latest' | 'popular';

function formatSubscribers(popularity?: number): string {
  if (!popularity) return '120K subscribers';
  if (popularity >= 1_000_000) return `${(popularity / 1_000_000).toFixed(1)}M subscribers`;
  if (popularity >= 1_000) return `${Math.round(popularity / 1_000)}K subscribers`;
  return `${popularity} subscribers`;
}

export const ChannelView: React.FC<ChannelViewProps> = ({
  seedAnime,
  libraryState,
  onOpenAnime,
  onOpenChannel,
  onQuickAdd,
  onBack,
}) => {
  const [seasons, setSeasons] = useState<Anime[]>([seedAnime]);
  const [related, setRelated] = useState<Anime[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [activeTab, setActiveTab] = useState<ChannelTab>('videos');
  const [sortMode, setSortMode] = useState<SortMode>('oldest');
  const [descExpanded, setDescExpanded] = useState(false);
  const [listMenuOpen, setListMenuOpen] = useState(false);

  const isManga = (seedAnime.mediaType ?? 'ANIME') === 'MANGA';
  const channelName = franchiseNameOf(seedAnime.title);
  const handle = channelHandleOf(channelName);

  useEffect(() => {
    let cancelled = false;
    setLoadingSeasons(true);
    setRelated([]);
    setActiveTab('videos');
    setDescExpanded(false);
    setListMenuOpen(false);

    fetchFranchiseSeasons(seedAnime)
      .then((list) => {
        if (!cancelled) setSeasons(list);
      })
      .finally(() => {
        if (!cancelled) setLoadingSeasons(false);
      });

    return () => {
      cancelled = true;
    };
  }, [seedAnime.id]);

  useEffect(() => {
    if (activeTab !== 'related' || related.length > 0) return;
    let cancelled = false;
    setLoadingRelated(true);
    const excluded = new Set(seasons.map((s) => s.id));
    getSimilar(seedAnime, excluded, 16, 1)
      .then((res) => {
        if (!cancelled) setRelated(res.map((r) => r.anime));
      })
      .finally(() => {
        if (!cancelled) setLoadingRelated(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, seedAnime, seasons, related.length]);

  const sortedSeasons = useMemo(() => {
    const copy = [...seasons];
    if (sortMode === 'latest') {
      return copy.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    }
    if (sortMode === 'popular') {
      return copy.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }
    return copy.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  }, [seasons, sortMode]);

  const bannerSource =
    seasons.find((s) => s.hasOfficialBanner && s.banner !== s.cover)?.banner ||
    (seedAnime.hasOfficialBanner ? seedAnime.banner : null);

  const avatarSource = seasons[0]?.cover || seedAnime.cover;
  const maxPop = Math.max(...seasons.map((s) => s.popularity ?? 0), seedAnime.popularity ?? 0);
  const allStudios = [...new Set(seasons.flatMap((s) => s.studios))].slice(0, 3);

  const entry = libraryState.entries[seedAnime.id];
  const isSubscribed = Boolean(entry);

  const handleChooseList = (status: ListStatus) => {
    library.setStatus(seedAnime, status);
    setListMenuOpen(false);
    toast(`Subscribed to ${channelName} · ${statusLabel(status, seedAnime.mediaType)}`);
  };

  const gridClass = isManga
    ? 'grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
    : 'grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return (
    <div className="min-h-screen bg-[#0F0F0F] pb-24 text-white lg:pb-16">
      {/* Back Header */}
      <div className="sticky top-14 z-30 flex items-center justify-between border-b border-white/[0.06] bg-[#0F0F0F]/95 px-4 py-2 backdrop-blur-md sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-full bg-[#272727] px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#3F3F3F]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <span className="max-w-[220px] truncate text-[12px] font-semibold text-[#AAAAAA] sm:max-w-md">
          {channelName}
        </span>
      </div>

      <div className="mx-auto max-w-[1320px] px-4 pt-4 sm:px-6 lg:px-8">
        {/* YouTube Channel Banner */}
        <div className="relative h-32 w-full overflow-hidden rounded-2xl bg-[#181818] sm:h-48 lg:h-56">
          {bannerSource ? (
            <img
              src={bannerSource}
              alt={channelName}
              className="h-full w-full object-cover"
            />
          ) : (
            <>
              <img
                src={avatarSource}
                alt=""
                className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-2xl"
              />
              <div className="relative z-[1] flex h-full items-center justify-center">
                <h2 className="px-6 text-center text-2xl font-black tracking-tight text-white/90 sm:text-4xl">
                  {channelName}
                </h2>
              </div>
            </>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        </div>

        {/* Channel Header Row (Avatar, Title, Handle, Subscribers, Subscribe Button) */}
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <img
            src={avatarSource}
            alt={channelName}
            className="h-20 w-20 shrink-0 rounded-full border-2 border-white/10 object-cover shadow-xl sm:h-28 sm:w-28"
          />

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-black tracking-tight text-white sm:text-[28px]">
                {channelName}
              </h1>
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full bg-[#AAAAAA]/30 text-[10px] font-bold text-white"
                title="Verified Franchise Channel"
              >
                ✓
              </span>
            </div>

            <p className="text-[13px] text-[#AAAAAA]">
              <span className="font-semibold text-white">{handle}</span> •{' '}
              {formatSubscribers(maxPop)} • {seasons.length}{' '}
              {seasons.length === 1 ? (isManga ? 'entry' : 'season') : isManga ? 'entries' : 'seasons & movies'}
              {allStudios.length > 0 ? ` • ${allStudios.join(', ')}` : ''}
            </p>

            {/* Collapsible Channel Bio */}
            {seedAnime.description && (
              <div
                onClick={() => setDescExpanded(!descExpanded)}
                className="max-w-2xl cursor-pointer text-[13px] leading-relaxed text-[#AAAAAA]"
              >
                <p className={descExpanded ? '' : 'line-clamp-2'}>{seedAnime.description}</p>
                <span className="font-bold text-white">
                  {descExpanded ? 'Show less' : '...more'}
                </span>
              </div>
            )}

            {/* Subscribe Action Row */}
            <div className="relative flex flex-wrap items-center gap-2.5 pt-1">
              {isSubscribed ? (
                <button
                  type="button"
                  onClick={() => setListMenuOpen(!listMenuOpen)}
                  className="flex items-center gap-2 rounded-full bg-[#272727] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3F3F3F]"
                >
                  <Bell className="h-4 w-4 fill-[#FF0000] text-[#FF0000]" />
                  <span>Subscribed · {statusLabel(entry!.status, seedAnime.mediaType)}</span>
                  <ChevronDown className="h-4 w-4 text-[#AAAAAA]" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setListMenuOpen(!listMenuOpen)}
                  className="flex items-center gap-2 rounded-full bg-[#F1F1F1] px-5 py-2 text-[13px] font-bold text-[#0F0F0F] transition hover:bg-white"
                >
                  <span>Subscribe</span>
                  <ChevronDown className="h-4 w-4" />
                </button>
              )}

              {listMenuOpen && (
                <div className="absolute left-0 top-12 z-50 w-56 rounded-2xl border border-white/[0.12] bg-[#212121] p-2 shadow-2xl">
                  <p className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                    Choose list to subscribe
                  </p>
                  {LIST_STATUS_ORDER.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => handleChooseList(status)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-[12.5px] font-semibold transition ${
                        entry?.status === status
                          ? 'bg-[#FF0000]/20 text-white'
                          : 'text-neutral-200 hover:bg-white/[0.08]'
                      }`}
                    >
                      <span>{statusLabel(status, seedAnime.mediaType)}</span>
                      {entry?.status === status && <Check className="h-4 w-4 text-[#FF0000]" />}
                    </button>
                  ))}
                  {isSubscribed && (
                    <>
                      <div className="my-1 border-t border-white/[0.08]" />
                      <button
                        type="button"
                        onClick={() => {
                          library.remove(seedAnime.id);
                          setListMenuOpen(false);
                          toast('Unsubscribed');
                        }}
                        className="flex w-full items-center rounded-xl px-3 py-2 text-[12px] font-semibold text-rose-400 hover:bg-rose-500/10"
                      >
                        Unsubscribe
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* YouTube Channel Tabs: Seasons & Videos | Related | About */}
        <div className="mt-6 flex items-center gap-6 border-b border-white/[0.1]">
          {[
            { id: 'videos' as ChannelTab, label: isManga ? 'Volumes & Series' : 'Seasons & Videos' },
            { id: 'related' as ChannelTab, label: 'Similar Channels' },
            { id: 'about' as ChannelTab, label: 'About' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`border-b-2 pb-3 text-[14px] font-semibold transition ${
                activeTab === t.id
                  ? 'border-white text-white'
                  : 'border-transparent text-[#AAAAAA] hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="mt-5">
          {activeTab === 'videos' && (
            <>
              {/* Sort Pills like YouTube (Chronological / Latest / Top Rated) */}
              <div className="mb-5 flex items-center gap-2">
                {[
                  { id: 'oldest' as SortMode, label: 'Watch Order (Oldest)' },
                  { id: 'latest' as SortMode, label: 'Latest' },
                  { id: 'popular' as SortMode, label: 'Top Rated' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSortMode(s.id)}
                    className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
                      sortMode === s.id
                        ? 'bg-[#F1F1F1] text-[#0F0F0F]'
                        : 'bg-[#272727] text-[#F1F1F1] hover:bg-[#3F3F3F]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {loadingSeasons ? (
                <GridSkeleton count={4} mediaType={seedAnime.mediaType} />
              ) : (
                <div className={gridClass}>
                  {sortedSeasons.map((item, idx) => (
                    <AnimeCard
                      key={item.id}
                      anime={item}
                      onOpen={onOpenAnime}
                      status={libraryState.entries[item.id]?.status}
                      reason={
                        item.mediaType === 'MANGA'
                          ? `${mangaOriginLabel(item)}${item.chapters ? ` • ${item.chapters} ch` : ''}`
                          : item.format
                            ? `${item.format}${item.episodes ? ` • ${item.episodes} ep` : ''}`
                            : undefined
                      }
                      onQuickAdd={onQuickAdd}
                      priority={idx < 4}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'related' && (
            loadingRelated ? (
              <GridSkeleton count={8} mediaType={seedAnime.mediaType} />
            ) : related.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#AAAAAA]">
                No similar channels found yet.
              </p>
            ) : (
              <div className={gridClass}>
                {related.map((item) => (
                  <AnimeCard
                    key={item.id}
                    anime={item}
                    onOpen={onOpenAnime}
                    onOpenChannel={onOpenChannel}
                    status={libraryState.entries[item.id]?.status}
                    onQuickAdd={onQuickAdd}
                  />
                ))}
              </div>
            )
          )}

          {activeTab === 'about' && (
            <div className="max-w-2xl space-y-5 rounded-2xl border border-white/[0.08] bg-[#181818] p-5">
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold text-white">
                  <Info className="h-4 w-4 text-[#FF0000]" />
                  Synopsis
                </h3>
                <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-[#CCCCCC]">
                  {seedAnime.description || 'No description available.'}
                </p>
              </div>
              <div className="grid gap-3 border-t border-white/10 pt-4 text-[13px] sm:grid-cols-2">
                <div>
                  <span className="text-[#AAAAAA]">Studios / Authors:</span>{' '}
                  <span className="font-semibold text-white">
                    {allStudios.join(', ') || 'Official Production'}
                  </span>
                </div>
                <div>
                  <span className="text-[#AAAAAA]">Genres:</span>{' '}
                  <span className="font-semibold text-white">
                    {seedAnime.genres.join(', ')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                  <span className="font-semibold text-white">
                    {seedAnime.score ? `${seedAnime.score.toFixed(1)}/10` : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Film className="h-3.5 w-3.5 text-[#FF0000]" />
                  <span className="font-semibold text-white">
                    {seasons.length} franchise entries indexed
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
