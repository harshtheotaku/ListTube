import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  Flag,
  FolderPlus,
  Lock,
  Minus,
  Plus,
  Repeat,
  Square,
  Star,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import {
  Anime,
  LibraryState,
  ListEntry,
  LIST_STATUS_ORDER,
  ListStatus,
  MediaType,
  mangaOriginLabel,
  statusLabel,
} from '../types';
import { animeStore } from '../services/animeStore';
import { franchiseNameOf } from '../services/franchise';
import { library } from '../services/library';
import { profileStore, useProfile } from '../services/profile';
import { formatUserScore } from '../services/scoring';
import { useSettings } from '../services/settings';
import { toast } from './Toast';

interface ListViewProps {
  libraryState: LibraryState;
  mediaType: MediaType;
  query: string;
  onOpen: (anime: Anime) => void;
  onOpenChannel: (anime: Anime) => void;
  onExplore: () => void;
}

type Filter = 'all' | ListStatus | `custom:${string}`;
type SortKey = 'updated' | 'score' | 'priority' | 'title';

interface RowProps {
  anime: Anime;
  entry: ListEntry;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onOpen: (anime: Anime) => void;
  onOpenChannel: (anime: Anime) => void;
}

const PRIORITY_META: Record<number, { label: string; cls: string }> = {
  2: { label: 'High Priority', cls: 'bg-rose-500/20 text-rose-300' },
  1: { label: 'Med Priority', cls: 'bg-[#3EA6FF]/20 text-[#3EA6FF]' },
};

const Row: React.FC<RowProps> = ({
  anime,
  entry,
  selectMode,
  selected,
  onToggleSelect,
  onOpen,
  onOpenChannel,
}) => {
  const settings = useSettings();
  const isManga = (anime.mediaType ?? 'ANIME') === 'MANGA';
  const total = isManga ? anime.chapters ?? 0 : anime.episodes ?? 0;
  const progress = entry.progress ?? 0;
  const percent = total > 0 ? Math.min(100, (progress / total) * 100) : 0;
  const channelName = franchiseNameOf(anime.title);
  const wideThumb =
    !isManga && anime.hasOfficialBanner && anime.banner && anime.banner !== anime.cover
      ? anime.banner
      : null;

  return (
    <div
      className={`rounded-2xl border p-3 transition sm:p-4 ${
        selected
          ? 'border-[#3EA6FF] bg-[#1E293B]/60'
          : 'border-white/[0.08] bg-[#181818] hover:border-white/[0.16] hover:bg-[#222222]'
      }`}
    >
      <div className="flex gap-3 sm:gap-4">
        {selectMode && (
          <button
            type="button"
            onClick={() => onToggleSelect?.(anime.id)}
            aria-label={selected ? 'Deselect entry' : 'Select entry'}
            className="flex shrink-0 items-center justify-center self-center rounded-lg p-1.5 text-[#3EA6FF] hover:bg-white/10"
          >
            {selected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-[#AAAAAA]" />}
          </button>
        )}
        {/* Thumbnail with Red Progress Bar (4:5 portrait for Manga, 16:9 for Anime) */}
        <button
          type="button"
          onClick={() => (selectMode ? onToggleSelect?.(anime.id) : onOpen(anime))}
          className={`relative shrink-0 overflow-hidden rounded-xl bg-black text-left focus:outline-none ${
            isManga ? 'aspect-[4/5] w-16 sm:w-20' : 'aspect-video h-20 sm:h-24'
          }`}
        >
          {isManga ? (
            <img
              src={anime.cover}
              alt={anime.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : wideThumb ? (
            <img
              src={wideThumb}
              alt={anime.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 overflow-hidden bg-[#121216]">
              <img
                src={anime.cover}
                alt=""
                className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-md"
              />
              <div className="absolute inset-0 z-[1] flex items-center justify-center">
                <img
                  src={anime.cover}
                  alt={anime.title}
                  loading="lazy"
                  className="h-full w-auto max-w-[72%] object-contain"
                />
              </div>
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
            <p className="mt-0.5 flex flex-wrap items-center gap-1 truncate text-[11.5px] text-[#AAAAAA]">
              <button
                type="button"
                onClick={() => onOpenChannel(anime)}
                className="font-medium text-[#AAAAAA] hover:text-white hover:underline"
              >
                {channelName}
              </button>
              {[
                anime.year ? `• ${anime.year}` : null,
                isManga
                  ? `• ${mangaOriginLabel(anime)}`
                  : anime.format
                    ? `• ${anime.format}`
                    : null,
                total ? `• ${total} ${isManga ? 'ch' : 'eps'}` : null,
              ]
                .filter(Boolean)
                .map((part, idx) => (
                  <span key={idx}>{part}</span>
                ))}
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
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
                  {formatUserScore(entry.score, settings.scoreFormat)}
                </span>
              ) : null}
              {entry.repeat ? (
                <span className="flex items-center gap-0.5 text-[10.5px] font-semibold text-neutral-300">
                  <Repeat className="h-3 w-3 text-[#3EA6FF]" />
                  {entry.repeat}x
                </span>
              ) : null}
              {entry.isPrivate && (
                <span title="Private entry" className="text-[#AAAAAA]">
                  <Lock className="h-3 w-3" />
                </span>
              )}
              {entry.priority && PRIORITY_META[entry.priority] && (
                <span
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    PRIORITY_META[entry.priority].cls
                  }`}
                >
                  <Flag className="h-2.5 w-2.5" />
                  {PRIORITY_META[entry.priority].label}
                </span>
              )}
              {(entry.customLists ?? []).map((listName) => (
                <span
                  key={listName}
                  className="rounded bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold text-[#CCCCCC]"
                >
                  {listName}
                </span>
              ))}
            </div>

            {(entry.status === 'watching' || entry.status === 'on_hold' || progress > 0) && (
              <div className="flex items-center gap-1 rounded-full bg-[#272727] px-2 py-0.5">
                <button
                  type="button"
                  aria-label="Decrease progress"
                  onClick={() => library.setProgress(anime.id, Math.max(0, progress - 1))}
                  className="p-1 text-[#AAAAAA] hover:text-white"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="min-w-[44px] text-center text-[11px] font-bold text-white">
                  {total > 0 ? `${progress}/${total}` : `${progress} ${isManga ? 'ch' : 'ep'}`}
                </span>
                <button
                  type="button"
                  aria-label="Increase progress"
                  onClick={() => library.setProgress(anime.id, progress + 1)}
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
  query,
  onOpen,
  onOpenChannel,
  onExplore,
}) => {
  const profile = useProfile();
  const [filter, setFilter] = useState<Filter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('updated');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newListDraft, setNewListDraft] = useState('');
  const [showNewListInput, setShowNewListInput] = useState(false);
  const isManga = mediaType === 'MANGA';

  const customListNames = useMemo(() => {
    const names = new Set<string>(profile.customListNames ?? []);
    for (const e of Object.values(libraryState.entries)) {
      for (const c of e.customLists ?? []) {
        if (c.trim()) names.add(c.trim());
      }
    }
    return Array.from(names);
  }, [profile.customListNames, libraryState.entries]);

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All Subscriptions' },
    ...LIST_STATUS_ORDER.map((status) => ({
      id: status as Filter,
      label: statusLabel(status, mediaType),
    })),
    ...customListNames.map((name) => ({
      id: `custom:${name}` as Filter,
      label: name,
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

  const normalizedQuery = query.trim().toLowerCase();

  const rows = useMemo(() => {
    return entries
      .map((entry) => ({ entry, anime: animeStore.get(entry.animeId) }))
      .filter((row): row is { entry: ListEntry; anime: Anime } => Boolean(row.anime))
      .filter((row) => {
        if (filter === 'all') return true;
        if (filter.startsWith('custom:')) {
          const targetList = filter.slice(7);
          return Boolean(row.entry.customLists?.includes(targetList));
        }
        return row.entry.status === filter;
      })
      .filter((row) => {
        if (!normalizedQuery) return true;
        const ch = franchiseNameOf(row.anime.title).toLowerCase();
        return (
          row.anime.title.toLowerCase().includes(normalizedQuery) ||
          (row.anime.titleRomaji?.toLowerCase().includes(normalizedQuery) ?? false) ||
          ch.includes(normalizedQuery)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'score') return (b.entry.score ?? 0) - (a.entry.score ?? 0);
        if (sortBy === 'priority') return (b.entry.priority ?? 0) - (a.entry.priority ?? 0);
        if (sortBy === 'title') return a.anime.title.localeCompare(b.anime.title);
        return b.entry.updatedAt - a.entry.updatedAt;
      });
  }, [entries, filter, normalizedQuery, sortBy]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreateCustomList = (e: React.FormEvent) => {
    e.preventDefault();
    const added = profileStore.addCustomListName(newListDraft);
    if (added) {
      toast(`Created custom list "${added}"`);
      setNewListDraft('');
      setShowNewListInput(false);
      setFilter(`custom:${added}`);
    }
  };

  const subscribedChannels = useMemo(() => {
    const seen = new Set<string>();
    const out: { anime: Anime; channelName: string }[] = [];
    for (const e of entries) {
      if (e.status !== 'watching') continue;
      const anime = animeStore.get(e.animeId);
      if (!anime) continue;
      const ch = franchiseNameOf(anime.title);
      const key = ch.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ anime, channelName: ch });
    }
    return out;
  }, [entries]);

  return (
    <div className="mx-auto min-h-screen max-w-5xl space-y-5 bg-[#0F0F0F] px-4 pb-28 pt-5 text-white sm:px-6 lg:px-8 lg:pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-black tracking-tight text-white">
            <Tv className="h-5 w-5 text-[#FF0000]" />
            {isManga ? 'Manga Subscriptions' : 'Anime Subscriptions'}
          </h1>
          <p className="mt-0.5 text-[12px] text-[#AAAAAA]">
            {entries.length === 0
              ? `Subscribe to ${isManga ? 'manga' : 'anime'} to track releases and fuel your recommendation algorithm.`
              : `${entries.length} ${isManga ? 'manga' : 'anime'} series subscribed · Custom lists & bulk edit ready`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Sort list entries"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="h-9 rounded-lg border border-white/[0.12] bg-[#1C1C1C] px-2.5 text-[12px] font-semibold text-white outline-none"
          >
            <option value="updated">Sort: Recently Updated</option>
            <option value="priority">Sort: Priority</option>
            <option value="score">Sort: My Score</option>
            <option value="title">Sort: Title (A–Z)</option>
          </select>

          <button
            type="button"
            onClick={() => setShowNewListInput((v) => !v)}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[#272727] px-3 text-[12px] font-semibold text-white transition hover:bg-[#3A3A3A]"
          >
            <FolderPlus className="h-3.5 w-3.5 text-[#3EA6FF]" />
            <span>New List</span>
          </button>

          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectMode((v) => !v);
                setSelectedIds([]);
              }}
              className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition ${
                selectMode
                  ? 'bg-[#3EA6FF] text-black'
                  : 'bg-[#272727] text-white hover:bg-[#3A3A3A]'
              }`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span>{selectMode ? 'Done' : 'Bulk Edit'}</span>
            </button>
          )}
        </div>
      </div>

      {showNewListInput && (
        <form
          onSubmit={handleCreateCustomList}
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.1] bg-[#181818] p-3"
        >
          <input
            value={newListDraft}
            onChange={(e) => setNewListDraft(e.target.value)}
            placeholder="Custom shelf name (e.g. Cozy Rewatch, Peak Animation)"
            className="h-9 flex-1 rounded-lg border border-white/[0.14] bg-[#121212] px-3 text-[13px] text-white outline-none focus:border-[#3EA6FF]"
          />
          <button
            type="submit"
            disabled={!newListDraft.trim()}
            className="h-9 rounded-lg bg-[#3EA6FF] px-4 text-[12px] font-bold text-black disabled:opacity-40"
          >
            Create List
          </button>
        </form>
      )}

      {selectMode && (
        <div className="sticky top-14 z-30 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#3EA6FF]/40 bg-[#172030]/95 p-3 backdrop-blur-md">
          <div className="flex items-center gap-2 text-[12.5px] font-bold text-white">
            <span>{selectedIds.length} selected</span>
            <button
              type="button"
              onClick={() => setSelectedIds(rows.map((r) => r.anime.id))}
              className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#3EA6FF]"
            >
              Select all ({rows.length})
            </button>
          </div>
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                aria-label="Bulk set status"
                defaultValue=""
                onChange={(e) => {
                  const st = e.target.value as ListStatus;
                  if (!st) return;
                  library.bulkUpdate(selectedIds, { status: st });
                  toast(`Moved ${selectedIds.length} entries to ${statusLabel(st, mediaType)}`);
                  e.target.value = '';
                }}
                className="h-8 rounded-lg bg-[#272727] px-2 text-[11.5px] font-semibold text-white outline-none"
              >
                <option value="" disabled>Move to Status…</option>
                {LIST_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{statusLabel(s, mediaType)}</option>
                ))}
              </select>

              {customListNames.length > 0 && (
                <select
                  aria-label="Bulk add to custom list"
                  defaultValue=""
                  onChange={(e) => {
                    const listName = e.target.value;
                    if (!listName) return;
                    library.bulkUpdate(selectedIds, { addCustomList: listName });
                    toast(`Added ${selectedIds.length} entries to "${listName}"`);
                    e.target.value = '';
                  }}
                  className="h-8 rounded-lg bg-[#272727] px-2 text-[11.5px] font-semibold text-white outline-none"
                >
                  <option value="" disabled>Add to Shelf…</option>
                  {customListNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}

              <select
                aria-label="Bulk set priority"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value === '') return;
                  const p = Number(e.target.value) as 0 | 1 | 2;
                  library.bulkUpdate(selectedIds, { priority: p });
                  toast(`Updated priority on ${selectedIds.length} entries`);
                  e.target.value = '';
                }}
                className="h-8 rounded-lg bg-[#272727] px-2 text-[11.5px] font-semibold text-white outline-none"
              >
                <option value="" disabled>Set Priority…</option>
                <option value="2">High Priority</option>
                <option value="1">Med Priority</option>
                <option value="0">Normal Priority</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  library.bulkRemove(selectedIds);
                  toast(`Removed ${selectedIds.length} entries`);
                  setSelectedIds([]);
                }}
                className="flex h-8 items-center gap-1 rounded-lg bg-rose-500/20 px-2.5 text-[11.5px] font-bold text-rose-300 hover:bg-rose-500/30"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectMode(false);
                  setSelectedIds([]);
                }}
                aria-label="Cancel selection"
                className="rounded-lg p-1.5 text-[#AAAAAA] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Top Subscribed Franchise Channels */}
      {subscribedChannels.length > 0 && (
        <div className="flex items-center gap-4 overflow-x-auto border-b border-white/[0.08] pb-3 no-scrollbar">
          {subscribedChannels.map(({ anime, channelName }) => (
            <button
              key={anime.id}
              type="button"
              onClick={() => onOpenChannel(anime)}
              title={`Open ${channelName} channel`}
              className="group flex shrink-0 flex-col items-center gap-1.5 focus:outline-none"
            >
              <div className="relative">
                <img
                  src={anime.cover}
                  alt={channelName}
                  className="h-14 w-14 rounded-full border-2 border-[#FF0000] object-cover p-0.5 transition group-hover:scale-105"
                />
                <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#0F0F0F] bg-emerald-500" />
              </div>
              <span className="max-w-[74px] truncate text-[11px] font-medium text-neutral-300 group-hover:text-white">
                {channelName}
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
            <Row
              key={anime.id}
              anime={anime}
              entry={entry}
              selectMode={selectMode}
              selected={selectedIds.includes(anime.id)}
              onToggleSelect={toggleSelected}
              onOpen={onOpen}
              onOpenChannel={onOpenChannel}
            />
          ))}
        </div>
      )}
    </div>
  );
};
