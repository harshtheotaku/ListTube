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

function randomSyncCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes).map((b) => alphabet[b % alphabet.length]);
  return `LT-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, "").trim();
}

function mergeVaultPayloads(existing: any, incoming: any): any {
  if (!existing || typeof existing !== "object") return incoming;
  if (!incoming || typeof incoming !== "object") return existing;

  const existingEntries = existing.library?.entries ?? {};
  const incomingEntries = incoming.library?.entries ?? {};
  const mergedEntries: Record<string, any> = { ...existingEntries };

  for (const [id, entry] of Object.entries<any>(incomingEntries)) {
    const prev = mergedEntries[id];
    if (!prev || (entry?.updatedAt ?? 0) >= (prev?.updatedAt ?? 0)) {
      mergedEntries[id] = entry;
    }
  }

  const deletedSet = new Set<string>(incoming.deletedEntryIds ?? []);
  for (const dId of deletedSet) {
    if (mergedEntries[dId] && (incoming.library?.updatedAt ?? 0) > (mergedEntries[dId].updatedAt ?? 0)) {
      delete mergedEntries[dId];
    }
  }

  const mergeArr = (a: string[] = [], b: string[] = []) => Array.from(new Set([...a, ...b]));

  const existingComments = existing.comments ?? {};
  const incomingComments = incoming.comments ?? {};
  const mergedComments: Record<string, any[]> = {};
  const allMediaIds = new Set([...Object.keys(existingComments), ...Object.keys(incomingComments)]);
  for (const mId of allMediaIds) {
    const map = new Map<string, any>();
    for (const c of existingComments[mId] ?? []) {
      if (c?.id) map.set(c.id, c);
    }
    for (const c of incomingComments[mId] ?? []) {
      if (c?.id) map.set(c.id, c);
    }
    const deletedComments = new Set<string>(incoming.deletedCommentIds ?? []);
    for (const delId of deletedComments) map.delete(delId);
    mergedComments[mId] = Array.from(map.values()).sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0));
  }

  const snapshots = { ...(existing.snapshots ?? {}), ...(incoming.snapshots ?? {}) };

  const existingProfileAt = existing.profileUpdatedAt ?? 0;
  const incomingProfileAt = incoming.profileUpdatedAt ?? Date.now();
  const profile = incomingProfileAt >= existingProfileAt ? incoming.profile ?? existing.profile : existing.profile;

  const settings = incoming.settings ?? existing.settings;

  const incomingTrackers = incoming.library?.trackers ?? existing.library?.trackers ?? [];
  const mergedNotInterested = mergeArr(existing.library?.notInterested, incoming.library?.notInterested);

  return {
    library: {
      entries: mergedEntries,
      notInterested: mergedNotInterested,
      events: (incoming.library?.events?.length ?? 0) >= (existing.library?.events?.length ?? 0)
        ? incoming.library?.events ?? []
        : existing.library?.events ?? [],
      trackers: incomingTrackers,
      interests: incoming.library?.interests ?? existing.library?.interests ?? [],
      mangaInterests: incoming.library?.mangaInterests ?? existing.library?.mangaInterests ?? [],
      updatedAt: Math.max(existing.library?.updatedAt ?? 0, incoming.library?.updatedAt ?? 0, Date.now()),
    },
    profile,
    profileUpdatedAt: Math.max(existingProfileAt, incomingProfileAt),
    settings,
    comments: mergedComments,
    snapshots,
  };
}

const DOUJIN_FILTER_RE = /\b(doujinshi|dj|hentai|nsfw|netorare|ntr|loli|shota|ecchi-hon|bakunyuu|bitch|paizuri|chikan|oppai)\b/i;

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

    // 7. Zero-Email Cross-Device Cloud Sync Vault (Sync Code: LT-XXXX-XXXX-XXXX)
    if (path === "/sync" && req.method === "GET") {
      const code = normalizeCode(url.searchParams.get("code") ?? "");
      if (code.length < 8) return jsonResponse({ error: "Invalid sync code" }, 400);
      const hash = await sha256Hex(code);
      const { data: vault } = await supabase
        .from("sync_vaults")
        .select("payload, version, updated_at")
        .eq("sync_code_hash", hash)
        .maybeSingle();

      if (!vault) return jsonResponse({ error: "Sync code not found" }, 404);
      return jsonResponse({ payload: vault.payload, version: vault.version, updatedAt: vault.updated_at });
    }

    if (path === "/sync" && req.method === "POST") {
      const body = await req.json();
      const action = String(body.action ?? "push");
      const incoming = body.payload ?? {};

      if (action === "create") {
        const code = randomSyncCode();
        const hash = await sha256Hex(code);
        const nowIso = new Date().toISOString();
        const { error } = await supabase.from("sync_vaults").insert({
          sync_code_hash: hash,
          payload: incoming,
          version: 1,
          updated_at: nowIso,
        });
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ ok: true, code, payload: incoming, version: 1, updatedAt: nowIso });
      }

      const code = normalizeCode(String(body.code ?? ""));
      if (code.length < 8) return jsonResponse({ error: "Missing sync code" }, 400);
      const hash = await sha256Hex(code);

      const { data: existing } = await supabase
        .from("sync_vaults")
        .select("payload, version")
        .eq("sync_code_hash", hash)
        .maybeSingle();

      const merged = existing ? mergeVaultPayloads(existing.payload, incoming) : incoming;
      const nextVersion = (existing?.version ?? 0) + 1;
      const nowIso = new Date().toISOString();

      const { error } = await supabase.from("sync_vaults").upsert(
        {
          sync_code_hash: hash,
          payload: merged,
          version: nextVersion,
          updated_at: nowIso,
        },
        { onConflict: "sync_code_hash" }
      );
      if (error) return jsonResponse({ error: error.message }, 500);

      return jsonResponse({ ok: true, code, payload: merged, version: nextVersion, updatedAt: nowIso });
    }

    // 8. AniList Live Progress / Status / Score Write-Back Mutation
    if (path === "/anilist-writeback" && req.method === "POST") {
      const body = await req.json();
      const token = String(body.token ?? "").trim();
      const mediaId = Number(body.mediaId ?? 0);
      const statusMap: Record<string, string> = {
        watching: "CURRENT",
        completed: "COMPLETED",
        planned: "PLANNING",
        on_hold: "PAUSED",
        dropped: "DROPPED",
      };
      const anilistStatus = statusMap[String(body.status ?? "")] ?? undefined;
      if (!token || !mediaId) return jsonResponse({ error: "Missing AniList token or mediaId" }, 400);

      const mutation = `
        mutation($mediaId: Int, $status: MediaListStatus, $scoreRaw: Int, $progress: Int) {
          SaveMediaListEntry(mediaId: $mediaId, status: $status, scoreRaw: $scoreRaw, progress: $progress) {
            id
            status
            score
            progress
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
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || json.errors?.length) {
        return jsonResponse({ error: json.errors?.[0]?.message ?? `AniList HTTP ${res.status}` }, 400);
      }
      return jsonResponse({ ok: true, entry: json.data?.SaveMediaListEntry });
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (err: any) {
    return jsonResponse({ error: err?.message || "Internal server error" }, 500);
  }
});
