import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, Play, X } from 'lucide-react';
import {
  Anime,
  ListStatus,
  LIST_STATUS_ORDER,
  MediaType,
  statusLabel,
} from './types';
import { useLibrary, library } from './services/library';
import { animeStore } from './services/animeStore';
import { fetchDetail } from './services/anilist';
import { cloudSync } from './services/cloudSync';
import { isNativeCapacitor } from './services/platform';
import { Sidebar, AppTab } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { TopBar } from './components/TopBar';
import { HomeView } from './components/HomeView';
import { GridSkeleton } from './components/Skeleton';
import { ToastHost, toast } from './components/Toast';
import type { EntityRouteTarget } from './components/EntityView';

// Code-split secondary views and modals to keep initial JS chunk tiny
const ExploreView = lazy(() =>
  import('./components/ExploreView').then((m) => ({ default: m.ExploreView }))
);
const ListView = lazy(() =>
  import('./components/ListView').then((m) => ({ default: m.ListView }))
);
const ScheduleView = lazy(() =>
  import('./components/ScheduleView').then((m) => ({ default: m.ScheduleView }))
);
const NewsView = lazy(() =>
  import('./components/NewsView').then((m) => ({ default: m.NewsView }))
);
const FeedView = lazy(() =>
  import('./components/FeedView').then((m) => ({ default: m.FeedView }))
);
const YouView = lazy(() =>
  import('./components/YouView').then((m) => ({ default: m.YouView }))
);
const DetailView = lazy(() =>
  import('./components/DetailView').then((m) => ({ default: m.DetailView }))
);
const ChannelView = lazy(() =>
  import('./components/ChannelView').then((m) => ({ default: m.ChannelView }))
);
const EntityView = lazy(() =>
  import('./components/EntityView').then((m) => ({ default: m.EntityView }))
);
const UserProfileView = lazy(() =>
  import('./components/UserProfileModal').then((m) => ({ default: m.UserProfileView }))
);
const TrackersModal = lazy(() =>
  import('./components/TrackersModal').then((m) => ({ default: m.TrackersModal }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const ProfileModal = lazy(() =>
  import('./components/ProfileModal').then((m) => ({ default: m.ProfileModal }))
);
const NotificationsModal = lazy(() =>
  import('./components/NotificationsModal').then((m) => ({ default: m.NotificationsModal }))
);
const SyncConflictModal = lazy(() =>
  import('./components/SyncConflictModal').then((m) => ({ default: m.SyncConflictModal }))
);
const CommandPaletteModal = lazy(() =>
  import('./components/CommandPaletteModal').then((m) => ({ default: m.CommandPaletteModal }))
);
const WrappedModal = lazy(() =>
  import('./components/WrappedModal').then((m) => ({ default: m.WrappedModal }))
);
const ThemeQuizModal = lazy(() =>
  import('./components/ThemeQuizModal').then((m) => ({ default: m.ThemeQuizModal }))
);
const InAppBrowserModal = lazy(() =>
  import('./components/InAppBrowserModal').then((m) => ({ default: m.InAppBrowserModal }))
);
import { MiniPlayer } from './components/MiniPlayer';
import { resetScrollChrome } from './services/scrollChrome';

const TABS: AppTab[] = ['home', 'explore', 'list', 'schedule', 'news', 'feed', 'you'];
const MEDIA_TYPE_KEY = 'anitube.mediaType.v1';

const EMPTY_QUERIES: Record<AppTab, string> = {
  home: '',
  explore: '',
  list: '',
  schedule: '',
  news: '',
  feed: '',
  you: '',
};

function getWebBasePath(): string {
  if (typeof window === 'undefined' || isNativeCapacitor() || !window.location.protocol.startsWith('http')) {
    return '';
  }
  if (window.location.pathname.startsWith('/ListTube')) return '/ListTube';
  const rawBase = import.meta.env.BASE_URL;
  if (rawBase && rawBase !== './' && rawBase !== '/') return rawBase.replace(/\/+$/, '');
  return '';
}

function buildRouteUrl(snap: {
  tab: AppTab;
  detailId: string | null;
  channelId?: string | null;
  publicUser?: string | null;
  entityTarget?: EntityRouteTarget | null;
}): string {
  const seg = snap.detailId
    ? `/anime/${encodeURIComponent(snap.detailId)}`
    : snap.channelId
    ? `/channel/${encodeURIComponent(snap.channelId)}`
    : snap.publicUser
    ? `/user/${encodeURIComponent(snap.publicUser)}`
    : snap.entityTarget
    ? `/${snap.entityTarget.kind}/${encodeURIComponent(snap.entityTarget.idOrName)}`
    : `/${snap.tab}`;

  if (typeof window === 'undefined' || isNativeCapacitor() || !window.location.protocol.startsWith('http')) {
    return `#${seg}`;
  }
  const base = getWebBasePath();
  const suffix = window.location.search;
  return `${base}${seg === '/home' ? '/' : seg}${suffix}`;
}

function parseCurrentRoute(): {
  tab: AppTab;
  detailId: string | null;
  channelId: string | null;
  publicUser: string | null;
  entityTarget: EntityRouteTarget | null;
} {
  // Handle GitHub Pages 404.html SPA redirect query parameter (?p=/anime/...)
  const search = new URLSearchParams(window.location.search);
  const spaRedirect = search.get('p');

  const hashRaw = window.location.hash.startsWith('#/')
    ? window.location.hash.slice(2).split('?')[0]
    : '';

  const base = getWebBasePath();
  let pathRaw = window.location.pathname;
  if (base && pathRaw.startsWith(base)) pathRaw = pathRaw.slice(base.length);
  pathRaw = pathRaw.replace(/^\/+|\/+$/g, '');

  const raw = decodeURIComponent(spaRedirect?.replace(/^\/+/, '') || hashRaw || pathRaw || '');
  const tabFromState = window.history.state?.tab as AppTab | undefined;
  const fallback: AppTab = TABS.includes(tabFromState as AppTab) ? (tabFromState as AppTab) : 'home';

  if (raw.startsWith('anime/')) {
    return {
      tab: fallback,
      detailId: decodeURIComponent(raw.slice('anime/'.length)) || null,
      channelId: null,
      publicUser: null,
      entityTarget: null,
    };
  }
  if (raw.startsWith('channel/')) {
    return {
      tab: fallback,
      detailId: null,
      channelId: decodeURIComponent(raw.slice('channel/'.length)) || null,
      publicUser: null,
      entityTarget: null,
    };
  }
  if (raw.startsWith('user/')) {
    return {
      tab: fallback,
      detailId: null,
      channelId: null,
      publicUser: decodeURIComponent(raw.slice('user/'.length)) || null,
      entityTarget: null,
    };
  }
  if (raw.startsWith('person/')) {
    const id = decodeURIComponent(raw.slice('person/'.length)).trim();
    return {
      tab: fallback,
      detailId: null,
      channelId: null,
      publicUser: null,
      entityTarget: id ? { kind: 'person', idOrName: id } : null,
    };
  }
  if (raw.startsWith('character/')) {
    const id = decodeURIComponent(raw.slice('character/'.length)).trim();
    return {
      tab: fallback,
      detailId: null,
      channelId: null,
      publicUser: null,
      entityTarget: id ? { kind: 'character', idOrName: id } : null,
    };
  }
  if (raw.startsWith('studio/')) {
    const name = decodeURIComponent(raw.slice('studio/'.length)).trim();
    return {
      tab: fallback,
      detailId: null,
      channelId: null,
      publicUser: null,
      entityTarget: name ? { kind: 'studio', idOrName: name } : null,
    };
  }
  return {
    tab: TABS.includes(raw as AppTab) ? (raw as AppTab) : fallback,
    detailId: null,
    channelId: null,
    publicUser: null,
    entityTarget: null,
  };
}

export const App: React.FC = () => {
  const libraryState = useLibrary();
  const [, setHydrationTick] = useState(0);
  const [initialRoute] = useState(parseCurrentRoute);
  const [tab, setTab] = useState<AppTab>(initialRoute.tab);
  const [detailId, setDetailId] = useState<string | null>(initialRoute.detailId);
  const [channelAnime, setChannelAnime] = useState<Anime | null>(() =>
    initialRoute.channelId ? animeStore.get(initialRoute.channelId) ?? null : null
  );
  const [publicUser, setPublicUser] = useState<string | null>(initialRoute.publicUser);
  const [entityTarget, setEntityTarget] = useState<EntityRouteTarget | null>(initialRoute.entityTarget);
  const [mediaType, setMediaType] = useState<MediaType>(() => {
    if (window.location.hash.includes('mode=manga')) return 'MANGA';
    if (window.location.hash.includes('mode=anime')) return 'ANIME';
    return localStorage.getItem(MEDIA_TYPE_KEY) === 'MANGA' ? 'MANGA' : 'ANIME';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [queriesByTab, setQueriesByTab] = useState<Record<AppTab, string>>(() => {
    const initialQ =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('q')?.trim() ?? '' : '';
    if (!initialQ) return EMPTY_QUERIES;
    return { ...EMPTY_QUERIES, [initialRoute.tab]: initialQ };
  });
  const [trackersOpen, setTrackersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [syncDiffOpen, setSyncDiffOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quickTarget, setQuickTarget] = useState<Anime | null>(null);
  const [explorePresetGenre, setExplorePresetGenre] = useState<string | null>(null);

  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, []);

  useEffect(() => {
    const unsubDb = animeStore.subscribeHydration(() => setHydrationTick((n) => n + 1));
    const unsubOAuth = cloudSync.onOAuthCompleted((info) => {
      if (info.error) {
        toast(info.error);
      } else {
        toast(
          `${info.provider === 'mal' ? 'MyAnimeList' : 'AniList'} OAuth connected (${info.count} titles, 2-way sync active)!`
        );
      }
    });
    return () => {
      unsubDb();
      unsubOAuth();
    };
  }, []);

  useEffect(() => {
    const CANONICAL_ORIGIN = 'https://listtube.vercel.app';
    let title = 'ListTube — Anime & Manga Tracker, Encyclopedia & Recommendations';
    let desc =
      'ListTube is a YouTube-inspired anime and manga tracker, encyclopedia, and discovery platform. Sync AniList & MyAnimeList, read reviews, and get personalized recommendations.';
    let canonicalPath = '/';

    if (detailId) {
      const m = animeStore.get(detailId);
      title = m ? `${m.title}${m.year ? ` (${m.year})` : ''} — ListTube` : 'Series Details — ListTube';
      if (m?.description) desc = m.description.slice(0, 160);
      canonicalPath = `/anime/${encodeURIComponent(detailId)}`;
    } else if (channelAnime) {
      title = `${channelAnime.title} Franchise Channel — ListTube`;
      canonicalPath = `/channel/${encodeURIComponent(channelAnime.id)}`;
    } else if (publicUser) {
      title = `@${publicUser} Profile — ListTube`;
      canonicalPath = `/user/${encodeURIComponent(publicUser)}`;
    } else if (entityTarget) {
      title =
        entityTarget.kind === 'studio'
          ? `${entityTarget.idOrName} Studio Productions — ListTube`
          : entityTarget.kind === 'character'
          ? `Character #${entityTarget.idOrName} Profile — ListTube`
          : `Voice Actor & Staff #${entityTarget.idOrName} — ListTube`;
      canonicalPath = `/${entityTarget.kind}/${encodeURIComponent(entityTarget.idOrName)}`;
    } else {
      const tabMeta: Record<AppTab, { title: string; path: string }> = {
        home: {
          title: 'ListTube — Anime & Manga Tracker, Encyclopedia & Recommendations',
          path: '/',
        },
        explore: {
          title: 'Explore Anime & Manga Catalog — ListTube',
          path: '/explore',
        },
        feed: {
          title: 'Community Activity & People — ListTube',
          path: '/feed',
        },
        schedule: {
          title: 'Anime Airing Schedule — ListTube',
          path: '/schedule',
        },
        news: {
          title: 'Anime & Manga News — ListTube',
          path: '/news',
        },
        list: {
          title: 'My Anime & Manga Watchlist — ListTube',
          path: '/list',
        },
        you: {
          title: 'My Channel & Taste Stats — ListTube',
          path: '/you',
        },
      };
      const meta = tabMeta[tab];
      title = meta.title;
      canonicalPath = meta.path;
    }

    document.title = title;
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.setAttribute('content', desc);
    let linkEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!linkEl) {
      linkEl = document.createElement('link');
      linkEl.rel = 'canonical';
      document.head.appendChild(linkEl);
    }
    linkEl.href = `${CANONICAL_ORIGIN}${canonicalPath}`;
  }, [tab, detailId, channelAnime, publicUser, entityTarget]);

  type NavSnapshot = {
    tab: AppTab;
    detailId: string | null;
    channelAnime: Anime | null;
    publicUser: string | null;
    entityTarget: EntityRouteTarget | null;
  };
  const navStackRef = useRef<NavSnapshot[]>([]);
  const routeRef = useRef<NavSnapshot>({
    tab: initialRoute.tab,
    detailId: initialRoute.detailId,
    channelAnime: initialRoute.channelId ? animeStore.get(initialRoute.channelId) ?? null : null,
    publicUser: initialRoute.publicUser,
    entityTarget: initialRoute.entityTarget,
  });
  routeRef.current = { tab, detailId, channelAnime, publicUser, entityTarget };

  const modalRef = useRef({ quickTarget, settingsOpen, trackersOpen, profileOpen, notificationsOpen, drawerOpen });
  modalRef.current = { quickTarget, settingsOpen, trackersOpen, profileOpen, notificationsOpen, drawerOpen };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

  const syncUrlReplace = (snap: NavSnapshot) => {
    const nextUrl = buildRouteUrl({
      tab: snap.tab,
      detailId: snap.detailId,
      channelId: snap.channelAnime?.id,
      publicUser: snap.publicUser,
      entityTarget: snap.entityTarget,
    });
    window.history.replaceState(
      {
        tab: snap.tab,
        detail: snap.detailId ?? undefined,
        channel: snap.channelAnime?.id ?? undefined,
        user: snap.publicUser ?? undefined,
        entity: snap.entityTarget ?? undefined,
      },
      '',
      nextUrl
    );
  };

  const pushSnapshot = (snap: NavSnapshot) => {
    const top = navStackRef.current[navStackRef.current.length - 1];
    if (
      top &&
      top.tab === snap.tab &&
      top.detailId === snap.detailId &&
      top.channelAnime?.id === snap.channelAnime?.id &&
      top.publicUser === snap.publicUser &&
      top.entityTarget?.kind === snap.entityTarget?.kind &&
      top.entityTarget?.idOrName === snap.entityTarget?.idOrName
    ) {
      return;
    }
    navStackRef.current.push(snap);
    if (navStackRef.current.length > 50) navStackRef.current.shift();
  };

  const goBackStep = (): boolean => {
    const {
      quickTarget: qt,
      settingsOpen: so,
      trackersOpen: to,
      profileOpen: po,
      notificationsOpen: no,
      drawerOpen: dw,
    } = modalRef.current;
    if (qt) {
      setQuickTarget(null);
      return true;
    }
    if (dw) {
      setDrawerOpen(false);
      return true;
    }
    if (no) {
      setNotificationsOpen(false);
      return true;
    }
    if (po) {
      setProfileOpen(false);
      return true;
    }
    if (so) {
      setSettingsOpen(false);
      return true;
    }
    if (to) {
      setTrackersOpen(false);
      return true;
    }

    if (navStackRef.current.length > 0 && window.history.length > 1) {
      window.history.back();
      return true;
    }

    const prev = navStackRef.current.pop();
    if (prev) {
      setTab(prev.tab);
      setDetailId(prev.detailId);
      setChannelAnime(prev.channelAnime);
      setPublicUser(prev.publicUser);
      setEntityTarget(prev.entityTarget);
      syncUrlReplace(prev);
      scrollTop();
      return true;
    }

    const curr = routeRef.current;
    if (curr.detailId || curr.channelAnime || curr.publicUser || curr.entityTarget) {
      const next: NavSnapshot = {
        tab: curr.tab,
        detailId: null,
        channelAnime: null,
        publicUser: null,
        entityTarget: null,
      };
      setDetailId(null);
      setChannelAnime(null);
      setPublicUser(null);
      setEntityTarget(null);
      syncUrlReplace(next);
      scrollTop();
      return true;
    }

    if (curr.tab !== 'home') {
      const next: NavSnapshot = {
        tab: 'home',
        detailId: null,
        channelAnime: null,
        publicUser: null,
        entityTarget: null,
      };
      setTab('home');
      syncUrlReplace(next);
      scrollTop();
      return true;
    }

    return false;
  };

  useEffect(() => {
    const win = window as unknown as { __anitubeHandleBack?: () => boolean };
    win.__anitubeHandleBack = goBackStep;
    return () => {
      delete win.__anitubeHandleBack;
    };
  }, []);

  const handleMediaTypeChange = (nextType: MediaType) => {
    setMediaType(nextType);
    localStorage.setItem(MEDIA_TYPE_KEY, nextType);
    setDetailId(null);
    setChannelAnime(null);
    setPublicUser(null);
    setEntityTarget(null);
    navStackRef.current = [];
    setQueriesByTab(EMPTY_QUERIES);
    scrollTop();
  };

  useEffect(() => {
    // Strip ?p= SPA redirect param after hydration cleanly
    const search = new URLSearchParams(window.location.search);
    if (search.has('p')) {
      search.delete('p');
      const qs = search.toString() ? `?${search.toString()}` : '';
      const nextUrl = buildRouteUrl({
        tab: initialRoute.tab,
        detailId: initialRoute.detailId,
        channelId: initialRoute.channelId,
        publicUser: initialRoute.publicUser,
        entityTarget: initialRoute.entityTarget,
      }).split('?')[0] + qs;
      window.history.replaceState({ tab: initialRoute.tab }, '', nextUrl);
    } else {
      syncUrlReplace({
        tab: initialRoute.tab,
        detailId: initialRoute.detailId,
        channelAnime: initialRoute.channelId ? animeStore.get(initialRoute.channelId) ?? null : null,
        publicUser: initialRoute.publicUser,
        entityTarget: initialRoute.entityTarget,
      });
    }

    if (initialRoute.channelId && !animeStore.get(initialRoute.channelId)) {
      const chId = initialRoute.channelId;
      const numeric = Number(chId.split(':')[1] ?? chId);
      const mt: MediaType = chId.includes('manga') ? 'MANGA' : 'ANIME';
      if (Number.isFinite(numeric) && numeric > 0) {
        fetchDetail(numeric, mt)
          .then((resolved) => {
            if (resolved) {
              animeStore.remember(resolved);
              setChannelAnime(resolved);
            }
          })
          .catch(() => {});
      }
    }
  }, [initialRoute]);

  const openDetail = (id: string) => {
    setDrawerOpen(false);
    if (detailId === id && !publicUser && !entityTarget) return;
    pushSnapshot(routeRef.current);
    const url = buildRouteUrl({ tab, detailId: id });
    window.history.pushState({ tab, detail: id }, '', url);
    setChannelAnime(null);
    setPublicUser(null);
    setEntityTarget(null);
    setDetailId(id);
    scrollTop();
  };

  const openAnime = (anime: Anime) => {
    animeStore.remember(anime);
    openDetail(anime.id);
  };

  const openChannel = (anime: Anime) => {
    setDrawerOpen(false);
    animeStore.remember(anime);
    if (!detailId && !publicUser && !entityTarget && channelAnime?.id === anime.id) return;
    pushSnapshot(routeRef.current);
    const url = buildRouteUrl({ tab, detailId: null, channelId: anime.id });
    window.history.pushState({ tab, channel: anime.id }, '', url);
    setDetailId(null);
    setPublicUser(null);
    setEntityTarget(null);
    setChannelAnime(anime);
    scrollTop();
  };

  const openPublicUser = (userIdOrHandle: string) => {
    setDrawerOpen(false);
    if (publicUser === userIdOrHandle) return;
    pushSnapshot(routeRef.current);
    const url = buildRouteUrl({ tab, detailId: null, publicUser: userIdOrHandle });
    window.history.pushState({ tab, user: userIdOrHandle }, '', url);
    setDetailId(null);
    setChannelAnime(null);
    setEntityTarget(null);
    setPublicUser(userIdOrHandle);
    scrollTop();
  };

  const openEntity = (target: EntityRouteTarget) => {
    setDrawerOpen(false);
    pushSnapshot(routeRef.current);
    const url = buildRouteUrl({ tab, detailId: null, entityTarget: target });
    window.history.pushState({ tab, entity: target }, '', url);
    setDetailId(null);
    setChannelAnime(null);
    setPublicUser(null);
    setEntityTarget(target);
    scrollTop();
  };

  const closeDetail = () => {
    goBackStep();
  };

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const state = event.state as {
        tab?: AppTab;
        detail?: string;
        channel?: string;
        user?: string;
        entity?: EntityRouteTarget;
      } | null;
      navStackRef.current.pop();
      setDrawerOpen(false);

      if (state && (state.detail || state.channel || state.user || state.entity || state.tab)) {
        if (state.detail) {
          setTab(state.tab ?? 'home');
          setChannelAnime(null);
          setPublicUser(null);
          setEntityTarget(null);
          setDetailId(state.detail);
        } else if (state.channel) {
          setTab(state.tab ?? 'home');
          setDetailId(null);
          setPublicUser(null);
          setEntityTarget(null);
          const cached = animeStore.get(state.channel) ?? null;
          setChannelAnime(cached);
          if (!cached) {
            const numeric = Number(state.channel.split(':')[1] ?? state.channel);
            const mt: MediaType = state.channel.includes('manga') ? 'MANGA' : 'ANIME';
            if (Number.isFinite(numeric) && numeric > 0) {
              void fetchDetail(numeric, mt).then((resolved) => {
                if (resolved) {
                  animeStore.remember(resolved);
                  setChannelAnime(resolved);
                }
              }).catch(() => {});
            }
          }
        } else if (state.user) {
          setTab(state.tab ?? 'feed');
          setDetailId(null);
          setChannelAnime(null);
          setEntityTarget(null);
          setPublicUser(state.user);
        } else if (state.entity) {
          setTab(state.tab ?? 'explore');
          setDetailId(null);
          setChannelAnime(null);
          setPublicUser(null);
          setEntityTarget(state.entity);
        } else {
          setDetailId(null);
          setChannelAnime(null);
          setPublicUser(null);
          setEntityTarget(null);
          if (state.tab) setTab(state.tab);
        }
      } else {
        const parsed = parseCurrentRoute();
        setTab(parsed.tab);
        setDetailId(parsed.detailId);
        setPublicUser(parsed.publicUser);
        setEntityTarget(parsed.entityTarget);
        setChannelAnime(parsed.channelId ? animeStore.get(parsed.channelId) ?? null : null);
      }
      scrollTop();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (next: AppTab) => {
    const curr = routeRef.current;
    if (curr.tab !== next || curr.detailId || curr.channelAnime || curr.publicUser || curr.entityTarget) {
      pushSnapshot(curr);
    }
    if (next === 'home') {
      setQueriesByTab((prev) => ({ ...prev, home: '' }));
    }
    setDrawerOpen(false);
    setTab(next);
    setDetailId(null);
    setChannelAnime(null);
    setPublicUser(null);
    setEntityTarget(null);
    const url = buildRouteUrl({ tab: next, detailId: null });
    if (
      window.history.state?.tab === next &&
      !window.history.state?.detail &&
      !window.history.state?.channel &&
      !window.history.state?.user &&
      !window.history.state?.entity
    ) {
      window.history.replaceState({ tab: next }, '', url);
    } else {
      window.history.pushState({ tab: next }, '', url);
    }
    scrollTop();
  };

  const openGenreInExplore = (genre: string) => {
    setExplorePresetGenre(genre);
    navigate('explore');
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      goBackStep();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!trackersOpen && !quickTarget && !settingsOpen && !profileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [trackersOpen, quickTarget, settingsOpen, profileOpen]);

  const stats = useMemo(() => {
    const entries = Object.values(libraryState.entries).filter((entry) => {
      const anime = animeStore.get(entry.animeId);
      return anime
        ? (anime.mediaType ?? 'ANIME') === mediaType
        : (entry.mediaType ?? 'ANIME') === mediaType;
    });
    return {
      tracked: entries.length,
      watching: entries.filter((entry) => entry.status === 'watching').length,
    };
  }, [libraryState.entries, mediaType]);

  const quickAdd = (anime: Anime) => {
    animeStore.remember(anime);
    setQuickTarget(anime);
  };

  const chooseStatus = (anime: Anime, status: ListStatus) => {
    library.setStatus(anime, status);
    setQuickTarget(null);
    toast(`Subscribed · Added to ${statusLabel(status, anime.mediaType)}`);
  };

  const quickEntry = quickTarget ? libraryState.entries[quickTarget.id] : undefined;
  const isWatchMode = Boolean(detailId || channelAnime || publicUser || entityTarget);
  const activeSearchKey: AppTab = isWatchMode ? 'explore' : tab;
  const activeQuery = queriesByTab[activeSearchKey];

  const handleQueryChange = (val: string) => {
    setQueriesByTab((prev) => ({ ...prev, [activeSearchKey]: val }));
  };

  const handleSearchSubmit = () => {
    if (isWatchMode) {
      navigate('explore');
      return;
    }
    if (tab === 'you') {
      const q = queriesByTab.you;
      setQueriesByTab((prev) => ({ ...prev, explore: q }));
      navigate('explore');
    }
  };

  const spinRoulette = () => {
    const excluded = new Set([
      ...Object.keys(libraryState.entries),
      ...libraryState.notInterested,
    ]);
    const pool = animeStore
      .all()
      .filter(
        (a) =>
          (a.mediaType ?? 'ANIME') === mediaType &&
          !excluded.has(a.id) &&
          a.cover &&
          (a.score ?? 0) >= 7.3
      );
    const list = pool.length ? pool : animeStore.all().filter((a) => (a.mediaType ?? 'ANIME') === mediaType && a.cover);
    if (!list.length) return;
    const picked = list[Math.floor(Math.random() * Math.min(list.length, 30))];
    if (picked) openAnime(picked);
  };

  return (
    <div className="min-h-screen w-full overflow-x-clip bg-[#0F0F0F] text-[#F1F1F1]">
      <TopBar
        query={activeQuery}
        onQueryChange={handleQueryChange}
        onSubmit={handleSearchSubmit}
        onHome={() => navigate('home')}
        onOpenAnime={openAnime}
        onOpenEntity={openEntity}
        onOpenUser={openPublicUser}
        onOpenTrackers={() => setTrackersOpen(true)}
        onToggleSidebar={() => {
          if (isWatchMode || window.innerWidth < 1024) {
            setDrawerOpen((d) => !d);
          } else {
            setSidebarCollapsed((c) => !c);
          }
        }}
        mediaType={mediaType}
        trackers={libraryState.trackers}
      />

      {!isWatchMode && (
        <Sidebar
          active={tab}
          collapsed={sidebarCollapsed}
          mediaType={mediaType}
          onMediaTypeChange={handleMediaTypeChange}
          libraryState={libraryState}
          onNavigate={navigate}
          onOpenAnime={openAnime}
          onOpenChannel={openChannel}
          onOpenTrackers={() => setTrackersOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          onOpenQuiz={() => setQuizOpen(true)}
          onSpinRoulette={spinRoulette}
          trackers={libraryState.trackers}
          stats={stats}
        />
      )}

      {drawerOpen && (
        <Sidebar
          active={tab}
          collapsed={false}
          overlay
          onClose={() => setDrawerOpen(false)}
          mediaType={mediaType}
          onMediaTypeChange={handleMediaTypeChange}
          libraryState={libraryState}
          onNavigate={navigate}
          onOpenAnime={openAnime}
          onOpenChannel={openChannel}
          onOpenTrackers={() => setTrackersOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          onOpenQuiz={() => setQuizOpen(true)}
          onSpinRoulette={spinRoulette}
          trackers={libraryState.trackers}
          stats={stats}
        />
      )}

      <div className={`pt-14 ${isWatchMode ? 'lg:pl-0' : sidebarCollapsed ? 'lg:pl-[74px]' : 'lg:pl-[236px]'}`}>
        <main>
          <Suspense
            fallback={
              <div className="px-4 py-6 sm:px-6 lg:px-8">
                <GridSkeleton count={8} mediaType={mediaType} />
              </div>
            }
          >
            {detailId ? (
              <DetailView
                animeId={detailId}
                libraryState={libraryState}
                onOpenId={openDetail}
                onOpenChannel={openChannel}
                onOpenEntity={openEntity}
                onSelectGenre={openGenreInExplore}
                onEditProfile={() => setProfileOpen(true)}
                onOpenUser={openPublicUser}
                onClose={closeDetail}
                onQuickAdd={quickAdd}
              />
            ) : channelAnime ? (
              <ChannelView
                seedAnime={channelAnime}
                libraryState={libraryState}
                onOpenAnime={openAnime}
                onOpenChannel={openChannel}
                onSelectGenre={openGenreInExplore}
                onQuickAdd={quickAdd}
                onBack={closeDetail}
              />
            ) : publicUser ? (
              <UserProfileView
                userIdOrHandle={publicUser}
                myLibrary={libraryState}
                onOpenAnime={openDetail}
                onClose={closeDetail}
              />
            ) : entityTarget ? (
              <EntityView
                target={entityTarget}
                onBack={closeDetail}
                onOpenAnimeId={openDetail}
              />
            ) : (
              <>
                {tab === 'home' && (
                  <HomeView
                    library={libraryState}
                    mediaType={mediaType}
                    onMediaTypeChange={handleMediaTypeChange}
                    query={queriesByTab.home}
                    onOpen={openAnime}
                    onOpenChannel={openChannel}
                    onNavigate={navigate}
                    onOpenTrackers={() => setTrackersOpen(true)}
                    onQuickAdd={quickAdd}
                    onOpenQuiz={() => setQuizOpen(true)}
                  />
                )}
                {tab === 'explore' && (
                  <ExploreView
                    library={libraryState}
                    mediaType={mediaType}
                    query={queriesByTab.explore}
                    initialGenre={explorePresetGenre}
                    onConsumeInitialGenre={() => setExplorePresetGenre(null)}
                    onOpen={openAnime}
                    onOpenChannel={openChannel}
                    onQuickAdd={quickAdd}
                  />
                )}
                {tab === 'list' && (
                  <ListView
                    libraryState={libraryState}
                    mediaType={mediaType}
                    query={queriesByTab.list}
                    onOpen={openAnime}
                    onOpenChannel={openChannel}
                    onExplore={() => navigate('explore')}
                  />
                )}
                {tab === 'schedule' && (
                  <ScheduleView
                    libraryState={libraryState}
                    mediaType={mediaType}
                    query={queriesByTab.schedule}
                    onOpen={openAnime}
                    onOpenChannel={openChannel}
                    onQuickAdd={quickAdd}
                  />
                )}
                {tab === 'news' && (
                  <NewsView libraryState={libraryState} query={queriesByTab.news} />
                )}
                {tab === 'feed' && (
                  <FeedView
                    myLibrary={libraryState}
                    onOpenAnime={openDetail}
                    onOpenUser={openPublicUser}
                    onOpenTrackers={() => setTrackersOpen(true)}
                  />
                )}
                {tab === 'you' && (
                  <YouView
                    libraryState={libraryState}
                    mediaType={mediaType}
                    onMediaTypeChange={handleMediaTypeChange}
                    onOpenTrackers={() => setTrackersOpen(true)}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onEditProfile={() => setProfileOpen(true)}
                    onOpenSchedule={() => navigate('schedule')}
                    onOpenNews={() => navigate('news')}
                    onExplore={() => navigate('explore')}
                    onOpenFeed={() => navigate('feed')}
                    onOpenAnime={openDetail}
                    onOpenSyncDiff={() => setSyncDiffOpen(true)}
                    onOpenWrapped={() => setWrappedOpen(true)}
                  />
                )}
              </>
            )}
          </Suspense>
        </main>
      </div>

      <BottomNav active={tab} onNavigate={(t) => { resetScrollChrome(); navigate(t); }} />
      <MiniPlayer onOpenAnimeId={openDetail} />
      <Suspense fallback={null}>
        <InAppBrowserModal />
      </Suspense>
      <ToastHost />

      <Suspense fallback={null}>
        {trackersOpen && (
          <TrackersModal
            isOpen={trackersOpen}
            onClose={() => setTrackersOpen(false)}
            trackers={libraryState.trackers}
            onImported={() => navigate('home')}
            onOpenSyncDiff={() => setSyncDiffOpen(true)}
          />
        )}
        {syncDiffOpen && (
          <SyncConflictModal
            isOpen={syncDiffOpen}
            onClose={() => setSyncDiffOpen(false)}
            libraryState={libraryState}
            trackers={libraryState.trackers}
          />
        )}
        {paletteOpen && (
          <CommandPaletteModal
            isOpen={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            mediaType={mediaType}
            libraryState={libraryState}
            onNavigate={navigate}
            onOpenAnime={openAnime}
            onOpenConflicts={() => setSyncDiffOpen(true)}
            onOpenWrapped={() => setWrappedOpen(true)}
            onOpenQuiz={() => setQuizOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
        {wrappedOpen && (
          <WrappedModal
            isOpen={wrappedOpen}
            onClose={() => setWrappedOpen(false)}
            libraryState={libraryState}
          />
        )}
        {quizOpen && (
          <ThemeQuizModal
            isOpen={quizOpen}
            onClose={() => setQuizOpen(false)}
          />
        )}
        {settingsOpen && (
          <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
        )}
        {profileOpen && (
          <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
        )}
        {notificationsOpen && (
          <NotificationsModal
            isOpen={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
            onOpenAnimeId={openDetail}
            onOpenNewsTab={() => navigate('news')}
          />
        )}
      </Suspense>

      {/* Quick 5-List Subscription Sheet */}
      {quickTarget && (
        <div
          className="fixed inset-0 z-[65] flex items-end justify-center bg-black/85 backdrop-blur-md sm:items-center"
          onClick={() => setQuickTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Subscribe to list"
        >
          <div
            className="w-full max-w-md rounded-t-3xl border border-white/[0.1] bg-[#1F1F1F] p-5 shadow-2xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#121216]">
                {quickTarget.hasOfficialBanner && quickTarget.banner && quickTarget.banner !== quickTarget.cover ? (
                  <img
                    src={quickTarget.banner}
                    alt={quickTarget.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <>
                    <img
                      src={quickTarget.cover}
                      alt=""
                      className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-md"
                    />
                    <div className="absolute inset-0 z-[1] flex items-center justify-center">
                      <img
                        src={quickTarget.cover}
                        alt={quickTarget.title}
                        className="h-full w-auto max-w-[75%] object-contain"
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[14px] font-bold text-white">{quickTarget.title}</p>
                <p className="mt-0.5 text-[11px] text-[#AAAAAA]">
                  {[
                    quickTarget.year,
                    quickTarget.format,
                    quickTarget.episodes ? `${quickTarget.episodes} eps` : null,
                  ]
                    .filter(Boolean)
                    .join(' • ')}
                </p>
                {quickEntry && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded bg-[#FF0000]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#FF0000]">
                    <Bell className="h-3 w-3 fill-current" />
                    Subscribed ({statusLabel(quickEntry.status, quickTarget.mediaType)})
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setQuickTarget(null)}
                aria-label="Close"
                className="rounded-full p-1 text-[#AAAAAA] transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
              Choose list to subscribe
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {LIST_STATUS_ORDER.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => chooseStatus(quickTarget, status)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-[12px] font-semibold transition ${
                    quickEntry?.status === status
                      ? 'border-[#FF0000] bg-[#FF0000]/20 font-bold text-white'
                      : 'border-white/[0.1] bg-[#272727] text-neutral-200 hover:bg-[#383838]'
                  }`}
                >
                  <span>{statusLabel(status, quickTarget.mediaType)}</span>
                  {quickEntry?.status === status && <Check className="h-3.5 w-3.5 text-[#FF0000]" />}
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-3">
              <button
                type="button"
                onClick={() => {
                  openAnime(quickTarget);
                  setQuickTarget(null);
                }}
                className="flex items-center gap-1 text-[12px] font-bold text-white hover:underline"
              >
                <Play className="h-3.5 w-3.5 fill-current text-[#FF0000]" />
                Open Watch Page
              </button>
              {quickEntry && (
                <button
                  type="button"
                  onClick={() => {
                    library.remove(quickTarget.id);
                    setQuickTarget(null);
                    toast('Unsubscribed');
                  }}
                  className="text-[11.5px] font-bold text-rose-400 hover:text-rose-300"
                >
                  Unsubscribe
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
