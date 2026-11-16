import { NewsItem } from '../types';
import { animeStore } from './animeStore';
import { searchAniList } from './anilist';
import { resolveMalUrl } from './platform';
import { fetchNewsEdge } from './supabase';

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scrapes official MyAnimeList News page (via Vite proxy on Web or CapacitorHttp on Android)
 * which provides crisp high-res images for every single news story.
 */
async function fetchMalNewsWithImages(): Promise<NewsItem[]> {
  try {
    let html = await fetchNewsEdge('mal', 0);
    if (!html) {
      const url = resolveMalUrl('/news');
      if (!url) return [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return [];
      html = await res.text();
    }
    if (!html) return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const units = Array.from(doc.querySelectorAll('.news-unit'));

    return units.slice(0, 16).map((unit, idx) => {
      const titleAnchor = unit.querySelector('.title a');
      const title = stripHtml(titleAnchor?.textContent ?? '');
      const href = titleAnchor?.getAttribute('href') ?? 'https://myanimelist.net/news';
      const fullUrl = href.startsWith('http') ? href : `https://myanimelist.net${href}`;

      const imgEl = unit.querySelector('img');
      const srcset = imgEl?.getAttribute('srcset') || imgEl?.getAttribute('data-srcset') || '';
      const src2x = srcset
        .split(',')
        .map((s) => s.trim().split(' ')[0])
        .pop();
      const rawImg =
        src2x ||
        imgEl?.getAttribute('data-src') ||
        imgEl?.getAttribute('src') ||
        '';
      // Upgrade thumbnail resolution from r/100x156 or r/200x312 when possible
      const image = rawImg || undefined;

      const excerpt = stripHtml(unit.querySelector('.text')?.textContent ?? '');
      const infoText = stripHtml(unit.querySelector('.info')?.textContent ?? '');
      const dateMatch = infoText.match(/^[A-Za-z]+\s+\d+,\s+\d{4}/);
      const authorMatch = infoText.match(/by\s+([^\s|]+)/i);

      return {
        id: `mal-news-${idx}-${fullUrl}`,
        title,
        url: fullUrl,
        date: dateMatch ? dateMatch[0] : new Date().toISOString(),
        author: authorMatch?.[1],
        excerpt,
        image,
        sourceName: 'MyAnimeList News',
      };
    });
  } catch {
    return [];
  }
}

function extractTitleCandidate(headline: string): string | null {
  const quoted = headline.match(/['"‘“]([^'"’”]{3,40})['"’”]/);
  if (quoted?.[1]) return quoted[1];

  const cleaned = headline
    .replace(/(?:Season|Part)\s+\d+.*$/i, '')
    .replace(/\s*[‒–—-]\s*Episode\s+\d+.*$/i, '')
    .replace(/\s+(?:Anime|Manga|Movie|Film|OVA)\s+(?:Gets|Reveals|Streams|Launches|Ends).*$/i, '')
    .replace(/^(?:Watch|Stream|Report|Review):\s*/i, '')
    .trim();

  if (cleaned.length >= 4 && cleaned.length <= 45) return cleaned;
  return null;
}

async function fetchAnnRssWithArtwork(): Promise<NewsItem[]> {
  try {
    let baseItems: NewsItem[] = [];
    const rssXml = await fetchNewsEdge('ann');
    if (rssXml) {
      const xmlDoc = new DOMParser().parseFromString(rssXml, 'text/xml');
      const items = Array.from(xmlDoc.querySelectorAll('item')).slice(0, 12);
      if (items.length > 0) {
        baseItems = items.map((el, idx) => {
          const text = (sel: string) => el.querySelector(sel)?.textContent?.trim() ?? '';
          const enclosure = el.querySelector('enclosure')?.getAttribute('url') || undefined;
          const descRaw = text('description');
          const imgMatch = descRaw.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
          return {
            id: `ann-${text('guid') || text('link') || idx}`,
            title: stripHtml(text('title') || 'Anime News Update'),
            url: text('link') || 'https://www.animenewsnetwork.com/',
            date: text('pubDate') || new Date().toISOString(),
            author: text('author') || undefined,
            excerpt: stripHtml(descRaw),
            image: enclosure || imgMatch?.[1] || undefined,
            sourceName: 'Anime News Network',
          };
        });
      }
    }

    if (baseItems.length === 0) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(
          'https://www.animenewsnetwork.com/all/rss.xml'
        )}`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      if (!res.ok) return [];
      const data = (await res.json()) as {
        status?: string;
        items?: {
          guid?: string;
          title?: string;
          link?: string;
          pubDate?: string;
          author?: string;
          description?: string;
          thumbnail?: string;
          enclosure?: { link?: string };
        }[];
      };
      if (data.status !== 'ok' || !data.items) return [];

      baseItems = data.items.slice(0, 12).map((item, idx) => ({
        id: `ann-${item.guid || idx}`,
        title: stripHtml(item.title || 'Anime News Update'),
        url: item.link || 'https://www.animenewsnetwork.com/',
        date: item.pubDate || new Date().toISOString(),
        author: item.author || undefined,
        excerpt: stripHtml(item.description || ''),
        image: item.thumbnail || item.enclosure?.link || undefined,
        sourceName: 'Anime News Network',
      }));
    }

    // Enrich ANN headlines missing thumbnails with official anime covers from animeStore / AniList
    const cachedAnime = animeStore.all();
    const enriched = await Promise.all(
      baseItems.map(async (item) => {
        if (item.image) return item;
        const candidate = extractTitleCandidate(item.title);
        if (!candidate) return item;

        const lower = candidate.toLowerCase();
        const storeHit = cachedAnime.find(
          (a) =>
            a.title.toLowerCase().includes(lower) ||
            (a.titleRomaji && a.titleRomaji.toLowerCase().includes(lower))
        );
        if (storeHit) {
          return { ...item, image: storeHit.hasOfficialBanner ? storeHit.banner : storeHit.cover };
        }

        try {
          const hits = await searchAniList(candidate, 1, 'ANIME');
          if (hits[0]) {
            animeStore.remember(hits[0]);
            return {
              ...item,
              image: hits[0].hasOfficialBanner ? hits[0].banner : hits[0].cover,
            };
          }
        } catch {
          /* ignore */
        }
        return item;
      })
    );

    return enriched;
  } catch {
    return [];
  }
}

export async function fetchOfficialNewsFeed(): Promise<NewsItem[]> {
  const [malItems, annItems] = await Promise.all([
    fetchMalNewsWithImages(),
    fetchAnnRssWithArtwork(),
  ]);

  // Interleave MAL (all with images) and ANN (enriched with images)
  const combined: NewsItem[] = [];
  const max = Math.max(malItems.length, annItems.length);
  for (let i = 0; i < max; i += 1) {
    if (malItems[i]?.title) combined.push(malItems[i]);
    if (annItems[i]?.title) combined.push(annItems[i]);
  }
  return combined;
}
