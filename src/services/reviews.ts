import { Anime } from '../types';
import { resolveMalUrl } from './platform';
import { fetchMalEdgeHtml } from './supabase';

export interface PinnedReview {
  id: string;
  author: string;
  authorAvatar?: string;
  date?: string;
  tag: string;
  source: 'MyAnimeList' | 'AniList';
  excerpt: string;
  fullText: string;
  url: string;
  reactions?: number;
}

const reviewCache = new Map<string, PinnedReview | null>();

function cleanReviewText(raw: string): string {
  return raw
    .replace(/\[spoiler\][\s\S]*?\[\/spoiler\]/gi, '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeSpoilerText(text: string, tag: string): boolean {
  const lowerTag = tag.toLowerCase();
  if (lowerTag.includes('spoiler')) return true;
  const first400 = text.slice(0, 400).toLowerCase();
  if (first400.includes('spoiler free') || first400.includes('spoiler-free') || first400.includes('no spoilers')) {
    return false;
  }
  return /(\blight|\bminor|\bmajor|\bsome|\bheavy|contains|include[sd]?|with)\s+spoilers?|spoilers?\s*(ahead|alert|warning)/i.test(
    first400
  );
}

function makeExcerpt(clean: string, maxChars = 300): string {
  if (clean.length <= maxChars) return clean;
  const slice = clean.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > 180 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

/**
 * Fetches a short, strictly spoiler-free user review directly from MyAnimeList's
 * review section (with Jikan & AniList spoiler-free summary fallbacks on static hosts).
 */
async function fetchFromMalHtml(anime: Anime): Promise<PinnedReview | null> {
  if (!anime.malId) return null;
  const typeSeg = anime.mediaType === 'MANGA' ? 'manga' : 'anime';

  try {
    let html = await fetchMalEdgeHtml(typeSeg, anime.malId, 'reviews');
    if (!html) {
      const url = resolveMalUrl(`/${typeSeg}/${anime.malId}/_/reviews?spoiler=off`);
      if (!url) return null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      html = await res.text();
    }
    if (!html) return null;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const elements = Array.from(doc.querySelectorAll('.review-element'));

    interface ParsedCandidate {
      item: PinnedReview;
      recommendedScore: number;
    }

    const candidates: ParsedCandidate[] = [];

    for (let i = 0; i < elements.length && i < 12; i++) {
      const el = elements[i];
      const tag = el.querySelector('.tags .tag')?.textContent?.trim() || 'Community Review';
      const author = el.querySelector('.username a')?.textContent?.trim() || 'MAL Reviewer';
      const avatarEl = el.querySelector('.thumb img');
      const authorAvatar =
        avatarEl?.getAttribute('data-src') || avatarEl?.getAttribute('src') || undefined;
      const date = el.querySelector('.update_at')?.textContent?.trim() || undefined;

      // Preserve complete non-spoiler review body (including .js-hidden expansion on MAL HTML!)
      const textNode = el.querySelector('.text');
      if (!textNode) continue;

      const clone = textNode.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.js-readmore, .btn-show-more, button').forEach((n) => n.remove());
      const fullClean = cleanReviewText(clone.textContent ?? '');

      if (fullClean.length < 60 || looksLikeSpoilerText(fullClean, tag)) continue;

      let reactionCount = 0;
      try {
        const rawReactions = el.getAttribute('data-reactions');
        if (rawReactions) {
          const parsed = JSON.parse(rawReactions) as { num?: number };
          reactionCount = parsed.num ?? 0;
        }
      } catch {
        /* ignore */
      }

      const isRecommended = tag.toLowerCase().startsWith('recommended') ? 100000 : 0;

      candidates.push({
        recommendedScore: isRecommended + reactionCount,
        item: {
          id: `mal-rev-${anime.malId}-${i}`,
          author,
          authorAvatar,
          date,
          tag,
          source: 'MyAnimeList',
          excerpt: makeExcerpt(fullClean, 360),
          fullText: fullClean,
          url: `https://myanimelist.net/${typeSeg}/${anime.malId}/_/reviews?spoiler=off`,
          reactions: reactionCount || undefined,
        },
      });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.recommendedScore - a.recommendedScore);
    return candidates[0].item;
  } catch {
    return null;
  }
}

async function fetchFromJikan(anime: Anime): Promise<PinnedReview | null> {
  if (!anime.malId) return null;
  const typeSeg = anime.mediaType === 'MANGA' ? 'manga' : 'anime';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    const res = await fetch(`https://api.jikan.moe/v4/${typeSeg}/${anime.malId}/reviews`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const json = (await res.json()) as {
      data?: {
        mal_id: number;
        url: string;
        date?: string;
        review: string;
        tags?: string[];
        is_spoiler?: boolean;
        reactions?: { overall?: number };
        user?: { username?: string; images?: { webp?: { image_url?: string }; jpg?: { image_url?: string } } };
      }[];
    };

    const nonSpoilers = (json.data ?? []).filter(
      (r) => !r.is_spoiler && r.review && !looksLikeSpoilerText(r.review, (r.tags ?? []).join(' '))
    );
    if (!nonSpoilers.length) return null;

    nonSpoilers.sort((a, b) => {
      const aRec = a.tags?.includes('Recommended') ? 10000 : 0;
      const bRec = b.tags?.includes('Recommended') ? 10000 : 0;
      return bRec + (b.reactions?.overall ?? 0) - (aRec + (a.reactions?.overall ?? 0));
    });

    const pick = nonSpoilers[0];
    const clean = cleanReviewText(pick.review);
    return {
      id: `jikan-rev-${pick.mal_id}`,
      author: pick.user?.username || 'MAL Reviewer',
      authorAvatar: pick.user?.images?.webp?.image_url || pick.user?.images?.jpg?.image_url,
      date: pick.date ? new Date(pick.date).toLocaleDateString() : undefined,
      tag: pick.tags?.[0] || 'Recommended',
      source: 'MyAnimeList',
      excerpt: makeExcerpt(clean, 360),
      fullText: clean,
      url: pick.url || `https://myanimelist.net/${typeSeg}/${anime.malId}/_/reviews`,
      reactions: pick.reactions?.overall,
    };
  } catch {
    return null;
  }
}

async function fetchFromAniListSummary(anime: Anime): Promise<PinnedReview | null> {
  if (!anime.anilistId) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: `query($id: Int){
          Media(id: $id) {
            reviews(sort: [RATING_DESC], perPage: 5) {
              nodes {
                id
                summary
                body
                rating
                createdAt
                siteUrl
                user { name avatar { medium } }
              }
            }
          }
        }`,
        variables: { id: anime.anilistId },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        Media?: {
          reviews?: {
            nodes?: {
              id: number;
              summary?: string;
              body?: string;
              rating?: number;
              createdAt?: number;
              siteUrl?: string;
              user?: { name?: string; avatar?: { medium?: string } };
            }[];
          };
        };
      };
    };

    const nonSpoilerNodes = (json.data?.Media?.reviews?.nodes ?? []).filter((n) => {
      const text = n.body || n.summary || '';
      return text.length > 40 && !looksLikeSpoilerText(text, '');
    });
    const node = nonSpoilerNodes[0] ?? (json.data?.Media?.reviews?.nodes ?? []).find((n) => (n.summary?.length ?? 0) > 20);
    if (!node) return null;

    const clean = cleanReviewText(node.body || node.summary || '');
    return {
      id: `al-rev-${node.id}`,
      author: node.user?.name || 'Anime Fan',
      authorAvatar: node.user?.avatar?.medium,
      date: node.createdAt ? new Date(node.createdAt * 1000).toLocaleDateString() : undefined,
      tag: 'Spoiler-Free Review',
      source: 'AniList',
      excerpt: makeExcerpt(clean, 360),
      fullText: clean,
      url: node.siteUrl || `https://anilist.co`,
      reactions: node.rating,
    };
  } catch {
    return null;
  }
}

export async function fetchPinnedSpoilerFreeReview(anime: Anime): Promise<PinnedReview | null> {
  if (reviewCache.has(anime.id)) return reviewCache.get(anime.id) ?? null;

  let review = await fetchFromMalHtml(anime);
  if (!review) review = await fetchFromJikan(anime);
  if (!review) review = await fetchFromAniListSummary(anime);

  reviewCache.set(anime.id, review);
  return review;
}
