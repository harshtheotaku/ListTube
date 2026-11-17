import { Anime, AppSettings } from '../types';

const SAFE_EXCLUDED_GENRES = new Set(['Ecchi', 'Hentai']);
const SAFE_EXCLUDED_TAGS = new Set([
  'Nudity',
  'Gore',
  'Torture',
  'Rape',
  'Sexual Content',
  'Erotica',
]);
const BALANCED_EXCLUDED_GENRES = new Set(['Hentai']);

export function passesContentSettings(anime: Anime, settings: AppSettings): boolean {
  const blocked = new Set(settings.blockedGenres.map((g) => g.toLowerCase()));
  if (blocked.size > 0) {
    if (anime.genres.some((g) => blocked.has(g.toLowerCase()))) return false;
    if (anime.tags.some((t) => blocked.has(t.toLowerCase()))) return false;
  }

  if (settings.contentFilter === 'safe') {
    if (anime.genres.some((g) => SAFE_EXCLUDED_GENRES.has(g))) return false;
    if (anime.tags.some((t) => SAFE_EXCLUDED_TAGS.has(t))) return false;
  } else if (settings.contentFilter === 'balanced') {
    if (anime.genres.some((g) => BALANCED_EXCLUDED_GENRES.has(g))) return false;
  }

  return true;
}
