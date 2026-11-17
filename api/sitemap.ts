export const config = {
  runtime: 'edge',
};

const SITE_ORIGIN = 'https://listtube.vercel.app';
const TOTAL_SHARDS = 10;

const SITEMAP_PAGE_QUERY = `
  query SitemapShard($page: Int) {
    anime: Page(page: $page, perPage: 50) {
      media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { id }
    }
    manga: Page(page: $page, perPage: 30) {
      media(type: MANGA, sort: POPULARITY_DESC, isAdult: false) { id }
    }
    staff: Page(page: $page, perPage: 15) {
      staff(sort: FAVOURITES_DESC) { id }
    }
    characters: Page(page: $page, perPage: 15) {
      characters(sort: FAVOURITES_DESC) { id }
    }
  }
`;

export default async function handler(req: Request): Promise<Response> {
  const reqUrl = new URL(req.url);
  const type = reqUrl.searchParams.get('type');
  const today = new Date().toISOString().slice(0, 10);

  if (type === 'index') {
    const sitemaps = [
      `  <sitemap>\n    <loc>${SITE_ORIGIN}/sitemap.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`,
      ...Array.from({ length: TOTAL_SHARDS }, (_, idx) => {
        const p = idx + 1;
        return `  <sitemap>\n    <loc>${SITE_ORIGIN}/api/sitemap?page=${p}</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`;
      }),
    ].join('\n');

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps}\n</sitemapindex>\n`,
      {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
        },
      }
    );
  }

  const page = Math.max(1, Math.min(TOTAL_SHARDS, Number(reqUrl.searchParams.get('page') ?? '1') || 1));

  const urls: { loc: string; changefreq: string; priority: string }[] =
    page === 1
      ? [
          { loc: `${SITE_ORIGIN}/`, changefreq: 'daily', priority: '1.0' },
          { loc: `${SITE_ORIGIN}/explore`, changefreq: 'daily', priority: '0.9' },
          { loc: `${SITE_ORIGIN}/schedule`, changefreq: 'hourly', priority: '0.8' },
          { loc: `${SITE_ORIGIN}/news`, changefreq: 'hourly', priority: '0.8' },
          { loc: `${SITE_ORIGIN}/feed`, changefreq: 'hourly', priority: '0.8' },
        ]
      : [];

  const seen = new Set<string>(urls.map((u) => u.loc));
  const pushUrl = (loc: string, changefreq: string, priority: string) => {
    if (seen.has(loc)) return;
    seen.add(loc);
    urls.push({ loc, changefreq, priority });
  };

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: SITEMAP_PAGE_QUERY, variables: { page } }),
      signal: AbortSignal.timeout(5500),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: {
          anime?: { media?: { id: number }[] };
          manga?: { media?: { id: number }[] };
          staff?: { staff?: { id: number }[] };
          characters?: { characters?: { id: number }[] };
        };
      };
      for (const m of json.data?.anime?.media ?? []) {
        pushUrl(`${SITE_ORIGIN}/anime/${encodeURIComponent(`anilist:${m.id}`)}`, 'weekly', '0.7');
      }
      for (const m of json.data?.manga?.media ?? []) {
        pushUrl(`${SITE_ORIGIN}/anime/${encodeURIComponent(`anilist-manga:${m.id}`)}`, 'weekly', '0.7');
      }
      for (const s of json.data?.staff?.staff ?? []) {
        pushUrl(`${SITE_ORIGIN}/person/${s.id}`, 'monthly', '0.6');
      }
      for (const c of json.data?.characters?.characters ?? []) {
        pushUrl(`${SITE_ORIGIN}/character/${c.id}`, 'monthly', '0.6');
      }
    }
  } catch {
    // Serve fallback URLs if AniList upstream times out
  }

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
