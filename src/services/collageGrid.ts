import { Anime, LibraryState, MediaType } from '../types';
import { animeStore } from './animeStore';
import { UserProfile } from './profile';

export type CollageTheme = 'obsidian' | 'crimson' | 'daylight';

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
