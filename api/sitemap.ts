export const config = {
  runtime: 'edge',
};

const SITE_ORIGIN = 'https://listtube.vercel.app';

const SITEMAP_QUERY = `
  query SitemapSeed {
    topAnime: Page(page: 1, perPage: 30) {
      media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { id }
    }
    trendingAnime: Page(page: 1, perPage: 20) {
      media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { id }
    }
    topManga: Page(page: 1, perPage: 25) {
      media(type: MANGA, sort: POPULARITY_DESC, isAdult: false) { id }
    }
  }
`;

export default async function handler(): Promise<Response> {
  const urls: { loc: string; changefreq: string; priority: string }[] = [
    { loc: `${SITE_ORIGIN}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${SITE_ORIGIN}/explore`, changefreq: 'daily', priority: '0.9' },
    { loc: `${SITE_ORIGIN}/schedule`, changefreq: 'hourly', priority: '0.8' },
    { loc: `${SITE_ORIGIN}/news`, changefreq: 'hourly', priority: '0.8' },
    { loc: `${SITE_ORIGIN}/feed`, changefreq: 'hourly', priority: '0.8' },
  ];

  const seen = new Set<string>();
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: SITEMAP_QUERY }),
      signal: AbortSignal.timeout(4500),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: {
          topAnime?: { media?: { id: number }[] };
          trendingAnime?: { media?: { id: number }[] };
          topManga?: { media?: { id: number }[] };
        };
      };
      for (const m of [
        ...(json.data?.topAnime?.media ?? []),
        ...(json.data?.trendingAnime?.media ?? []),
      ]) {
        const key = `anilist:${m.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          urls.push({
            loc: `${SITE_ORIGIN}/anime/${encodeURIComponent(key)}`,
            changefreq: 'weekly',
            priority: '0.7',
          });
        }
      }
      for (const m of json.data?.topManga?.media ?? []) {
        const key = `anilist-manga:${m.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          urls.push({
            loc: `${SITE_ORIGIN}/anime/${encodeURIComponent(key)}`,
            changefreq: 'weekly',
            priority: '0.7',
          });
        }
      }
    }
  } catch {
    // Serve static URLs if AniList upstream times out
  }

  const today = new Date().toISOString().slice(0, 10);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
