import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Compass,
  Dice5,
  ListChecks,
  Newspaper,
  Search,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';
import { AppTab } from './Sidebar';
import { Anime, LibraryState, MediaType } from '../types';
import { animeStore } from '../services/animeStore';
import { searchSmart } from '../services/search';
import { buildTasteProfile } from '../services/recommender';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaType: MediaType;
  libraryState: LibraryState;
  onNavigate: (tab: AppTab) => void;
  onOpenAnime: (anime: Anime) => void;
  onOpenConflicts: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  mediaType,
  libraryState,
  onNavigate,
  onOpenAnime,
  onOpenConflicts,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Anime[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setHits([]);
    setTimeout(() => inputRef.current?.focus(), 40);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const clean = query.trim();
    if (clean.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchSmart(clean, mediaType, 6)
        .then((res) => {
          if (!cancelled) setHits(res);
        })
        .catch(() => {});
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isOpen, query, mediaType]);

  if (!isOpen) return null;

  const spinRoulette = () => {
    const profile = buildTasteProfile(libraryState, mediaType);
    const favGenres = new Set(profile.topGenres.slice(0, 4).map((g) => g.name));
    const excluded = new Set([
      ...Object.keys(libraryState.entries),
      ...libraryState.notInterested,
    ]);
    const pool = animeStore
      .all()
      .filter(
        (a) =>
          (a.mediaType ?? 'ANIME') === mediaType &&
          !excluded.has(a.id) &&
          a.cover &&
          (a.score ?? 0) >= 7.3
      );
    const preferred = favGenres.size
      ? pool.filter((a) => a.genres.some((g) => favGenres.has(g)))
      : pool;
    const finalPool = preferred.length > 0 ? preferred : pool;
    if (finalPool.length === 0) return;
    const picked = finalPool[Math.floor(Math.random() * Math.min(finalPool.length, 30))];
    if (picked) {
      onClose();
      onOpenAnime(picked);
    }
  };

  const quickActions: { label: string; icon: React.ReactNode; run: () => void }[] = [
    { label: 'Spin Discovery Roulette (Pick Next Show)', icon: <Dice5 className="h-4 w-4 text-amber-300" />, run: spinRoulette },
    { label: 'Open 3-Way Sync Conflict Resolver', icon: <Sparkles className="h-4 w-4 text-[#3EA6FF]" />, run: () => { onClose(); onOpenConflicts(); } },
    { label: 'Go to Explore Catalog', icon: <Compass className="h-4 w-4 text-emerald-400" />, run: () => { onClose(); onNavigate('explore'); } },
    { label: 'Go to Weekly Airing Schedule', icon: <Calendar className="h-4 w-4 text-sky-400" />, run: () => { onClose(); onNavigate('schedule'); } },
    { label: 'Go to My List & Custom Shelves', icon: <ListChecks className="h-4 w-4 text-rose-400" />, run: () => { onClose(); onNavigate('list'); } },
    { label: 'Go to Group Match & Feed', icon: <Users className="h-4 w-4 text-violet-400" />, run: () => { onClose(); onNavigate('feed'); } },
    { label: 'Go to Anime & Manga News', icon: <Newspaper className="h-4 w-4 text-orange-400" />, run: () => { onClose(); onNavigate('news'); } },
    { label: 'Go to My Channel & Stats Heatmap', icon: <User className="h-4 w-4 text-neutral-300" />, run: () => { onClose(); onNavigate('you'); } },
  ];

  return (
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center bg-black/75 p-4 pt-20 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Quick Command Palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.14] bg-[#1C1C1C] text-white shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-white/[0.08] px-4 py-3">
          <Search className="h-4 w-4 text-[#AAAAAA]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to anime, manga, route, or spin roulette…"
            className="flex-1 bg-transparent text-[14px] text-white placeholder:text-[#777777] outline-none"
          />
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-[#AAAAAA]">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close palette"
            className="rounded-full p-1 text-[#AAAAAA] hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-2">
          {hits.length > 0 && (
            <div className="mb-2 border-b border-white/[0.08] pb-2">
              <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#888888]">
                Matches
              </p>
              {hits.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAnime(item);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/[0.08]"
                >
                  <img
                    src={item.cover}
                    alt=""
                    className="h-10 w-7 shrink-0 rounded object-cover bg-black"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-white">{item.title}</p>
                    <p className="truncate text-[11px] text-[#AAAAAA]">
                      {[item.format, item.year].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#888888]">
            Quick Actions
          </p>
          {quickActions.map((act) => (
            <button
              key={act.label}
              type="button"
              onClick={act.run}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-neutral-200 transition hover:bg-white/[0.08] hover:text-white"
            >
              {act.icon}
              <span>{act.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
