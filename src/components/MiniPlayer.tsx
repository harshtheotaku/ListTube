import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Music,
  SkipForward,
  X,
} from 'lucide-react';
import { miniPlayer, useMiniPlayer } from '../services/miniPlayer';
import { useSettings } from '../services/settings';

interface MiniPlayerProps {
  onOpenAnimeId: (animeId: string) => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({ onOpenAnimeId }) => {
  const state = useMiniPlayer();
  const settings = useSettings();
  if (!state) return null;

  const hasQueue = Boolean(state.queue && state.queue.length > 1);
  const ytSearchUrl = state.searchQuery
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(state.searchQuery)}`
    : undefined;

  return (
    <div
      className={`lt-sheet-up fixed inset-x-3 bottom-[84px] z-[65] mx-auto max-w-[440px] overflow-hidden rounded-[24px] border text-white shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:mx-0 sm:w-[360px] ${
        settings.liquidGlass
          ? 'liquid-glass border-white/[0.2]'
          : 'border-white/[0.16] bg-[#161616]'
      }`}
      role="region"
      aria-label="Persistent Mini-Player"
    >
      {/* Top Bar */}
      <div
        className={`flex items-center justify-between gap-2 border-b border-white/[0.08] px-3.5 py-2.5 ${
          settings.liquidGlass ? 'bg-white/[0.04]' : 'bg-[#1E1E1E]'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            if (state.animeId) onOpenAnimeId(state.animeId);
          }}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-[12px] font-bold text-white hover:underline">
            {state.title}
          </p>
          {state.subtitle && (
            <p className="truncate text-[10.5px] text-[#3EA6FF]">{state.subtitle}</p>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {hasQueue && (
            <button
              type="button"
              onClick={() => miniPlayer.nextTrack()}
              aria-label="Next theme track"
              title="Next Track"
              className="rounded-full p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => miniPlayer.toggleMinimize()}
            aria-label={state.minimized ? 'Expand mini-player' : 'Minimize mini-player'}
            className="rounded-full p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white"
          >
            {state.minimized ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => miniPlayer.close()}
            aria-label="Close mini-player"
            className="rounded-full p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Video / Audio Embed Body */}
      {!state.minimized && (
        <div className="bg-black">
          {state.youtubeId ? (
            <div className="aspect-video w-full">
              <iframe
                key={state.youtubeId}
                src={`https://www.youtube-nocookie.com/embed/${state.youtubeId}?autoplay=1&rel=0${
                  settings.defaultTrailerMuted ? '&mute=1' : ''
                }`}
                title={state.title}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 p-3.5 text-[12px]">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF0000]/20 text-[#FF0000]">
                  <Music className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">
                    {state.subtitle || 'Theme Jukebox'}
                  </p>
                  <p className="text-[10.5px] text-[#AAAAAA]">
                    YouTube Music / Video Lookup
                  </p>
                </div>
              </div>
              {ytSearchUrl && (
                <a
                  href={ytSearchUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FF0000] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#D90000]"
                >
                  Listen <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
