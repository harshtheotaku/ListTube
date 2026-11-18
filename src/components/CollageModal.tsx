import React, { useEffect, useState } from 'react';
import { Download, Grid, Loader2, Search, Sparkles, X } from 'lucide-react';
import { Anime, LibraryState, MediaType } from '../types';
import {
  CollageTheme,
  exportCollagePng,
  exportTierListPng,
  pickDefaultCollageSlots,
  pickDefaultTierBuckets,
  TIER_ORDER,
  TierBuckets,
  TierRank,
} from '../services/collageGrid';
import { triggerHaptic } from '../services/haptics';
import { useProfile } from '../services/profile';
import { searchSmart } from '../services/search';
import { toast } from './Toast';

interface CollageModalProps {
  isOpen: boolean;
  onClose: () => void;
  libraryState: LibraryState;
  mediaType: MediaType;
}

export const CollageModal: React.FC<CollageModalProps> = ({
  isOpen,
  onClose,
  libraryState,
  mediaType,
}) => {
  const profile = useProfile();
  const [builderTab, setBuilderTab] = useState<'grid3x3' | 'tierlist'>('grid3x3');
  const [title, setTitle] = useState(
    mediaType === 'MANGA' ? 'My Top 9 Manga 3×3' : 'My Top 9 Anime 3×3'
  );
  const [tierHeading, setTierHeading] = useState(
    mediaType === 'MANGA' ? 'My Manga Tier List' : 'My Anime Tier List'
  );
  const [theme, setTheme] = useState<CollageTheme>('obsidian');
  const [slots, setSlots] = useState<(Anime | null)[]>(() => {
    const initial = pickDefaultCollageSlots(libraryState, profile, mediaType);
    return Array.from({ length: 9 }, (_, i) => initial[i] ?? null);
  });
  const [tierBuckets, setTierBuckets] = useState<TierBuckets>(() =>
    pickDefaultTierBuckets(libraryState, mediaType)
  );
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingTier, setEditingTier] = useState<TierRank | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<Anime[]>([]);
  const [searching, setSearching] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setEditingIdx(null);
    setEditingTier(null);
    setSearchQuery('');
  }, [isOpen]);

  useEffect(() => {
    if ((editingIdx === null && editingTier === null) || searchQuery.trim().length < 2) {
      setSearchHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchSmart(searchQuery.trim(), mediaType, 8)
        .then((res) => {
          if (!cancelled) setSearchHits(res);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [editingIdx, editingTier, searchQuery, mediaType]);

  if (!isOpen) return null;

  const autoFill = () => {
    triggerHaptic('medium');
    if (builderTab === 'tierlist') {
      setTierBuckets(pickDefaultTierBuckets(libraryState, mediaType));
      toast('Auto-grouped your rated list into S–D tiers!');
    } else {
      const filled = pickDefaultCollageSlots(libraryState, profile, mediaType);
      setSlots(Array.from({ length: 9 }, (_, i) => filled[i] ?? null));
      toast('Auto-filled 3×3 from your top favorites & scores!');
    }
  };

  const handleExport = async () => {
    triggerHaptic('success');
    setExporting(true);
    try {
      if (builderTab === 'tierlist') {
        await exportTierListPng(tierBuckets, tierHeading, theme);
        toast('Saved Tier List PNG!');
      } else {
        await exportCollagePng(slots, title, theme);
        toast('Saved 3×3 Collage PNG!');
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="lt-backdrop-in fixed inset-0 z-[85] flex items-end justify-center bg-black/80 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="3x3 Collage Grid Builder"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="liquid-glass lt-sheet-up flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-[30px] border border-white/[0.16] text-white shadow-2xl sm:rounded-[28px]">
        <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-white/25 sm:hidden" />
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FF0000]/20 text-[#FF0000]">
              <Grid className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-white">3×3 Collage Grid Maker</h2>
              <p className="text-[11px] text-[#AAAAAA]">
                Tap any cell to swap title, customize theme &amp; export crisp PNG
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close collage maker"
            className="lt-press rounded-full bg-white/10 p-1.5 text-neutral-300 hover:bg-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Builder Switcher: 3x3 vs Tier List */}
          <div className="flex items-center gap-1 rounded-full bg-white/[0.06] p-1">
            <button
              type="button"
              onClick={() => {
                setBuilderTab('grid3x3');
                setEditingTier(null);
              }}
              className={`flex-1 rounded-full py-1.5 text-[12px] font-bold transition ${
                builderTab === 'grid3x3' ? 'bg-white text-black shadow' : 'text-[#AAAAAA] hover:text-white'
              }`}
            >
              3×3 Grid
            </button>
            <button
              type="button"
              onClick={() => {
                setBuilderTab('tierlist');
                setEditingIdx(null);
              }}
              className={`flex-1 rounded-full py-1.5 text-[12px] font-bold transition ${
                builderTab === 'tierlist' ? 'bg-white text-black shadow' : 'text-[#AAAAAA] hover:text-white'
              }`}
            >
              Tier List (S–D)
            </button>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={builderTab === 'tierlist' ? tierHeading : title}
              onChange={(e) =>
                builderTab === 'tierlist'
                  ? setTierHeading(e.target.value)
                  : setTitle(e.target.value)
              }
              placeholder={builderTab === 'tierlist' ? 'Tier List heading…' : 'Collage heading…'}
              className="h-9 min-w-[180px] flex-1 rounded-xl border border-white/[0.14] bg-black/35 px-3 text-[13px] font-semibold text-white outline-none focus:border-[#3EA6FF]"
            />
            <button
              type="button"
              onClick={autoFill}
              className="lt-press inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/[0.1] px-3 text-[12px] font-bold text-[#3EA6FF] hover:bg-white/[0.18]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {builderTab === 'tierlist' ? 'Auto-Rank Tiers' : 'Auto-Fill Top 9'}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {(['obsidian', 'crimson', 'daylight'] as CollageTheme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`lt-press rounded-full px-3 py-1 text-[11.5px] font-bold capitalize ${
                  theme === t ? 'bg-white text-black' : 'bg-white/[0.08] text-[#CCCCCC]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {builderTab === 'grid3x3' ? (
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/[0.1] bg-black/40 p-2.5">
              {slots.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setEditingIdx(idx);
                    setEditingTier(null);
                    setSearchQuery('');
                  }}
                  className={`lt-press group relative aspect-[3/4] overflow-hidden rounded-xl border text-left ${
                    editingIdx === idx
                      ? 'border-[#3EA6FF] ring-2 ring-[#3EA6FF]/40'
                      : 'border-white/[0.08] bg-[#16161A]'
                  }`}
                >
                  {item?.cover ? (
                    <img
                      src={item.cover}
                      alt={item.title}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[11px] font-bold text-[#66666E]">
                      + Slot {idx + 1}
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-1.5">
                    <p className="line-clamp-1 text-[10px] font-bold text-white">
                      {item?.title || `Pick #${idx + 1}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2 rounded-2xl border border-white/[0.1] bg-black/40 p-2.5">
              {TIER_ORDER.map((rank) => {
                const badgeBg =
                  rank === 'S'
                    ? 'bg-[#FF453A] text-black'
                    : rank === 'A'
                      ? 'bg-[#FF9F0A] text-black'
                      : rank === 'B'
                        ? 'bg-[#FFD60A] text-black'
                        : rank === 'C'
                          ? 'bg-[#30D158] text-black'
                          : 'bg-[#64D2FF] text-black';
                return (
                  <div
                    key={rank}
                    className="flex items-stretch gap-2 rounded-xl border border-white/[0.08] bg-[#16161A] p-1.5"
                  >
                    <div
                      className={`flex w-10 shrink-0 items-center justify-center rounded-lg text-[16px] font-black ${badgeBg}`}
                    >
                      {rank}
                    </div>
                    <div className="flex min-h-[60px] flex-1 flex-wrap items-center gap-1.5">
                      {tierBuckets[rank].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          title={`Click to remove ${item.title} from ${rank} tier`}
                          onClick={() => {
                            triggerHaptic('light');
                            setTierBuckets((prev) => ({
                              ...prev,
                              [rank]: prev[rank].filter((x) => x.id !== item.id),
                            }));
                          }}
                          className="group relative h-14 w-10 overflow-hidden rounded-lg border border-white/15"
                        >
                          <img src={item.cover} alt={item.title} className="h-full w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/70 text-[10px] font-black text-rose-300 opacity-0 transition group-hover:opacity-100">
                            ✕
                          </span>
                        </button>
                      ))}
                      {tierBuckets[rank].length < 8 && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTier(rank);
                            setEditingIdx(null);
                            setSearchQuery('');
                          }}
                          className={`flex h-14 w-10 items-center justify-center rounded-lg border border-dashed text-[14px] font-bold transition ${
                            editingTier === rank
                              ? 'border-[#3EA6FF] text-[#3EA6FF]'
                              : 'border-white/20 text-[#888888] hover:text-white'
                          }`}
                        >
                          +
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Slot / Tier Picker Search Panel */}
          {(editingIdx !== null || editingTier !== null) && (
            <div className="space-y-2 rounded-2xl border border-[#3EA6FF]/35 bg-[#121824]/90 p-3">
              <div className="flex items-center justify-between text-[12px] font-bold text-white">
                <span>
                  {editingTier
                    ? `Add title to ${editingTier} Tier`
                    : `Pick title for Slot #${editingIdx! + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingIdx(null);
                    setEditingTier(null);
                  }}
                  className="text-[11px] text-[#AAAAAA] hover:text-white"
                >
                  Done
                </button>
              </div>
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[#888888]" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${mediaType === 'MANGA' ? 'manga' : 'anime'} to place…`}
                  className="h-9 w-full rounded-xl border border-white/15 bg-black/50 pl-8 pr-3 text-[12.5px] text-white outline-none focus:border-[#3EA6FF]"
                />
              </div>
              {searching && (
                <p className="flex items-center gap-1.5 text-[11px] text-[#AAAAAA]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Searching…
                </p>
              )}
              {searchHits.length > 0 && (
                <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto">
                  {searchHits.map((hit) => (
                    <button
                      key={hit.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        if (editingTier) {
                          setTierBuckets((prev) => ({
                            ...prev,
                            [editingTier]: prev[editingTier].some((x) => x.id === hit.id)
                              ? prev[editingTier]
                              : [...prev[editingTier], hit].slice(0, 8),
                          }));
                          setEditingTier(null);
                        } else if (editingIdx !== null) {
                          setSlots((prev) => prev.map((s, i) => (i === editingIdx ? hit : s)));
                          setEditingIdx(null);
                        }
                      }}
                      className="flex items-center gap-2 rounded-lg bg-white/[0.06] p-1.5 text-left hover:bg-white/[0.14]"
                    >
                      <img src={hit.cover} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
                      <span className="line-clamp-2 text-[11px] font-semibold text-white">
                        {hit.title}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.08] px-5 py-3.5">
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport()}
            className="lt-press inline-flex items-center gap-1.5 rounded-full bg-[#FF0000] px-5 py-2 text-[12.5px] font-bold text-white shadow hover:bg-[#D90000] disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {builderTab === 'tierlist' ? 'Download Tier List PNG' : 'Download 3×3 PNG'}
          </button>
        </div>
      </div>
    </div>
  );
};
