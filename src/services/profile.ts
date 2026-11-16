import { useSyncExternalStore } from 'react';

export interface CharacterAvatar {
  id: string;
  name: string;
  series: string;
  url: string;
}

export interface UserProfile {
  name: string;
  handle: string;
  avatarId: string;
  avatarUrl: string;
}

/**
 * Built-in official character portraits curated from top AniList character entries
 * (verified direct CDN artwork, zero AI-generated images).
 */
export const BUILT_IN_AVATARS: CharacterAvatar[] = [
  {
    id: 'gojo',
    name: 'Gojo',
    series: 'Jujutsu Kaisen',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b127691-9zqh1xpIubn7.png',
  },
  {
    id: 'frieren',
    name: 'Frieren',
    series: 'Frieren: Beyond Journey’s End',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b176754-PCnpqIOkjhFk.png',
  },
  {
    id: 'luffy',
    name: 'Luffy',
    series: 'One Piece',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b40-MNypXsxSRb1R.png',
  },
  {
    id: 'levi',
    name: 'Levi',
    series: 'Attack on Titan',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b45627-CR68RyZmddGG.png',
  },
  {
    id: 'killua',
    name: 'Killua',
    series: 'Hunter x Hunter',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b27-Z5O02kQUydpT.jpg',
  },
  {
    id: 'zoro',
    name: 'Zoro',
    series: 'One Piece',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b62-S7oAeA9WInjV.png',
  },
  {
    id: 'eren',
    name: 'Eren',
    series: 'Attack on Titan',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b40882-dsj7IP943WFF.jpg',
  },
  {
    id: 'lelouch',
    name: 'Lelouch',
    series: 'Code Geass',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b417-gVLmIJu9phcK.png',
  },
  {
    id: 'emilia',
    name: 'Emilia',
    series: 'Re:ZERO',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b88572-IzTwXEHSobRs.jpg',
  },
  {
    id: 'maomao',
    name: 'Maomao',
    series: 'The Apothecary Diaries',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b126824-MqsCncTO1qpv.png',
  },
  {
    id: 'guts',
    name: 'Guts',
    series: 'Berserk',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b422-XTaiTuvRohsV.png',
  },
  {
    id: 'l',
    name: 'L',
    series: 'Death Note',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b71-1W4panC53vfs.png',
  },
  {
    id: 'mikasa',
    name: 'Mikasa',
    series: 'Attack on Titan',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b40881-F3gr1PkreDvj.png',
  },
  {
    id: 'kurisu',
    name: 'Kurisu',
    series: 'Steins;Gate',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b34470-Jw2LXZBL5R8i.png',
  },
  {
    id: 'anya',
    name: 'Anya',
    series: 'SPY x FAMILY',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b138100-4Li0tWRCa5bQ.png',
  },
  {
    id: 'spike',
    name: 'Spike',
    series: 'Cowboy Bebop',
    url: 'https://s4.anilist.co/file/anilistcdn/character/large/b1-ChxaldmieFlQ.png',
  },
];

const PROFILE_KEY = 'anitube.profile.v1';

const DEFAULT_PROFILE: UserProfile = {
  name: 'ListTube Viewer',
  handle: '@listtube_fan',
  avatarId: BUILT_IN_AVATARS[0].id,
  avatarUrl: BUILT_IN_AVATARS[0].url,
};

function sanitizeHandle(raw: string): string {
  const clean = raw
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 24);
  if (!clean || clean === 'anitube_fan') return '@listtube_fan';
  return `@${clean}`;
}

function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    const rawName = parsed.name?.trim();
    return {
      name: !rawName || rawName === 'AniTube Viewer' ? DEFAULT_PROFILE.name : rawName,
      handle: sanitizeHandle(parsed.handle || parsed.name || DEFAULT_PROFILE.handle),
      avatarId: parsed.avatarId || DEFAULT_PROFILE.avatarId,
      avatarUrl: parsed.avatarUrl || DEFAULT_PROFILE.avatarUrl,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

let currentProfile: UserProfile = loadProfile();
const listeners = new Set<() => void>();

function save(next: UserProfile) {
  currentProfile = next;
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export const profileStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): UserProfile {
    return currentProfile;
  },
  updateProfile(patch: Partial<UserProfile>) {
    const nextName =
      patch.name !== undefined ? patch.name.trim().slice(0, 32) || DEFAULT_PROFILE.name : currentProfile.name;
    const nextHandle =
      patch.handle !== undefined
        ? sanitizeHandle(patch.handle)
        : patch.name !== undefined && currentProfile.handle === DEFAULT_PROFILE.handle
          ? sanitizeHandle(nextName)
          : currentProfile.handle;
    save({
      name: nextName,
      handle: nextHandle,
      avatarId: patch.avatarId ?? currentProfile.avatarId,
      avatarUrl: patch.avatarUrl ?? currentProfile.avatarUrl,
    });
  },
  selectCharacterAvatar(character: CharacterAvatar) {
    save({
      ...currentProfile,
      avatarId: character.id,
      avatarUrl: character.url,
    });
  },
  setCustomAvatar(dataUrl: string) {
    save({
      ...currentProfile,
      avatarId: 'custom',
      avatarUrl: dataUrl,
    });
  },
  reset() {
    save(DEFAULT_PROFILE);
  },
  replaceFromCloud(next: UserProfile) {
    save({
      name: next.name?.trim().slice(0, 32) || DEFAULT_PROFILE.name,
      handle: sanitizeHandle(next.handle || next.name || DEFAULT_PROFILE.handle),
      avatarId: next.avatarId || DEFAULT_PROFILE.avatarId,
      avatarUrl: next.avatarUrl || DEFAULT_PROFILE.avatarUrl,
    });
  },
};

export function useProfile(): UserProfile {
  return useSyncExternalStore(profileStore.subscribe, profileStore.getSnapshot);
}
