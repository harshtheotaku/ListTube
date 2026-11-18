import { Anime, LibraryState, MediaType } from '../types';
import { animeStore } from './animeStore';
import { UserProfile } from './profile';

export type CollageTheme = 'obsidian' | 'crimson' | 'daylight';
export type TierRank = 'S' | 'A' | 'B' | 'C' | 'D';
export type TierBuckets = Record<TierRank, Anime[]>;
export const TIER_ORDER: TierRank[] = ['S', 'A', 'B', 'C', 'D'];

export function pickDefaultTierBuckets(
  lib: LibraryState,
  mediaType: MediaType
): TierBuckets {
  const buckets: TierBuckets = { S: [], A: [], B: [], C: [], D: [] };
  const ranked = Object.values(lib.entries)
    .filter((e) => (e.mediaType ?? 'ANIME') === mediaType)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  for (const e of ranked) {
    const a = animeStore.get(e.animeId);
    if (!a || !a.cover) continue;
    const sc = e.score ?? a.score ?? 0;
    const tier: TierRank =
      sc >= 9 ? 'S' : sc >= 8 ? 'A' : sc >= 7 ? 'B' : sc >= 6 ? 'C' : 'D';
    if (buckets[tier].length < 6) buckets[tier].push(a);
  }

  // Fallback fill from top catalog items if user list is empty
  if (TIER_ORDER.every((t) => buckets[t].length === 0)) {
    const fallback = animeStore
      .all()
      .filter((a) => (a.mediaType ?? 'ANIME') === mediaType && a.cover)
      .slice(0, 10);
    fallback.forEach((a, idx) => {
      const tier = TIER_ORDER[Math.min(TIER_ORDER.length - 1, Math.floor(idx / 2))];
      buckets[tier].push(a);
    });
  }
  return buckets;
}

export async function exportTierListPng(
  buckets: TierBuckets,
  heading: string,
  theme: CollageTheme
): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const W = 1280;
  const rowH = 175;
  const H = 160 + TIER_ORDER.length * (rowH + 14) + 60;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const palette =
    theme === 'daylight'
      ? { bg: '#F4F4F7', card: '#E2E4EC', text: '#121216', muted: '#555762', accent: '#FF0000' }
      : theme === 'crimson'
        ? { bg: '#16080B', card: '#281016', text: '#FFFFFF', muted: '#E5B8C1', accent: '#FF2D55' }
        : { bg: '#09090C', card: '#17171D', text: '#FFFFFF', muted: '#8E8E93', accent: '#3EA6FF' };

  const TIER_COLORS: Record<TierRank, string> = {
    S: '#FF453A',
    A: '#FF9F0A',
    B: '#FFD60A',
    C: '#30D158',
    D: '#64D2FF',
  };

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = palette.text;
  ctx.font = '800 40px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(heading.trim() || 'My Anime Tier List', 44, 72);

  ctx.fillStyle = palette.muted;
  ctx.font = '600 20px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('ListTube · Tier List Maker', 44, 108);

  const allCovers = TIER_ORDER.flatMap((t) => buckets[t].slice(0, 8));
  const loaded = await Promise.all(allCovers.map((a) => loadCorsImage(a.cover ?? '')));
  let imgCursor = 0;

  for (let r = 0; r < TIER_ORDER.length; r += 1) {
    const tier = TIER_ORDER[r];
    const items = buckets[tier].slice(0, 8);
    const y = 144 + r * (rowH + 14);

    // Tier Rank badge box
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(44, y, 110, rowH, 18);
    ctx.fillStyle = TIER_COLORS[tier];
    ctx.fill();
    ctx.fillStyle = '#09090C';
    ctx.font = '900 54px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tier, 99, y + rowH / 2 + 2);
    ctx.restore();

    // Row container
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(168, y, W - 212, rowH, 18);
    ctx.fillStyle = palette.card;
    ctx.fill();
    ctx.restore();

    const thumbW = 114;
    const thumbH = rowH - 20;
    for (let c = 0; c < items.length; c += 1) {
      const img = loaded[imgCursor++];
      const x = 182 + c * (thumbW + 14);
      const ty = y + 10;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, ty, thumbW, thumbH, 12);
      ctx.clip();
      ctx.fillStyle = '#111116';
      ctx.fillRect(x, ty, thumbW, thumbH);
      if (img) {
        const scale = Math.max(thumbW / img.width, thumbH / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, x + (thumbW - dw) / 2, ty + (thumbH - dh) / 2, dw, dh);
      }
      ctx.restore();
    }
  }

  ctx.fillStyle = palette.accent;
  ctx.font = '700 20px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('https://listtube.vercel.app', 44, H - 24);

  const link = document.createElement('a');
  link.download = `listtube-tierlist-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  return true;
}

export function pickDefaultCollageSlots(
  lib: LibraryState,
  profile: UserProfile,
  mediaType: MediaType
): Anime[] {
  const favIds =
    mediaType === 'MANGA' ? profile.favoriteMangaIds ?? [] : profile.favoriteAnimeIds ?? [];
  const chosen: Anime[] = [];
  const seen = new Set<string>();

  for (const id of favIds) {
    const a = animeStore.get(id);
    if (a && !seen.has(a.id)) {
      seen.add(a.id);
      chosen.push(a);
      if (chosen.length === 9) return chosen;
    }
  }

  const ranked = Object.values(lib.entries)
    .filter((e) => (e.mediaType ?? 'ANIME') === mediaType)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  for (const e of ranked) {
    const a = animeStore.get(e.animeId);
    if (a && a.cover && !seen.has(a.id)) {
      seen.add(a.id);
      chosen.push(a);
      if (chosen.length === 9) return chosen;
    }
  }

  if (chosen.length < 9) {
    for (const a of animeStore.all()) {
      if ((a.mediaType ?? 'ANIME') === mediaType && a.cover && !seen.has(a.id)) {
        seen.add(a.id);
        chosen.push(a);
        if (chosen.length === 9) break;
      }
    }
  }
  return chosen;
}

function loadCorsImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 5000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

export async function exportCollagePng(
  slots: (Anime | null)[],
  heading: string,
  theme: CollageTheme
): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const W = 1200;
  const H = 1320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const palette =
    theme === 'daylight'
      ? { bg: '#F4F4F7', card: '#E2E4EC', text: '#121216', muted: '#555762', accent: '#FF0000' }
      : theme === 'crimson'
      ? { bg: '#16080B', card: '#281016', text: '#FFFFFF', muted: '#E5B8C1', accent: '#FF2D55' }
      : { bg: '#09090C', card: '#17171D', text: '#FFFFFF', muted: '#8E8E93', accent: '#3EA6FF' };

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = palette.text;
  ctx.font = '800 42px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(heading.trim() || 'My 3×3 Favorites', 48, 76);

  ctx.fillStyle = palette.muted;
  ctx.font = '600 22px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('ListTube · 3×3 Grid Builder', 48, 112);

  const imgs = await Promise.all(slots.slice(0, 9).map((s) => loadCorsImage(s?.cover ?? '')));
  const padX = 48;
  const startY = 148;
  const gap = 18;
  const cellW = Math.floor((W - padX * 2 - gap * 2) / 3);
  const cellH = Math.floor((H - startY - 76 - gap * 2) / 3);

  for (let i = 0; i < 9; i += 1) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = padX + col * (cellW + gap);
    const y = startY + row * (cellH + gap);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, cellW, cellH, 20);
    ctx.clip();

    ctx.fillStyle = palette.card;
    ctx.fillRect(x, y, cellW, cellH);

    const img = imgs[i];
    const item = slots[i];
    if (img) {
      const scale = Math.max(cellW / img.width, cellH / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, x + (cellW - dw) / 2, y + (cellH - dh) / 2, dw, dh);
    }

    const grad = ctx.createLinearGradient(x, y + cellH * 0.55, x, y + cellH);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.88)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, cellW, cellH);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 21px -apple-system, BlinkMacSystemFont, sans-serif';
    const titleText = (item?.title ?? `Slot #${i + 1}`).slice(0, 26);
    ctx.fillText(titleText, x + 16, y + cellH - 18);
    ctx.restore();
  }

  ctx.fillStyle = palette.accent;
  ctx.font = '700 20px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('https://listtube.vercel.app', 48, H - 28);

  const link = document.createElement('a');
  link.download = `listtube-3x3-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  return true;
}
