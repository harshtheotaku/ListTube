import React, { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, User, X } from 'lucide-react';
import { BUILT_IN_AVATARS, profileStore, useProfile } from '../services/profile';
import { toast } from './Toast';

interface ProfileModalProps {
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

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const profile = useProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [nameInput, setNameInput] = useState(profile.name);
  const [handleInput, setHandleInput] = useState(profile.handle.replace(/^@/, ''));

  useEffect(() => {
    if (isOpen) {
      setNameInput(profile.name);
      setHandleInput(profile.handle.replace(/^@/, ''));
    }
  }, [isOpen, profile.name, profile.handle]);

  if (!isOpen) return null;

  const saveName = () => {
    profileStore.updateProfile({ name: nameInput, handle: handleInput });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      profileStore.setCustomAvatar(dataUrl);
      toast('Profile picture updated');
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
      aria-label="Edit Profile and PFP"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          saveName();
          onClose();
        }
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/[0.1] bg-[#1F1F1F] text-white shadow-2xl sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 className="flex items-center gap-2 text-[16px] font-bold text-white">
            <User className="h-4 w-4 text-[#FF0000]" />
            Edit Profile &amp; PFP
          </h2>
          <button
            type="button"
            onClick={() => {
              saveName();
              onClose();
            }}
            aria-label="Close"
            className="rounded-full p-1.5 text-[#AAAAAA] transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#272727] p-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                className="h-14 w-14 shrink-0 rounded-full border-2 border-[#FF0000] object-cover bg-[#181818]"
              />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold text-white">{profile.name}</p>
                <p className="truncate text-[12px] text-[#AAAAAA]">{profile.handle}</p>
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
              Upload
            </button>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                Name
              </label>
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={saveName}
                placeholder="Your Name"
                className="w-full rounded-xl border border-white/[0.12] bg-[#141414] px-3 py-2 text-[16px] text-white outline-none focus:border-[#3EA6FF] lg:text-[13px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                Handle
              </label>
              <div className="flex items-center rounded-xl border border-white/[0.12] bg-[#141414] px-3 focus-within:border-[#3EA6FF]">
                <span className="text-[13px] text-[#AAAAAA]">@</span>
                <input
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                  onBlur={saveName}
                  placeholder="handle"
                  className="w-full bg-transparent py-2 pl-1 text-[16px] text-white outline-none lg:text-[13px]"
                />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
              Popular Character PFPs
            </p>
            <div className="grid grid-cols-4 gap-2">
              {BUILT_IN_AVATARS.map((char) => {
                const selected = profile.avatarId === char.id;
                return (
                  <button
                    key={char.id}
                    type="button"
                    onClick={() => {
                      profileStore.selectCharacterAvatar(char);
                      toast(`PFP set to ${char.name}`);
                    }}
                    title={`${char.name} (${char.series})`}
                    className={`relative flex flex-col items-center gap-1 rounded-xl border p-1.5 transition ${
                      selected
                        ? 'border-[#FF0000] bg-[#FF0000]/15'
                        : 'border-white/[0.06] bg-[#272727]/60 hover:border-white/25'
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
                      {char.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-white/[0.08] px-5 py-3 text-right">
          <button
            type="button"
            onClick={() => {
              saveName();
              toast('Profile saved');
              onClose();
            }}
            className="rounded-full bg-white px-5 py-2 text-[12px] font-bold text-black hover:bg-neutral-200"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
