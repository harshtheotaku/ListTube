import React, { useEffect, useRef, useState } from 'react';
import { Check, Heart, ImagePlus, Sparkles, Trash2, User, X } from 'lucide-react';
import {
  BUILT_IN_AVATARS,
  BUILT_IN_BANNERS,
  profileStore,
  useProfile,
} from '../services/profile';
import { animeStore } from '../services/animeStore';
import { cloudSync, useCloudSync } from '../services/cloudSync';
import { toast } from './Toast';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CustomizeTab = 'branding' | 'info' | 'favorites';

function resizeImageToDataUrl(file: File, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        const targetRatio = width / height;
        const srcRatio = img.width / img.height;
        let sx = 0;
        let sy = 0;
        let sw = img.width;
        let sh = img.height;
        if (srcRatio > targetRatio) {
          sw = img.height * targetRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetRatio;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
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
  const cloud = useCloudSync();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<CustomizeTab>('branding');
  const [nameInput, setNameInput] = useState(profile.name);
  const [handleInput, setHandleInput] = useState(profile.handle.replace(/^@/, ''));
  const [bioInput, setBioInput] = useState(profile.bio ?? '');
  const [locationInput, setLocationInput] = useState(profile.location ?? '');
  const [uploading, setUploading] = useState<'avatar' | 'banner' | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNameInput(profile.name);
      setHandleInput(profile.handle.replace(/^@/, ''));
      setBioInput(profile.bio ?? '');
      setLocationInput(profile.location ?? '');
    }
  }, [isOpen, profile.name, profile.handle, profile.bio, profile.location]);

  if (!isOpen) return null;

  const saveInfo = () => {
    profileStore.updateProfile({
      name: nameInput,
      handle: handleInput,
      bio: bioInput,
      location: locationInput,
    });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading('avatar');
    try {
      if (cloud.userId) {
        try {
          const publicUrl = await cloudSync.uploadAvatar(file);
          profileStore.setCustomAvatar(publicUrl);
          toast('Channel avatar uploaded to cloud');
          return;
        } catch {
          /* fallback below */
        }
      }
      const dataUrl = await resizeImageToDataUrl(file, 224, 224);
      profileStore.setCustomAvatar(dataUrl);
      toast(cloud.isLinked ? 'Channel avatar updated & synced' : 'Channel avatar updated');
    } catch {
      toast('Could not load image file');
    } finally {
      setUploading(null);
      e.target.value = '';
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading('banner');
    try {
      if (cloud.userId) {
        try {
          const publicUrl = await cloudSync.uploadAvatar(file);
          profileStore.setCustomBanner(publicUrl);
          toast('Channel banner uploaded to cloud');
          return;
        } catch {
          /* fallback below */
        }
      }
      const dataUrl = await resizeImageToDataUrl(file, 960, 300);
      profileStore.setCustomBanner(dataUrl);
      toast(cloud.isLinked ? 'Channel banner updated & synced' : 'Channel banner updated');
    } catch {
      toast('Could not load banner image');
    } finally {
      setUploading(null);
      e.target.value = '';
    }
  };

  const favAnime = (profile.favoriteAnimeIds ?? [])
    .map((id) => animeStore.get(id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  const favManga = (profile.favoriteMangaIds ?? [])
    .map((id) => animeStore.get(id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  const favCharIds = profile.favoriteCharacters ?? [];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/85 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Customize Channel and MAL Profile"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          saveInfo();
          onClose();
        }
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/[0.1] bg-[#1F1F1F] text-white shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 className="flex items-center gap-2 text-[16px] font-bold text-white">
            <User className="h-4 w-4 text-[#FF0000]" />
            Customize Channel Profile
          </h2>
          <button
            type="button"
            onClick={() => {
              saveInfo();
              onClose();
            }}
            aria-label="Close"
            className="rounded-full p-1.5 text-[#AAAAAA] transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* YouTube Studio Style Tabs */}
        <div className="grid shrink-0 grid-cols-3 border-b border-white/[0.08] bg-[#181818] px-5 pt-2">
          {([
            { id: 'branding', label: 'Branding' },
            { id: 'info', label: 'Channel Info' },
            { id: 'favorites', label: 'Favorites' },
          ] as { id: CustomizeTab; label: string }[]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 pb-2.5 text-[12.5px] font-bold transition ${
                activeTab === tab.id
                  ? 'border-[#FF0000] text-white'
                  : 'border-transparent text-[#AAAAAA] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {activeTab === 'branding' && (
            <>
              {/* Channel Banner Picker */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                    Channel Banner
                  </p>
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleBannerUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploading === 'banner'}
                    onClick={() => bannerInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-white hover:bg-white/20"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    {uploading === 'banner' ? 'Uploading…' : 'Upload Banner'}
                  </button>
                </div>

                <div className="relative h-24 w-full overflow-hidden rounded-xl border border-white/10 bg-[#121212]">
                  {profile.bannerUrl ? (
                    <img
                      src={profile.bannerUrl}
                      alt="Channel banner"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {BUILT_IN_BANNERS.map((banner) => {
                    const selected = profile.bannerId === banner.id;
                    return (
                      <button
                        key={banner.id}
                        type="button"
                        onClick={() => {
                          profileStore.selectPresetBanner(banner);
                          toast(`Banner set to ${banner.label}`);
                        }}
                        className={`relative overflow-hidden rounded-lg border transition ${
                          selected ? 'border-[#FF0000] ring-1 ring-[#FF0000]' : 'border-white/10 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={banner.url}
                          alt={banner.label}
                          className="h-11 w-full object-cover"
                        />
                        <span className="block truncate bg-black/75 px-1.5 py-0.5 text-[9.5px] font-semibold text-neutral-200">
                          {banner.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Current Avatar + Upload */}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#272727] p-3.5">
                <div className="flex min-w-0 items-center gap-3">
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
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploading === 'avatar'}
                  onClick={() => avatarInputRef.current?.click()}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-white/20 disabled:opacity-50"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  {uploading === 'avatar' ? 'Uploading…' : 'Upload PFP'}
                </button>
              </div>

              {/* Character Avatar Grid */}
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                  Popular Character Avatars
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
            </>
          )}

          {activeTab === 'info' && (
            <div className="space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                    Display Name
                  </label>
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onBlur={saveInfo}
                    placeholder="Your Name"
                    className="w-full rounded-xl border border-white/[0.12] bg-[#141414] px-3 py-2 text-[16px] text-white outline-none focus:border-[#3EA6FF] lg:text-[13px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                    Channel Handle
                  </label>
                  <div className="flex items-center rounded-xl border border-white/[0.12] bg-[#141414] px-3 focus-within:border-[#3EA6FF]">
                    <span className="text-[13px] text-[#AAAAAA]">@</span>
                    <input
                      value={handleInput}
                      onChange={(e) => setHandleInput(e.target.value)}
                      onBlur={saveInfo}
                      placeholder="handle"
                      className="w-full bg-transparent py-2 pl-1 text-[16px] text-white outline-none lg:text-[13px]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                  Location (Optional)
                </label>
                <input
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  onBlur={saveInfo}
                  placeholder="e.g. Tokyo, Japan"
                  className="w-full rounded-xl border border-white/[0.12] bg-[#141414] px-3 py-2 text-[16px] text-white outline-none focus:border-[#3EA6FF] lg:text-[13px]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                  About / MAL Bio
                </label>
                <textarea
                  rows={4}
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  onBlur={saveInfo}
                  maxLength={280}
                  placeholder="Share your favorite genres, top 3 anime, or watch philosophy..."
                  className="w-full rounded-xl border border-white/[0.12] bg-[#141414] px-3 py-2 text-[16px] text-white outline-none focus:border-[#3EA6FF] lg:text-[13px]"
                />
                <p className="mt-1 text-right text-[10.5px] text-[#777777]">
                  {bioInput.length}/280
                </p>
              </div>
            </div>
          )}

          {activeTab === 'favorites' && (
            <div className="space-y-5">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                  <Sparkles className="h-3.5 w-3.5 text-[#FF0000]" />
                  Favorite Characters (Pick up to 6)
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {BUILT_IN_AVATARS.map((char) => {
                    const selected = favCharIds.includes(char.id);
                    return (
                      <button
                        key={char.id}
                        type="button"
                        onClick={() => {
                          const added = profileStore.toggleFavoriteCharacter(char.id);
                          toast(added ? `${char.name} added to Favorites` : `Removed ${char.name}`);
                        }}
                        className={`relative flex flex-col items-center gap-1 rounded-xl border p-1.5 transition ${
                          selected
                            ? 'border-rose-500 bg-rose-500/15'
                            : 'border-white/[0.06] bg-[#272727]/60 hover:border-white/25'
                        }`}
                      >
                        <img
                          src={char.url}
                          alt={char.name}
                          className="h-11 w-11 rounded-full object-cover bg-black"
                        />
                        {selected && (
                          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white">
                            <Heart className="h-2.5 w-2.5 fill-current" />
                          </span>
                        )}
                        <span className="line-clamp-1 w-full text-center text-[10px] font-semibold text-neutral-200">
                          {char.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                  Pinned Favorite Anime ({favAnime.length}) &amp; Manga ({favManga.length})
                </p>
                {favAnime.length === 0 && favManga.length === 0 ? (
                  <p className="rounded-xl border border-white/[0.06] bg-[#161616] p-3 text-[12px] text-[#AAAAAA]">
                    Open any anime or manga Watch page and tap the <strong>Favorite</strong> heart button to showcase it on your channel profile.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {[...favAnime, ...favManga].map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-[#272727] p-2"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <img
                            src={item.cover}
                            alt={item.title}
                            className="h-11 w-8 shrink-0 rounded object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-bold text-white">{item.title}</p>
                            <p className="text-[10.5px] text-[#AAAAAA]">{item.mediaType}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${item.title} from favorites`}
                          onClick={() => profileStore.toggleFavoriteMedia(item.id, item.mediaType)}
                          className="rounded-full p-1.5 text-[#AAAAAA] hover:bg-white/10 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/[0.08] px-5 py-3">
          <button
            type="button"
            onClick={() => {
              saveInfo();
              toast('Channel profile saved');
              onClose();
            }}
            className="w-full rounded-xl bg-[#FF0000] py-2.5 text-[13px] font-bold text-white transition hover:bg-[#CC0000]"
          >
            Save Channel
          </button>
        </div>
      </div>
    </div>
  );
};
