# AniTube

**A YouTube-inspired Anime & Manga Discovery, Tracking, and Recommendation App.**

Built with React, TypeScript, Tailwind CSS, and Capacitor Android — combining YouTube's dark AMOLED interface, 16:9 infinite feed, and multi-source community recommendation algorithms with zero forced logins.

---

## Key Features

- **YouTube-Inspired 16:9 UI:** Pure `#0F0F0F` AMOLED theme, infinite scrolling Home feed (`For You`), collapsible sidebar, category filter chips, circular studio channel avatars, and official wide banners.
- **Community-Backed Recommendation Engine:**
  - Combines **AniList Community Recommendations**, live **MyAnimeList `/userrecs` fan votes**, franchise relations (sequels/prequels with Season 1 inheritance), and curated Reddit/editorial pairings.
  - Multi-dimensional feature vector cosine similarity weighting niche AniList tags, studios, genres, and formats — paired with MMR diversification to prevent repetitive recommendations.
- **5-List Subscription Model:** Tap **Subscribe** on any title to pick from *Watching / Reading*, *Plan to Watch / Read*, *Completed*, *On Hold*, or *Dropped*, immediately tuning your personalized feed.
- **Anime & Manga Mode Switch:** Cleanly separates Anime and Manga feeds, genres, progress counters (episodes vs. chapters), and official links.
- **Smart Fuzzy Search:** Instant autocomplete suggestions and partial-word / acronym search (`"shang"` -> *Shangri-La Frontier*, `"slf"`, `"aot"`, `"jjk"`) powered by MAL Prefix, Shikimori, and AniList batch hydration.
- **Trailers & Official Links:** Embedded 16:9 official YouTube trailer player (click **Play Trailer**, or enable **Auto-Play Trailers** in Settings) and direct links to official platforms.
- **Live Hub (Schedule & News):** Real-time 7-day airing schedule countdowns from AniList and illustrated anime/manga news from MyAnimeList & Anime News Network.
- **Seamless Sync (Zero Login Required):** Works 100% offline-first locally, with 1-click import from **AniList**, **MyAnimeList**, private tokens/XML exports, or a **Google** profile in the Connect panel.

---

## Architecture

```text
anitube-app/
├── src/
│   ├── components/
│   │   ├── AnimeCard.tsx        # 16:9 YouTube video card with official banners & framed artwork
│   │   ├── DetailView.tsx       # Watch page: trailer hero, 5-list Subscribe, inline description, Up Next
│   │   ├── HomeView.tsx         # Infinite "For You" feed, category chips & personalized shelves
│   │   ├── ExploreView.tsx      # Infinite discovery across Trending, Top Rated, Seasonal & Genres
│   │   ├── ListView.tsx         # Subscriptions hub with channel stories & +/- progress counters
│   │   ├── ScheduleView.tsx     # 7-day live broadcast schedule from AniList
│   │   ├── NewsView.tsx         # Illustrated anime & manga news from MAL & ANN
│   │   ├── TrackersModal.tsx    # AniList, MyAnimeList & Google connection panel
│   │   ├── SettingsModal.tsx    # Auto-play trailer toggle & artwork cache controls
│   │   ├── Sidebar.tsx          # Collapsible YouTube navigation + live Subscriptions list
│   │   └── TopBar.tsx           # Fuzzy live search bar, Anime/Manga switch & corner Connect pill
│   ├── services/
│   │   ├── anilist.ts           # AniList GraphQL client (Anime, Manga, Schedule, batch MAL hydration)
│   │   ├── recommender.ts       # Community-backed vector recommendation & infinite pagination engine
│   │   ├── search.ts            # Multi-source fuzzy prefix & acronym search engine
│   │   ├── trackers.ts          # AniList, MyAnimeList & XML/token importers
│   │   ├── news.ts              # MAL News & ANN RSS feed aggregator with artwork enrichment
│   │   ├── library.ts           # Offline-first reactive store (localStorage)
│   │   └── animeStore.ts        # Smart metadata & artwork cache
├── android/                     # Capacitor Android native project (CapacitorHttp enabled)
├── vercel.json                  # Production proxy rewrites for Web deployment
└── .github/workflows/build.yml  # Automated Web & Android CI pipeline
```

---

## Development Setup

### Prerequisites
- Node.js 20+
- Android Studio / Android SDK 35 (only required for building the APK locally)

### Run Website Locally
```bash
npm install
npm run dev
```

### Build Production Website
```bash
npm run build
```

### Build & Install Android App (Capacitor)
```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## Deployment

- **Web (Vercel):** Ready out of the box with [`vercel.json`](vercel.json) handling `/proxy/mal/*` and `/proxy/ann/*` rewrites cleanly.
- **Android:** [`capacitor.config.ts`](capacitor.config.ts) enables `CapacitorHttp` so native Android requests work directly without CORS barriers.

---

## License

MIT License — see [LICENSE](LICENSE).
