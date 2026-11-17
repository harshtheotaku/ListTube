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
        return jsonResponse(payload, 200, { "X-ListTube-Cache": "MISS" });
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
            site: "Re Anime",
            key: "reanime",
            url: bestBySite.get("reanime")?.url ?? `https://reanime.cc/?s=${q}`,
            isDirect: Boolean(bestBySite.get("reanime")),
          },
          {
            site: "KotoPlay",
            key: "kotoplay",
            url: bestBySite.get("kotoplay")?.url ?? `https://kotoplay.to/search?keyword=${q}`,
            isDirect: Boolean(bestBySite.get("kotoplay")),
          },
          {
            site: "AnimePahe",
            key: "animepahe",
            url: "https://animepahe.pw/",
            isDirect: false,
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
      const anilistClientId = Deno.env.get("ANILIST_CLIENT_ID") ?? "";
      const malClientId = Deno.env.get("MAL_CLIENT_ID") ?? "";
      return jsonResponse({
        anilistConfigured: Boolean(anilistClientId),
        anilistClientId: anilistClientId || undefined,
        malConfigured: Boolean(malClientId),
        malClientId: malClientId || undefined,
      });
    }

    // 8. AniList OAuth Authorization Code Exchange
    if (path === "/oauth/anilist/exchange" && req.method === "POST") {
      const body = await req.json();
      const code = String(body.code ?? "").trim();
      const redirectUri = String(body.redirectUri ?? "").trim();
      const clientId = String(body.clientId ?? Deno.env.get("ANILIST_CLIENT_ID") ?? "").trim();
      const clientSecret = String(body.clientSecret ?? Deno.env.get("ANILIST_CLIENT_SECRET") ?? "").trim();
      if (!code || !redirectUri || !clientId || !clientSecret) {
        return jsonResponse(
          { error: "AniList OAuth requires ANILIST_CLIENT_ID & ANILIST_CLIENT_SECRET on server (or use Implicit/Token fallback)." },
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
      return jsonResponse(data);
    }

    // 9. MyAnimeList OAuth 2.0 PKCE Token Exchange & Refresh
    if (path === "/oauth/mal/token" && req.method === "POST") {
      const body = await req.json();
      const grantType = body.grantType === "refresh_token" ? "refresh_token" : "authorization_code";
      const clientId = String(body.clientId ?? Deno.env.get("MAL_CLIENT_ID") ?? "").trim();
      const clientSecret = String(body.clientSecret ?? Deno.env.get("MAL_CLIENT_SECRET") ?? "").trim();
      if (!clientId) {
        return jsonResponse({ error: "MAL OAuth Client ID is not configured yet (set MAL_CLIENT_ID in Supabase Edge Secrets)." }, 400);
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
      return jsonResponse(data);
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
          ) {
            id
            status
            score
            progress
            progressVolumes
            repeat
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

    // 13. SSR OpenGraph Link Preview Endpoint (?id=anilist:16498 or ?id=anilist-manga:30002)
    if (path === "/share" && req.method === "GET") {
      const rawId = (url.searchParams.get("id") ?? "").trim();
      const targetOrigin = (url.searchParams.get("origin") ?? "https://listtube.vercel.app").replace(/\/$/, "");
      const redirectUrl = rawId ? `${targetOrigin}/anime/${encodeURIComponent(rawId)}` : targetOrigin;

      let title = "ListTube — Anime & Manga Recommendations";
      let desc = "Track anime & manga, read reviews, explore MAL catalogs, and get personalized recommendations.";
      let image = "https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg";

      const idMatch = rawId.match(/^(anilist|anilist-manga|mal|mal-manga):(\d+)$/i);
      if (idMatch) {
        const prefix = idMatch[1].toLowerCase();
        const numericId = Number(idMatch[2]);
        const mediaType = prefix.includes("manga") ? "MANGA" : "ANIME";
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
          const mTitle = media.title?.english || media.title?.romaji || "Untitled";
          const scoreLabel = media.averageScore ? ` • ★ ${(media.averageScore / 10).toFixed(1)}` : "";
          const yearLabel = media.startDate?.year ? ` (${media.startDate.year})` : "";
          title = `${mTitle}${yearLabel}${scoreLabel} — ListTube`;
          desc = String(media.description ?? desc).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 220);
          image = media.bannerImage || media.coverImage?.extraLarge || image;
        }
      }

      const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}" />
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
<meta http-equiv="refresh" content="0;url=${escapeHtml(redirectUrl)}" />
<script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
</head><body style="background:#0F0F0F;color:#fff;font-family:sans-serif;padding:32px"><p>Opening <a href="${escapeHtml(redirectUrl)}" style="color:#3EA6FF">${escapeHtml(title)}</a>…</p></body></html>`;

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (err: any) {
    return jsonResponse({ error: err?.message || "Internal server error" }, 500);
  }
});
