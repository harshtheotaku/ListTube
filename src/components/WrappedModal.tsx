import React from 'react';
import { Download, Sparkles, Star, Tv, X } from 'lucide-react';
import { LibraryState } from '../types';
import { animeStore } from '../services/animeStore';
import { useProfile } from '../services/profile';
import { computeWrappedSummary, exportWrappedCardPng } from '../services/wrappedStats';
import { toast } from './Toast';

interface WrappedModalProps {
  isOpen: boolean;
  onClose: () => void;
  libraryState: LibraryState;
}

export const WrappedModal: React.FC<WrappedModalProps> = ({
  isOpen,
  onClose,
  libraryState,
}) => {
  const profile = useProfile();
  if (!isOpen) return null;

  const summary = computeWrappedSummary(libraryState, (id) => animeStore.get(id));

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/35 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="ListTube Wrapped"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="liquid-glass relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/[0.16] p-6 text-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close wrapped"
          className="absolute right-4 top-4 rounded-full bg-white/10 p-1.5 text-neutral-300 hover:bg-white/20 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-3 py-1 text-[10.5px] font-extrabold uppercase tracking-wider text-rose-300">
              <Sparkles className="h-3 w-3" />
              ListTube Wrapped
            </span>
            <h2 className="mt-2 text-[22px] font-black tracking-tight text-white">
              {summary.archetype}
            </h2>
            <p className="text-[12px] text-[#AAAAAA]">
              {profile.name} · {profile.handle}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'Titles Tracked', val: String(summary.totalTracked) },
              { label: 'Completed', val: String(summary.completedCount) },
              { label: 'Watch / Read Hours', val: `${summary.totalHours}h` },
              { label: 'Mean Score', val: summary.meanScore ? `${summary.meanScore} ★` : '—' },
              { label: 'Top Genre', val: summary.topGenre },
              { label: 'Top Studio', val: summary.topStudio },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.05] p-3"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                  {card.label}
                </p>
                <p className="mt-1 truncate text-[16px] font-black text-white">{card.val}</p>
              </div>
            ))}
          </div>

          {summary.topRatedPicks.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-amber-300">
                Your Peak Favorites
              </p>
              {summary.topRatedPicks.map((item) => (
                <div key={item.title} className="flex items-center justify-between gap-2 text-[12px]">
                  <div className="flex min-w-0 items-center gap-2">
                    {item.cover && (
                      <img src={item.cover} alt="" className="h-8 w-6 shrink-0 rounded object-cover" />
                    )}
                    <span className="truncate font-semibold text-white">{item.title}</span>
                  </div>
                  <span className="flex shrink-0 items-center gap-0.5 font-bold text-amber-300">
                    <Star className="h-3 w-3 fill-current" />
                    {item.score}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                exportWrappedCardPng(summary, profile.name);
                toast('Saved ListTube Wrapped card as PNG!');
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white py-2.5 text-[13px] font-bold text-black transition hover:bg-neutral-200"
            >
              <Download className="h-4 w-4" />
              Save Shareable PNG
            </button>
            <button
              type="button"
              onClick={() => {
                const text = `My ListTube Wrapped (${summary.archetype}): ${summary.totalTracked} titles tracked, ${summary.totalHours}h watched/read, Top Genre: ${summary.topGenre}, Top Studio: ${summary.topStudio}! https://listtube.vercel.app`;
                void navigator.clipboard?.writeText(text);
                toast('Copied Wrapped stats to clipboard!');
              }}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/[0.14] bg-white/[0.07] px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-white/[0.14]"
            >
              <Tv className="h-3.5 w-3.5 text-[#3EA6FF]" />
              Copy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
