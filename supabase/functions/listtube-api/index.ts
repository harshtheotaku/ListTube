import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getEnvSecret(primary: string, ...aliases: string[]): string {
  const candidates = [primary, ...aliases];
  for (const name of candidates) {
    const val =
      Deno.env.get(name)?.trim() ||
      Deno.env.get(name.toLowerCase())?.trim() ||
      Deno.env.get(name.toUpperCase())?.trim();
    if (val) return val;
  }
  return "";
}

function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferAniListTtl(query: string): number {
  if (/airingSchedules|TRENDING_DESC/i.test(query)) return 1800; // 30m
  if (/query Detail\(|query StudioMedia\(|query StaffManga\(/i.test(query)) return 86400; // 24h
  return 21600; // 6h for Popular, Top Rated, Genres, Search
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toFuzzyDate(dateStr?: string | null): { year: number; month: number; day: number } | undefined {
  if (!dateStr) return undefined;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

const DEFAULT_ANILIST_CLIENT_ID = "57274";
const DEFAULT_MAL_CLIENT_ID = "f74fba547b6b04cdb063b1ef1bfc76a3";

async function mintOAuthBridgeSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    provider: "anilist" | "mal";
    externalId: string;
    username: string;
    avatar?: string;
    banner?: string;
  }
): Promise<{ bridgeEmail: string; bridgeTokenHash: string; userId: string } | null> {
  const safeExtId = params.externalId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeExtId) return null;
  const email = `${params.provider}.${safeExtId}@oauth.listtube.app`;
  const cleanHandle =
    params.username
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20) || `${params.provider}_${safeExtId.slice(0, 8)}`;

  const { data: linked } = await supabase
    .from("oauth_accounts")
    .select("user_id")
    .eq("provider", params.provider)
    .eq("external_id", safeExtId)
    .maybeSingle();

  let userId = linked?.user_id as string | undefined;

  if (!userId) {
    const created = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: params.username,
        avatar_url: params.avatar,
        oauth_provider: params.provider,
      },
    });
    if (created.data?.user?.id) {
      userId = created.data.user.id;
    }
  }

  const linkRes = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const hashedToken = linkRes.data?.properties?.hashed_token;
  if (!userId && linkRes.data?.user?.id) {
    userId = linkRes.data.user.id;
  }
  if (!userId || !hashedToken) return null;

  await supabase.from("oauth_accounts").upsert(
    {
      provider: params.provider,
      external_id: safeExtId,
      user_id: userId,
      username: params.username,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider,external_id" }
  );

  // Seed initial profile only if absent so custom user edits are never overwritten
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, handle, avatar_url, banner_url")
    .eq("id", userId)
    .maybeSingle();

  if (!existingProfile) {
    await supabase.from("profiles").upsert(
      {
        id: userId,
        display_name: params.username,
        handle: `@${cleanHandle}_${safeExtId.slice(-3)}`,
        avatar_id: params.provider,
        avatar_url: params.avatar || "",
        banner_url: params.banner || "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  }

  return { bridgeEmail: email, bridgeTokenHash: hashedToken, userId };
}

async function fetchAniListViewer(accessToken: string) {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: `query { Viewer { id name avatar { large medium } bannerImage } }`,
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data?.Viewer ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/listtube-api/, "") || "/";
  const supabase = getSupabaseAdmin();

  try {
    // 1. Health check
    if (path === "/" || path === "/health") {
      return jsonResponse({ ok: true, service: "listtube-api", ts: Date.now() });
    }

    // 2. Shared Postgres-Cached AniList GraphQL Gateway
    if (path === "/anilist" && req.method === "POST") {
      const body = await req.json();
      const query = String(body.query ?? "");
      const variables = body.variables ?? {};
      const ttlSeconds = Number(body.ttlSeconds ?? inferAniListTtl(query));
      const canonical = JSON.stringify({ q: query.replace(/\s+/g, " ").trim(), v: variables });
      const cacheKey = `al:${await sha256Hex(canonical)}`;

      const { data: cachedRow } = await supabase
        .from("api_cache")
        .select("payload, expires_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();

      if (cachedRow && new Date(cachedRow.expires_at).getTime() > Date.now()) {
        return jsonResponse(cachedRow.payload, 200, { "X-ListTube-Cache": "HIT" });
      }

      const upstream = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
      });

      if (upstream.ok) {
        const payload = await upstream.json();
        if (payload?.data && !payload?.errors?.length) {
          const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
          await supabase.from("api_cache").upsert(
            {
              cache_key: cacheKey,
              payload,
              expires_at: expiresAt,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "cache_key" }
          );
          if (payload.data.Media?.id && payload.data.Media?.title) {
            const m = payload.data.Media;
            const mt = String(m.type ?? "ANIME").toUpperCase() === "MANGA" ? "MANGA" : "ANIME";
            const cid = `${mt === "MANGA" ? "anilist-manga" : "anilist"}:${m.id}`;
            await supabase.from("media_catalog").upsert(
              {
                id: cid,
                media_type: mt,
                anilist_id: Number(m.id),
                mal_id: m.idMal ? Number(m.idMal) : null,
                title: String(m.title?.english || m.title?.romaji || "Untitled"),
                payload: m,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" }
            );
          }
          return jsonResponse(payload, 200, { "X-ListTube-Cache": "MISS" });
        }
        return jsonResponse(payload, 400);
      }

      // Rate-limit / upstream resilience: return stale Postgres cache cleanly if available
      if (cachedRow) {
        return jsonResponse(cachedRow.payload, 200, { "X-ListTube-Cache": "STALE" });
      }
      return jsonResponse({ error: `AniList upstream HTTP ${upstream.status}` }, upstream.status);
    }

    // 3. CORS-Free Server-Side MyAnimeList HTML Proxy + Cache (/userrecs & /reviews)
    if (path === "/mal" && req.method === "GET") {
      const mediaType = url.searchParams.get("type") === "manga" ? "manga" : "anime";
      const id = Number(url.searchParams.get("id") ?? "0");
      const kind = url.searchParams.get("kind") === "reviews" ? "reviews" : "userrecs";
      if (!id) return jsonResponse({ error: "Missing valid MAL id" }, 400);

      const cacheKey = `mal:${kind}:${mediaType}:${id}`;
      const { data: cachedRow } = await supabase
        .from("api_cache")
        .select("payload, expires_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();

      if (cachedRow && new Date(cachedRow.expires_at).getTime() > Date.now()) {
        return jsonResponse(cachedRow.payload, 200, { "X-ListTube-Cache": "HIT" });
      }

      const targetUrl =
        kind === "reviews"
          ? `https://myanimelist.net/${mediaType}/${id}/_/reviews?spoiler=off`
          : `https://myanimelist.net/${mediaType}/${id}/_/userrecs`;

      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ListTube/1.2; +https://github.com/harshtheotaku/ListTube)",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (res.ok) {
        const html = await res.text();
        const payload = { html };
        if (html.length > 500) {
          await supabase.from("api_cache").upsert(
            {
              cache_key: cacheKey,
              payload,
              expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "cache_key" }
          );
        }
        return jsonResponse(payload, 200, { "X-ListTube-Cache": "MISS" });
      }

      if (cachedRow) {
        return jsonResponse(cachedRow.payload, 200, { "X-ListTube-Cache": "STALE" });
      }
      return jsonResponse({ html: "" }, 200);
    }

    // 3b. OP/ED Theme Songs Proxy + Postgres L2 Cache (Jikan -> MAL HTML fallback)
    if (path === "/mal-themes" && req.method === "GET") {
      const id = Number(url.searchParams.get("id") ?? "0");
      if (!id) return jsonResponse({ error: "Missing valid MAL id" }, 400);

      const cacheKey = `mal:themes:v2:${id}`;
      const { data: cachedRow } = await supabase
        .from("api_cache")
        .select("payload, expires_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();

      if (cachedRow && new Date(cachedRow.expires_at).getTime() > Date.now()) {
        return jsonResponse(cachedRow.payload, 200, { "X-ListTube-Cache": "HIT" });
      }

      const decodeHtml = (s: string) =>
        s
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;|&#160;/gi, " ")
          .replace(/&quot;/g, '"')
          .replace(/&#039;|&apos;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/\s+/g, " ")
          .trim();

      const isSongRow = (txt: string) =>
        txt.length > 3 &&
        !/^(?:spotify|apple music|amazon music|youtube music|\s)+$/i.test(txt) &&
        !txt.toLowerCase().includes("no opening") &&
        !txt.toLowerCase().includes("no ending") &&
        (/^\d+:/.test(txt) || /\bby\s+/i.test(txt) || /["“].+["”]/.test(txt));

      let openings: string[] = [];
      let endings: string[] = [];

      // Attempt 1: Jikan themes API from Deno Edge network
      try {
        const jikanRes = await fetch(`https://api.jikan.moe/v4/anime/${id}/themes`, {
          signal: AbortSignal.timeout(5500),
          headers: { Accept: "application/json" },
        });
        if (jikanRes.ok) {
          const jData = await jikanRes.json();
          openings = Array.isArray(jData?.data?.openings) ? jData.data.openings : [];
          endings = Array.isArray(jData?.data?.endings) ? jData.data.endings : [];
        }
      } catch {
        // Fall through to MyAnimeList HTML extraction
      }

      // Attempt 2: Direct MyAnimeList anime page HTML parser
      if (openings.length === 0 && endings.length === 0) {
        try {
          const malRes = await fetch(`https://myanimelist.net/anime/${id}`, {
            signal: AbortSignal.timeout(7500),
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; ListTube/1.2; +https://github.com/harshtheotaku/ListTube)",
              Accept: "text/html,application/xhtml+xml",
            },
          });
          if (malRes.ok) {
            const html = await malRes.text();
            const extractBlock = (marker: string, nextMarker: string): string[] => {
              const start = html.indexOf(marker);
              if (start === -1) return [];
              const end = html.indexOf(nextMarker, start + marker.length);
              const slice = html.slice(start, end === -1 ? start + 18000 : Math.min(end, start + 18000));
              const items: string[] = [];
              const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
              let m: RegExpExecArray | null;
              while ((m = rowRegex.exec(slice)) !== null) {
                const txt = decodeHtml(m[1]);
                if (isSongRow(txt)) {
                  items.push(txt);
                }
              }
              if (items.length === 0) {
                const spanRegex = /<span[^>]*class="[^"]*theme-song[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
                while ((m = spanRegex.exec(slice)) !== null) {
                  const txt = decodeHtml(m[1]);
                  if (isSongRow(txt)) items.push(txt);
                }
              }
              return items;
            };
            openings = extractBlock("theme-songs js-theme-songs opnening", "theme-songs js-theme-songs ending");
            endings = extractBlock("theme-songs js-theme-songs ending", "More info");
          }
        } catch {
          // Return cached or empty below
        }
      }

      const payload = { openings, endings };
      if (openings.length > 0 || endings.length > 0) {
        await supabase.from("api_cache").upsert(
          {
            cache_key: cacheKey,
            payload,
            expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "cache_key" }
        );
        await supabase.from("media_themes").upsert(
          {
            mal_id: id,
            openings,
            endings,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "mal_id" }
        );
        return jsonResponse(payload, 200, { "X-ListTube-Cache": "MISS" });
      }
      const { data: normThemeRow } = await supabase
        .from("media_themes")
        .select("openings, endings")
        .eq("mal_id", id)
        .maybeSingle();
      if (normThemeRow) {
        return jsonResponse(
          { openings: normThemeRow.openings, endings: normThemeRow.endings },
          200,
          { "X-ListTube-Cache": "DB-FALLBACK" }
        );
      }
      if (cachedRow) {
        return jsonResponse(cachedRow.payload, 200, { "X-ListTube-Cache": "STALE" });
      }
      return jsonResponse(payload, 200);
    }

    // 4. CORS-Free Server-Side News Proxy + Cache (ANN RSS & MAL News)
    if (path === "/news" && req.method === "GET") {
      const source = url.searchParams.get("source") === "mal" ? "mal" : "ann";
      const id = Number(url.searchParams.get("id") ?? "0");
      const cacheKey = source === "ann" ? "news:ann:rss" : `news:mal:${id}`;

      const { data: cachedRow } = await supabase
        .from("api_cache")
        .select("payload, expires_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();

      if (cachedRow && new Date(cachedRow.expires_at).getTime() > Date.now()) {
        return jsonResponse(cachedRow.payload, 200, { "X-ListTube-Cache": "HIT" });
      }

      const targetUrl =
        source === "ann"
          ? "https://www.animenewsnetwork.com/all/rss.xml"
          : id > 0
          ? `https://myanimelist.net/anime/${id}/_/news`
          : "https://myanimelist.net/news";

      const res = await fetch(targetUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ListTube/1.1)" },
      });

      if (res.ok) {
        const text = await res.text();
        const payload = { text };
        await supabase.from("api_cache").upsert(
          {
            cache_key: cacheKey,
            payload,
            expires_at: new Date(Date.now() + 1800 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "cache_key" }
        );
        return jsonResponse(payload, 200, { "X-ListTube-Cache": "MISS" });
      }

      if (cachedRow) return jsonResponse(cachedRow.payload, 200, { "X-ListTube-Cache": "STALE" });
      return jsonResponse({ text: "" }, 200);
    }

    // 5. Direct Media Link Resolution (Exact Series URL from Postgres Catalog + Live Fallbacks)
    if (path === "/readers" && req.method === "GET") {
      const mediaType = (url.searchParams.get("type") ?? "MANGA").toUpperCase() === "ANIME" ? "ANIME" : "MANGA";
      const title = (url.searchParams.get("title") ?? "").trim();
      const romaji = (url.searchParams.get("romaji") ?? "").trim();
      const terms = Array.from(
        new Set(
          [
            normalizeTitle(title),
            normalizeTitle(title.split(":")[0] ?? ""),
            normalizeTitle(romaji),
            normalizeTitle(romaji.split(":")[0] ?? ""),
          ].filter((t) => t.length >= 3)
        )
      );

      let matches: { site: string; slug_title: string; norm_title: string; url: string; sim: number }[] = [];
      if (terms.length > 0) {
        const { data } = await supabase.rpc("match_reader_urls", { search_terms: terms });
        if (Array.isArray(data)) matches = data;
      }

      const bestBySite = new Map<string, { url: string; sim: number }>();
      for (const m of matches) {
        if ((m.sim ?? 0) >= 0.42 && !bestBySite.has(m.site)) {
          bestBySite.set(m.site, { url: m.url, sim: m.sim });
        }
      }

      const q = encodeURIComponent(title || romaji);

      if (mediaType === "ANIME") {
        // Live ReAnime resolution if not yet indexed in reader_catalog
        if (!bestBySite.has("reanime") && (title || romaji)) {
          try {
            const searchQuery = encodeURIComponent(title || romaji);
            const rRes = await fetch(`https://reanime.cc/?s=${searchQuery}`, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; ListTube/1.2)" },
            });
            if (rRes.ok) {
              const html = await rRes.text();
              const linkRe = /<a[^>]+href="(https:\/\/reanime\.cc\/anime\/([^/"]+)\/?)"[^>]*title="([^"]+)"/gi;
              let bestUrl = "";
              let bestScore = -1;
              let bestTitle = "";
              let m: RegExpExecArray | null;
              while ((m = linkRe.exec(html)) !== null) {
                const candidateUrl = m[1];
                const rawTitle = m[3];
                const isDub = /\(Dub\)|-dub\/?$/i.test(rawTitle + candidateUrl);
                const cleanNorm = normalizeTitle(rawTitle.replace(/\((?:Dub|Sub)\)/gi, ""));
                for (const t of terms) {
                  let score = 0;
                  if (cleanNorm === t) score = 2.5;
                  else if (cleanNorm.startsWith(t) || t.startsWith(cleanNorm)) score = 1.6;
                  else {
                    const tWords = new Set(t.split(" "));
                    const cWords = cleanNorm.split(" ");
                    const overlap = cWords.filter((w) => w.length >= 2 && tWords.has(w)).length;
                    score = overlap / Math.max(tWords.size, cWords.length, 1);
                  }
                  if (!isDub) score += 0.15;
                  if (score > bestScore && score >= 0.72) {
                    bestScore = score;
                    bestUrl = candidateUrl.endsWith("/") ? candidateUrl : `${candidateUrl}/`;
                    bestTitle = cleanNorm;
                  }
                }
              }
              if (bestUrl) {
                bestBySite.set("reanime", { url: bestUrl, sim: bestScore });
                const slugPart = bestUrl.split("/anime/")[1]?.replace(/\/$/, "") || bestTitle.replace(/\s+/g, "-");
                await supabase.from("reader_catalog").upsert(
                  {
                    id: `reanime:${slugPart.slice(0, 60)}`,
                    site: "reanime",
                    slug_title: slugPart,
                    norm_title: bestTitle,
                    url: bestUrl,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: "id" }
                );
              }
            }
          } catch {
            /* fall back to search URL cleanly */
          }
        }

        const watchers = [
          {
            site: "KotoPlay",
            key: "kotoplay",
            url: bestBySite.get("kotoplay")?.url ?? `https://kotoplay.to/search?keyword=${q}`,
            isDirect: Boolean(bestBySite.get("kotoplay")),
            recommended: true,
          },
          {
            site: "Re Anime",
            key: "reanime",
            url: bestBySite.get("reanime")?.url ?? `https://reanime.cc/?s=${q}`,
            isDirect: Boolean(bestBySite.get("reanime")),
          },
        ];

        return jsonResponse({ readers: watchers });
      }

      const readers = [
        {
          site: "Comix.to",
          key: "comix",
          url: bestBySite.get("comix")?.url ?? `https://comix.to/browse?keyword=${q}`,
          isDirect: Boolean(bestBySite.get("comix")),
          recommended: true,
        },
        {
          site: "Kagane",
          key: "kagane",
          url: bestBySite.get("kagane")?.url ?? `https://kagane.org/search?q=${q}`,
          isDirect: Boolean(bestBySite.get("kagane")),
        },
      ];

      return jsonResponse({ readers });
    }

    // 6. Pre-warm popular AniList queries into Postgres api_cache
    if (path === "/warm" && req.method === "POST") {
      await supabase.from("api_cache").delete().eq("cache_key", "bootstrap_seed_hash");
      await supabase.from("api_cache").delete().lt("expires_at", new Date(Date.now() - 86400 * 1000).toISOString());
      const body = await req.json();

      const queries = Array.isArray(body.queries) ? body.queries : [];
      let warmed = 0;
      for (const item of queries.slice(0, 12)) {
        const q = String(item.query ?? "");
        const v = item.variables ?? {};
        const canonical = JSON.stringify({ q: q.replace(/\s+/g, " ").trim(), v });
        const cacheKey = `al:${await sha256Hex(canonical)}`;
        const upstream = await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ query: q, variables: v }),
        });
        if (upstream.ok) {
          const payload = await upstream.json();
          if (payload?.data && !payload?.errors?.length) {
            const ttl = Number(item.ttlSeconds ?? inferAniListTtl(q));
            await supabase.from("api_cache").upsert(
              {
                cache_key: cacheKey,
                payload,
                expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "cache_key" }
            );
            warmed += 1;
          }
        }
      }
      return jsonResponse({ ok: true, warmed });
    }

    // 7. OAuth Configuration Status (safe public client IDs only, never secrets)
    if (path === "/oauth/status" && req.method === "GET") {
      const anilistClientId = getEnvSecret("ANILIST_CLIENT_ID") || DEFAULT_ANILIST_CLIENT_ID;
      const malClientId = getEnvSecret("MAL_CLIENT_ID") || DEFAULT_MAL_CLIENT_ID;
      const hasAniListSecret = Boolean(getEnvSecret("ANILIST_CLIENT_SECRET", "ANILIST_SECRET_CLIENT"));
      const hasMalSecret = Boolean(getEnvSecret("MAL_CLIENT_SECRET", "MAL_SECRET_CLIENT"));
      return jsonResponse({
        anilistConfigured: Boolean(anilistClientId),
        anilistCodeFlowReady: Boolean(anilistClientId && hasAniListSecret),
        anilistClientId,
        malConfigured: Boolean(malClientId && hasMalSecret),
        malClientId,
      });
    }

    // 8. AniList OAuth Authorization Code Exchange + Supabase Auth Session Mint
    if (path === "/oauth/anilist/exchange" && req.method === "POST") {
      const body = await req.json();
      const code = String(body.code ?? "").trim();
      const redirectUri = String(body.redirectUri ?? "").trim();
      const clientId = String(body.clientId ?? (getEnvSecret("ANILIST_CLIENT_ID") || DEFAULT_ANILIST_CLIENT_ID)).trim();
      const clientSecret = String(body.clientSecret ?? getEnvSecret("ANILIST_CLIENT_SECRET", "ANILIST_SECRET_CLIENT") ?? "").trim();
      if (!code || !redirectUri || !clientId || !clientSecret) {
        return jsonResponse(
          { error: "AniList Authorization Code exchange requires ANILIST_CLIENT_SECRET configured in Supabase Edge Secrets." },
          400
        );
      }

      const res = await fetch("https://anilist.co/api/v2/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.access_token) {
        return jsonResponse({ error: data?.message || data?.error_description || "AniList token exchange failed" }, 400);
      }
      const viewer = await fetchAniListViewer(String(data.access_token));
      const bridge = viewer?.id
        ? await mintOAuthBridgeSession(supabase, {
            provider: "anilist",
            externalId: String(viewer.id),
            username: String(viewer.name || "AniListUser"),
            avatar: viewer.avatar?.large || viewer.avatar?.medium,
            banner: viewer.bannerImage,
          })
        : null;
      return jsonResponse({ ...data, viewer, bridge });
    }

    // 8b. AniList Token -> Supabase Auth Session Bridge (Supports existing/implicit tokens seamlessly)
    if (path === "/oauth/anilist/session" && req.method === "POST") {
      const body = await req.json();
      const accessToken = String(body.accessToken ?? "").trim();
      if (!accessToken) return jsonResponse({ error: "Missing AniList access token" }, 400);
      const viewer = await fetchAniListViewer(accessToken);
      if (!viewer?.id) return jsonResponse({ error: "Invalid AniList token" }, 401);
      const bridge = await mintOAuthBridgeSession(supabase, {
        provider: "anilist",
        externalId: String(viewer.id),
        username: String(viewer.name || "AniListUser"),
        avatar: viewer.avatar?.large || viewer.avatar?.medium,
        banner: viewer.bannerImage,
      });
      return jsonResponse({ viewer, bridge });
    }

    // 9. MyAnimeList OAuth 2.0 PKCE Token Exchange & Refresh + Supabase Auth Session Mint
    if (path === "/oauth/mal/token" && req.method === "POST") {
      const body = await req.json();
      const grantType = body.grantType === "refresh_token" ? "refresh_token" : "authorization_code";
      const clientId = String(body.clientId ?? (getEnvSecret("MAL_CLIENT_ID") || DEFAULT_MAL_CLIENT_ID)).trim();
      const clientSecret = String(body.clientSecret ?? getEnvSecret("MAL_CLIENT_SECRET", "MAL_SECRET_CLIENT") ?? "").trim();
      if (!clientId) {
        return jsonResponse({ error: "MAL OAuth Client ID is not configured." }, 400);
      }

      const form = new URLSearchParams({
        client_id: clientId,
        grant_type: grantType,
      });
      if (clientSecret) form.set("client_secret", clientSecret);
      if (grantType === "refresh_token") {
        form.set("refresh_token", String(body.refreshToken ?? ""));
      } else {
        form.set("code", String(body.code ?? ""));
        form.set("code_verifier", String(body.codeVerifier ?? ""));
        if (body.redirectUri) form.set("redirect_uri", String(body.redirectUri));
      }

      const res = await fetch("https://myanimelist.net/v1/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: form.toString(),
      });
      const data = await res.json();
      if (!res.ok || !data?.access_token) {
        return jsonResponse({ error: data?.message || data?.error || "MAL OAuth token exchange failed" }, 400);
      }
      const meRes = await fetch("https://api.myanimelist.net/v2/users/@me?fields=id,name,picture", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const malUser = meRes.ok ? await meRes.json() : null;
      const bridge = malUser?.id
        ? await mintOAuthBridgeSession(supabase, {
            provider: "mal",
            externalId: String(malUser.id),
            username: String(malUser.name || "MALUser"),
            avatar: malUser.picture,
          })
        : null;
      return jsonResponse({ ...data, malUser, bridge });
    }

    // 10. Authenticated MyAnimeList List Import (supports Private MAL lists via OAuth Bearer)
    if (path === "/oauth/mal/list" && req.method === "GET") {
      const token = String(url.searchParams.get("token") ?? req.headers.get("authorization") ?? "")
        .replace(/^Bearer\s+/i, "")
        .trim();
      if (!token) return jsonResponse({ error: "Missing MAL OAuth access token" }, 401);

      const meRes = await fetch("https://api.myanimelist.net/v2/users/@me?fields=id,name,picture", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) return jsonResponse({ error: `MAL /@me HTTP ${meRes.status}` }, meRes.status);
      const user = await meRes.json();

      const fetchList = async (kind: "animelist" | "mangalist") => {
        const fields =
          kind === "animelist"
            ? "list_status{status,score,num_episodes_watched,is_rewatching,num_times_rewatched,start_date,finish_date,comments},num_episodes,media_type,mean,num_list_users,main_picture,genres,studios,start_season"
            : "list_status{status,score,num_chapters_read,num_volumes_read,is_rereading,num_times_reread,start_date,finish_date,comments},num_chapters,num_volumes,media_type,mean,num_list_users,main_picture,genres,authors{first_name,last_name}";
        const rows: any[] = [];
        let nextUrl: string | null = `https://api.myanimelist.net/v2/users/@me/${kind}?fields=${encodeURIComponent(fields)}&limit=500&nsfw=false`;
        let pages = 0;
        while (nextUrl && pages < 5) {
          const r = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (!r.ok) break;
          const json = await r.json();
          if (Array.isArray(json.data)) rows.push(...json.data);
          nextUrl = json.paging?.next ?? null;
          pages += 1;
        }
        return rows;
      };

      const [anime, manga] = await Promise.all([fetchList("animelist"), fetchList("mangalist")]);
      return jsonResponse({ user, anime, manga });
    }

    // 11. AniList Bidirectional 2-Way Sync (Save, Dates, Volumes, Rewatches, Notes, Privacy & Delete)
    if (path === "/anilist-writeback" && req.method === "POST") {
      const body = await req.json();
      const token = String(body.token ?? "").trim();
      const mediaId = Number(body.mediaId ?? 0);
      const action = body.action === "delete" ? "delete" : "save";
      if (!token || !mediaId) return jsonResponse({ error: "Missing AniList token or mediaId" }, 400);

      if (action === "delete") {
        let entryId = Number(body.listEntryId ?? 0);
        if (!entryId) {
          const lookupRes = await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              query: `query($mediaId: Int) { Media(id: $mediaId) { mediaListEntry { id } } }`,
              variables: { mediaId },
            }),
          });
          const lookupJson = await lookupRes.json();
          entryId = Number(lookupJson?.data?.Media?.mediaListEntry?.id ?? 0);
        }
        if (!entryId) return jsonResponse({ ok: true, deleted: false });

        const delRes = await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: `mutation($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }`,
            variables: { id: entryId },
          }),
        });
        const delJson = await delRes.json();
        if (!delRes.ok || delJson.errors?.length) {
          return jsonResponse({ error: delJson.errors?.[0]?.message ?? `AniList delete HTTP ${delRes.status}` }, 400);
        }
        return jsonResponse({ ok: true, deleted: Boolean(delJson.data?.DeleteMediaListEntry?.deleted) });
      }

      const statusMap: Record<string, string> = {
        watching: "CURRENT",
        completed: "COMPLETED",
        planned: "PLANNING",
        on_hold: "PAUSED",
        dropped: "DROPPED",
      };
      const anilistStatus = statusMap[String(body.status ?? "")] ?? undefined;

      const mutation = `
        mutation(
          $mediaId: Int
          $status: MediaListStatus
          $scoreRaw: Int
          $progress: Int
          $progressVolumes: Int
          $repeat: Int
          $startedAt: FuzzyDateInput
          $completedAt: FuzzyDateInput
          $notes: String
          $private: Boolean
          $customLists: [String]
          $priority: Int
        ) {
          SaveMediaListEntry(
            mediaId: $mediaId
            status: $status
            scoreRaw: $scoreRaw
            progress: $progress
            progressVolumes: $progressVolumes
            repeat: $repeat
            startedAt: $startedAt
            completedAt: $completedAt
            notes: $notes
            private: $private
            customLists: $customLists
            priority: $priority
          ) {
            id
            status
            score
            progress
            progressVolumes
            repeat
            customLists
            priority
          }
        }
      `;
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            mediaId,
            status: anilistStatus,
            scoreRaw: body.score ? Math.round(Number(body.score) * 10) : undefined,
            progress: typeof body.progress === "number" ? body.progress : undefined,
            progressVolumes: typeof body.progressVolumes === "number" ? body.progressVolumes : undefined,
            repeat: typeof body.repeat === "number" ? body.repeat : undefined,
            startedAt: toFuzzyDate(body.startedAt),
            completedAt: toFuzzyDate(body.completedAt),
            notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : undefined,
            private: typeof body.isPrivate === "boolean" ? body.isPrivate : undefined,
            customLists: Array.isArray(body.customLists) ? body.customLists : undefined,
            priority: typeof body.priority === "number" ? body.priority * 50 : undefined,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || json.errors?.length) {
        return jsonResponse({ error: json.errors?.[0]?.message ?? `AniList HTTP ${res.status}` }, 400);
      }
      return jsonResponse({ ok: true, entry: json.data?.SaveMediaListEntry });
    }

    // 12. MyAnimeList Bidirectional 2-Way API v2 Write-Back (Anime & Manga Save + Delete)
    if (path === "/mal-writeback" && req.method === "POST") {
      const body = await req.json();
      const token = String(body.token ?? "").trim();
      const malId = Number(body.malId ?? 0);
      const mediaType = body.mediaType === "MANGA" ? "manga" : "anime";
      const action = body.action === "delete" ? "delete" : "save";
      if (!token || !malId) return jsonResponse({ error: "Missing MAL OAuth token or malId" }, 400);

      const endpoint = `https://api.myanimelist.net/v2/${mediaType}/${malId}/my_list_status`;
      if (action === "delete") {
        const delRes = await fetch(endpoint, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!delRes.ok && delRes.status !== 404) {
          return jsonResponse({ error: `MAL delete HTTP ${delRes.status}` }, delRes.status);
        }
        return jsonResponse({ ok: true, deleted: true });
      }

      const animeStatusMap: Record<string, string> = {
        watching: "watching",
        completed: "completed",
        planned: "plan_to_watch",
        on_hold: "on_hold",
        dropped: "dropped",
      };
      const mangaStatusMap: Record<string, string> = {
        watching: "reading",
        completed: "completed",
        planned: "plan_to_read",
        on_hold: "on_hold",
        dropped: "dropped",
      };

      const form = new URLSearchParams();
      if (body.status) {
        const mapped = mediaType === "manga" ? mangaStatusMap[body.status] : animeStatusMap[body.status];
        if (mapped) form.set("status", mapped);
      }
      if (typeof body.score === "number" && body.score > 0) {
        form.set("score", String(Math.max(1, Math.min(10, Math.round(body.score)))));
      }
      if (typeof body.progress === "number") {
        form.set(
          mediaType === "manga" ? "num_chapters_read" : "num_watched_episodes",
          String(Math.max(0, Math.floor(body.progress)))
        );
      }
      if (mediaType === "manga" && typeof body.progressVolumes === "number") {
        form.set("num_volumes_read", String(Math.max(0, Math.floor(body.progressVolumes))));
      }
      if (typeof body.repeat === "number") {
        form.set(
          mediaType === "manga" ? "num_times_reread" : "num_times_rewatched",
          String(Math.max(0, Math.floor(body.repeat)))
        );
      }
      if (typeof body.startedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startedAt)) {
        form.set("start_date", body.startedAt);
      }
      if (typeof body.completedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.completedAt)) {
        form.set("finish_date", body.completedAt);
      }
      if (typeof body.notes === "string") {
        form.set("comments", body.notes.slice(0, 500));
      }

      const res = await fetch(endpoint, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return jsonResponse({ error: json?.message || json?.error || `MAL HTTP ${res.status}` }, res.status);
      }
      return jsonResponse({ ok: true, entry: json });
    }

    // 13. SSR OpenGraph Link Preview & Multi-Route SEO Bot Endpoint
    if (path === "/share" && req.method === "GET") {
      const rawId = (url.searchParams.get("id") ?? "").trim();
      const routeType = (url.searchParams.get("route") ?? "anime").toLowerCase();
      const targetOrigin = (url.searchParams.get("origin") ?? "https://listtube.vercel.app").replace(/\/$/, "");
      const isBot = url.searchParams.get("bot") === "1";

      let redirectUrl = rawId ? `${targetOrigin}/anime/${encodeURIComponent(rawId)}` : targetOrigin;
      let title = "ListTube — Anime & Manga Recommendations";
      let desc = "Track anime & manga, read reviews, explore MAL catalogs, and get personalized recommendations.";
      let image = "https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg";
      let mediaTitle = "ListTube";
      let schemaType = "CreativeWork";
      let ratingValue: string | null = null;

      if (routeType === "explore") {
        redirectUrl = `${targetOrigin}/explore`;
        title = "Explore Anime & Manga Catalog — ListTube";
        desc = "Browse top airing anime, seasonal charts, manga/manhwa/manhua, genres, themes, and multi-axis filters on ListTube.";
        schemaType = "CollectionPage";
      } else if (routeType === "feed") {
        redirectUrl = `${targetOrigin}/feed`;
        title = "Community Activity, Reviews & Forums — ListTube";
        desc = "Live anime & manga watch activity, community reviews, affinity matching, and links to MyAnimeList & AniList forums.";
        schemaType = "CollectionPage";
      } else if (routeType === "schedule") {
        redirectUrl = `${targetOrigin}/schedule`;
        title = "Weekly Anime Airing Schedule — ListTube";
        desc = "Live countdowns and weekly broadcast schedule for airing anime episodes.";
        schemaType = "CollectionPage";
      } else if (routeType === "news") {
        redirectUrl = `${targetOrigin}/news`;
        title = "Anime & Manga News — ListTube";
        desc = "Latest anime, manga, and studio news from MyAnimeList and Anime News Network.";
        schemaType = "CollectionPage";
      } else if (routeType === "person" && Number(rawId) > 0) {
        redirectUrl = `${targetOrigin}/person/${encodeURIComponent(rawId)}`;
        schemaType = "Person";
        const up = await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            query: `query($id: Int) { Staff(id: $id) { name { full native } description(asHtml: false) primaryOccupations image { large } } }`,
            variables: { id: Number(rawId) },
          }),
        });
        if (up.ok) {
          const j = await up.json();
          const st = j?.data?.Staff;
          if (st?.name?.full) {
            mediaTitle = st.name.full;
            title = `${st.name.full} — Voice Actor & Staff Filmography — ListTube`;
            desc = String(st.description || `${st.name.full} (${(st.primaryOccupations || []).join(", ")}) credits on ListTube`).replace(/\s+/g, " ").slice(0, 220);
            image = st.image?.large || image;
          }
        }
      } else if (routeType === "character" && Number(rawId) > 0) {
        redirectUrl = `${targetOrigin}/character/${encodeURIComponent(rawId)}`;
        schemaType = "Person";
        const up = await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            query: `query($id: Int) { Character(id: $id) { name { full native } description(asHtml: false) image { large } } }`,
            variables: { id: Number(rawId) },
          }),
        });
        if (up.ok) {
          const j = await up.json();
          const ch = j?.data?.Character;
          if (ch?.name?.full) {
            mediaTitle = ch.name.full;
            title = `${ch.name.full} — Character Profile & Voice Actors — ListTube`;
            desc = String(ch.description || `${ch.name.full} character details, appearances, and voice actors on ListTube`).replace(/\s+/g, " ").slice(0, 220);
            image = ch.image?.large || image;
          }
        }
      } else {
        if (routeType === "channel" && rawId) {
          redirectUrl = `${targetOrigin}/channel/${encodeURIComponent(rawId)}`;
        }
        const idMatch = rawId.match(/^(anilist|anilist-manga|mal|mal-manga):(\d+)$/i);
        if (idMatch) {
          const prefix = idMatch[1].toLowerCase();
          const numericId = Number(idMatch[2]);
          const mediaType = prefix.includes("manga") ? "MANGA" : "ANIME";
          schemaType = mediaType === "MANGA" ? "Book" : "TVSeries";
          const isMal = prefix.startsWith("mal");
          const cacheKey = `og:${prefix}:${numericId}`;

          const { data: cachedOg } = await supabase
            .from("api_cache")
            .select("payload, expires_at")
            .eq("cache_key", cacheKey)
            .maybeSingle();

          let media: any = cachedOg?.payload;
          if (!media || new Date(cachedOg.expires_at).getTime() <= Date.now()) {
            const gql = isMal
              ? `query($idMal: Int, $type: MediaType) { Media(idMal: $idMal, type: $type) { title { english romaji } description(asHtml: false) bannerImage coverImage { extraLarge } averageScore episodes chapters format startDate { year } } }`
              : `query($id: Int, $type: MediaType) { Media(id: $id, type: $type) { title { english romaji } description(asHtml: false) bannerImage coverImage { extraLarge } averageScore episodes chapters format startDate { year } } }`;
            const vars = isMal ? { idMal: numericId, type: mediaType } : { id: numericId, type: mediaType };
            const up = await fetch("https://graphql.anilist.co", {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({ query: gql, variables: vars }),
            });
            if (up.ok) {
              const j = await up.json();
              media = j?.data?.Media ?? null;
              if (media) {
                await supabase.from("api_cache").upsert(
                  {
                    cache_key: cacheKey,
                    payload: media,
                    expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: "cache_key" }
                );
              }
            }
          }

          if (media) {
            mediaTitle = media.title?.english || media.title?.romaji || "Untitled";
            ratingValue = media.averageScore ? (media.averageScore / 10).toFixed(1) : null;
            const scoreLabel = ratingValue ? ` • ★ ${ratingValue}` : "";
            const yearLabel = media.startDate?.year ? ` (${media.startDate.year})` : "";
            title =
              routeType === "channel"
                ? `${mediaTitle} Franchise Seasons & Studio — ListTube`
                : `${mediaTitle}${yearLabel}${scoreLabel} — ListTube`;
            desc = String(media.description ?? desc).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 220);
            image = media.bannerImage || media.coverImage?.extraLarge || image;
          }
        }
      }

      const jsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": schemaType,
        name: mediaTitle,
        description: desc,
        image,
        url: redirectUrl,
        ...(ratingValue
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue,
                bestRating: "10",
                worstRating: "1",
              },
            }
          : {}),
      });

      const redirectTags = isBot
        ? ""
        : `\n<meta http-equiv="refresh" content="0;url=${escapeHtml(redirectUrl)}" />\n<script>window.location.replace(${JSON.stringify(redirectUrl)});</script>`;

      const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${escapeHtml(redirectUrl)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="ListTube" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:url" content="${escapeHtml(redirectUrl)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<script type="application/ld+json">${jsonLd}</script>${redirectTags}
</head><body style="background:#0F0F0F;color:#fff;font-family:sans-serif;padding:32px;max-width:720px;margin:0 auto"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(desc)}</p><p><a href="${escapeHtml(redirectUrl)}" style="color:#3EA6FF">Open ${escapeHtml(mediaTitle)} on ListTube</a></p></body></html>`;

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // =========================================================================
    // ListTube Standalone Tracker API: Community Stats, Rankings & Scoped /v1/*
    // =========================================================================

    if (path === "/stats" && req.method === "GET") {
      const animeId = String(url.searchParams.get("animeId") || "").trim();
      if (!animeId) return jsonResponse({ error: "Missing animeId" }, 400);
      const { data: rows } = await supabase
        .from("library_entries")
        .select("status, score, score_decimal")
        .eq("anime_id", animeId)
        .eq("is_private", false)
        .limit(2500);

      let members = 0;
      let watching = 0;
      let completed = 0;
      let planned = 0;
      let scoreSum = 0;
      let scoreCount = 0;
      for (const r of rows ?? []) {
        members += 1;
        if (r.status === "watching") watching += 1;
        else if (r.status === "completed") completed += 1;
        else if (r.status === "planned") planned += 1;
        const sc = Number(r.score_decimal ?? r.score ?? 0);
        if (sc > 0) {
          scoreSum += sc;
          scoreCount += 1;
        }
      }
      return jsonResponse({
        animeId,
        members,
        watching,
        completed,
        planned,
        meanScore: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : null,
        ratedCount: scoreCount,
      });
    }

    if (path === "/rankings" && req.method === "GET") {
      const mediaType = String(url.searchParams.get("mediaType") || "ANIME").toUpperCase() === "MANGA" ? "MANGA" : "ANIME";
      const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit") || 40)));
      const { data: rows } = await supabase
        .from("library_entries")
        .select("anime_id, score, score_decimal, status, media_snapshot")
        .eq("media_type", mediaType)
        .eq("is_private", false)
        .limit(4000);

      const agg = new Map<string, { animeId: string; members: number; scoreSum: number; scoreCount: number; snapshot: any }>();
      for (const r of rows ?? []) {
        const cur = agg.get(r.anime_id) ?? { animeId: r.anime_id, members: 0, scoreSum: 0, scoreCount: 0, snapshot: r.media_snapshot };
        cur.members += 1;
        if (!cur.snapshot && r.media_snapshot) cur.snapshot = r.media_snapshot;
        const sc = Number(r.score_decimal ?? r.score ?? 0);
        if (sc > 0) {
          cur.scoreSum += sc;
          cur.scoreCount += 1;
        }
        agg.set(r.anime_id, cur);
      }
      const ranked = Array.from(agg.values())
        .map((x) => {
          const mean = x.scoreCount > 0 ? Math.round((x.scoreSum / x.scoreCount) * 10) / 10 : null;
          return { ...x, meanScore: mean };
        })
        .sort((a, b) => (b.members - a.members) || ((b.meanScore ?? 0) - (a.meanScore ?? 0)))
        .slice(0, limit);
      return jsonResponse({ mediaType, items: ranked });
    }

    if (path.startsWith("/v1/")) {
      const authHeader = req.headers.get("authorization") || "";
      const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();

      if (path === "/v1/keys" && req.method === "POST") {
        if (!bearer || bearer.startsWith("lt_")) {
          return jsonResponse({ error: "User JWT required to manage API keys" }, 401);
        }
        const { data: authUser, error: authErr } = await supabase.auth.getUser(bearer);
        if (authErr || !authUser?.user?.id) {
          return jsonResponse({ error: "Invalid session token" }, 401);
        }
        const uid = authUser.user.id;
        const body = await req.json().catch(() => ({}));
        const op = String(body.action || "list");

        if (op === "list") {
          const { data: keys } = await supabase
            .from("user_api_keys")
            .select("id, label, token_prefix, last_used_at, created_at")
            .eq("user_id", uid)
            .order("created_at", { ascending: false });
          return jsonResponse({ keys: keys ?? [] });
        }

        if (op === "revoke") {
          const id = String(body.id || "").trim();
          if (!id) return jsonResponse({ error: "Missing key id" }, 400);
          await supabase.from("user_api_keys").delete().eq("id", id).eq("user_id", uid);
          return jsonResponse({ ok: true });
        }

        if (op === "create") {
          const rawBytes = new Uint8Array(24);
          crypto.getRandomValues(rawBytes);
          const hex = Array.from(rawBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
          const rawToken = `lt_${hex}`;
          const tokenHash = await sha256Hex(rawToken);
          const label = String(body.label || "Browser Scrobbler").trim().slice(0, 48);
          const { data: created, error: createErr } = await supabase
            .from("user_api_keys")
            .insert({
              user_id: uid,
              label,
              token_hash: tokenHash,
              token_prefix: `${rawToken.slice(0, 10)}...`,
            })
            .select("id, label, token_prefix, created_at")
            .single();
          if (createErr) return jsonResponse({ error: createErr.message }, 400);
          return jsonResponse({ ok: true, token: rawToken, key: created });
        }
        return jsonResponse({ error: "Unsupported key action" }, 400);
      }

      // Scoped API Key auth for /v1/me, /v1/list, /v1/progress
      if (!bearer.startsWith("lt_")) {
        return jsonResponse({ error: "Missing Bearer lt_... API key" }, 401);
      }
      const tokenHash = await sha256Hex(bearer);
      const { data: keyRow } = await supabase
        .from("user_api_keys")
        .select("id, user_id")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (!keyRow?.user_id) {
        return jsonResponse({ error: "Invalid or revoked API key" }, 401);
      }
      void supabase
        .from("user_api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyRow.id);

      const uid = keyRow.user_id;

      if (path === "/v1/me" && req.method === "GET") {
        const [{ data: profile }, { count }] = await Promise.all([
          supabase.from("profiles").select("display_name, handle, avatar_url").eq("id", uid).maybeSingle(),
          supabase.from("library_entries").select("id", { count: "exact", head: true }).eq("user_id", uid),
        ]);
        return jsonResponse({ userId: uid, profile: profile ?? null, trackedCount: count ?? 0 });
      }

      if (path === "/v1/list" && req.method === "GET") {
        const mediaTypeFilter = url.searchParams.get("mediaType");
        const statusFilter = url.searchParams.get("status");
        let query = supabase
          .from("library_entries")
          .select("anime_id, media_type, status, score, score_decimal, progress, updated_at, media_snapshot")
          .eq("user_id", uid)
          .order("updated_at", { ascending: false })
          .limit(500);
        if (mediaTypeFilter === "ANIME" || mediaTypeFilter === "MANGA") {
          query = query.eq("media_type", mediaTypeFilter);
        }
        if (statusFilter) query = query.eq("status", statusFilter);
        const { data: items, error } = await query;
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ items: items ?? [] });
      }

      if (path === "/v1/progress" && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        const animeId = String(body.animeId || "").trim();
        if (!animeId) return jsonResponse({ error: "Missing animeId" }, 400);
        const nowMs = Date.now();
        const mediaType = String(body.mediaType || (animeId.includes("manga") ? "MANGA" : "ANIME")).toUpperCase() === "MANGA" ? "MANGA" : "ANIME";
        const payload: Record<string, unknown> = {
          user_id: uid,
          anime_id: animeId,
          media_type: mediaType,
          status: String(body.status || "watching"),
          updated_at: nowMs,
        };
        if (typeof body.progress === "number" && body.progress >= 0) {
          payload.progress = Math.floor(body.progress);
        }
        if (typeof body.score === "number" && body.score >= 0 && body.score <= 10) {
          payload.score = Math.round(body.score);
          payload.score_decimal = Math.round(body.score * 10) / 10;
        }
        const { data: saved, error } = await supabase
          .from("library_entries")
          .upsert(payload, { onConflict: "user_id,anime_id" })
          .select("anime_id, status, progress, score_decimal, updated_at")
          .single();
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true, entry: saved });
      }
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (err: any) {
    return jsonResponse({ error: err?.message || "Internal server error" }, 500);
  }
});
