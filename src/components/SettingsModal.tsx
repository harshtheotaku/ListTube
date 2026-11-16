import React from 'react';
import { Play, RefreshCw, Settings, X } from 'lucide-react';
import { settingsStore, useSettings } from '../services/settings';
import { animeStore } from '../services/animeStore';
import { toast } from './Toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const settings = useSettings();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/85 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl border border-white/[0.1] bg-[#1F1F1F] text-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 id="settings-title" className="flex items-center gap-2 text-[16px] font-bold text-white">
            <Settings className="h-4 w-4 text-[#FF0000]" />
            ListTube Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-full p-1.5 text-[#AAAAAA] transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Auto-play Trailer Toggle */}
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#272727] p-4">
            <div className="flex items-start gap-3">
              <Play className="mt-0.5 h-5 w-5 shrink-0 text-[#FF0000]" />
              <div>
                <p className="text-[13.5px] font-bold text-white">Auto-Play Trailers</p>
                <p className="mt-0.5 text-[11.5px] text-[#AAAAAA]">
                  Automatically start official trailers when opening an anime instead of waiting to click Play Trailer.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.autoplayTrailer}
              onClick={() => settingsStore.setAutoplayTrailer(!settings.autoplayTrailer)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                settings.autoplayTrailer ? 'bg-[#FF0000]' : 'bg-white/20'
              }`}
            >
              <span
                className={`block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                  settings.autoplayTrailer ? 'translate-x-5.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Clear Thumbnail / Artwork Cache */}
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#272727] p-4">
            <div className="flex items-start gap-3">
              <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-[#3EA6FF]" />
              <div>
                <p className="text-[13.5px] font-bold text-white">Refresh Artwork Cache</p>
                <p className="mt-0.5 text-[11.5px] text-[#AAAAAA]">
                  Re-fetch high-resolution banners &amp; posters from AniList while keeping your watchlist intact.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                animeStore.clearUnpinned();
                toast('Artwork cache refreshed — reload to fetch latest banners');
              }}
              className="shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-[11.5px] font-bold text-white hover:bg-white/20"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="border-t border-white/[0.08] px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white px-5 py-2 text-[12px] font-bold text-black hover:bg-neutral-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
