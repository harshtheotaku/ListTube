import React, { useRef, useState } from 'react';
import { Check, ImagePlus, Play, RefreshCw, Settings, User, X } from 'lucide-react';
import { settingsStore, useSettings } from '../services/settings';
import { animeStore } from '../services/animeStore';
import { BUILT_IN_AVATARS, profileStore, useProfile } from '../services/profile';
import { toast } from './Toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 192;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const settings = useSettings();
  const profile = useProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [nameInput, setNameInput] = useState(profile.name);
  const [handleInput, setHandleInput] = useState(profile.handle.replace(/^@/, ''));

  if (!isOpen) return null;

  const handleSaveName = () => {
    profileStore.updateProfile({ name: nameInput, handle: handleInput });
    toast('Profile updated');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      profileStore.setCustomAvatar(dataUrl);
      toast('Custom profile picture updated');
    } catch {
      toast('Could not load image file');
    }
    e.target.value = '';
  };

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
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/[0.1] bg-[#1F1F1F] text-white shadow-2xl sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 id="settings-title" className="flex items-center gap-2 text-[16px] font-bold text-white">
            <Settings className="h-4 w-4 text-[#FF0000]" />
            AniTube Settings &amp; Profile
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

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Profile & Built-In Character PFP Picker */}
          <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#272727] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="h-14 w-14 shrink-0 rounded-full border-2 border-[#FF0000] object-cover bg-[#181818]"
                />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-white">
                    <User className="h-3.5 w-3.5 text-[#FF0000]" />
                    Channel Profile &amp; PFP
                  </p>
                  <p className="truncate text-[11.5px] text-[#AAAAAA]">
                    {profile.name} ({profile.handle})
                  </p>
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-white/20"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                Upload PFP
              </button>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                  Display Name
                </label>
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={handleSaveName}
                  placeholder="Your Name"
                  className="w-full rounded-xl border border-white/[0.12] bg-[#161616] px-3 py-2 text-[16px] text-white outline-none focus:border-[#3EA6FF] lg:text-[13px]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                  Handle
                </label>
                <div className="flex items-center rounded-xl border border-white/[0.12] bg-[#161616] px-3 focus-within:border-[#3EA6FF]">
                  <span className="text-[13px] text-[#AAAAAA]">@</span>
                  <input
                    value={handleInput}
                    onChange={(e) => setHandleInput(e.target.value)}
                    onBlur={handleSaveName}
                    placeholder="handle"
                    className="w-full bg-transparent py-2 pl-1 text-[16px] text-white outline-none lg:text-[13px]"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                  Popular Character Avatars
                </p>
                <button
                  type="button"
                  onClick={handleSaveName}
                  className="text-[11px] font-bold text-[#3EA6FF] hover:underline"
                >
                  Save Profile
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
                {BUILT_IN_AVATARS.map((char) => {
                  const selected = profile.avatarId === char.id;
                  return (
                    <button
                      key={char.id}
                      type="button"
                      onClick={() => {
                        profileStore.selectCharacterAvatar(char);
                        toast(`Avatar set to ${char.name}`);
                      }}
                      title={`${char.name} (${char.series})`}
                      className={`group relative flex flex-col items-center gap-1 rounded-xl border p-1.5 transition ${
                        selected
                          ? 'border-[#FF0000] bg-[#FF0000]/15'
                          : 'border-white/[0.06] bg-[#1B1B1B] hover:border-white/25'
                      }`}
                    >
                      <div className="relative">
                        <img
                          src={char.url}
                          alt={char.name}
                          className="h-12 w-12 rounded-full object-cover bg-black"
                        />
                        {selected && (
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#FF0000] text-white shadow">
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <span className="line-clamp-1 w-full text-center text-[10px] font-semibold text-neutral-200">
                        {char.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

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

        <div className="shrink-0 border-t border-white/[0.08] px-5 py-3 text-right">
          <button
            type="button"
            onClick={() => {
              handleSaveName();
              onClose();
            }}
            className="rounded-full bg-white px-5 py-2 text-[12px] font-bold text-black hover:bg-neutral-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
