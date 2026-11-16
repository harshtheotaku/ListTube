import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { Sidebar, AppTab } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { TopBar } from './components/TopBar';
import { HomeView } from './components/HomeView';
import { ExploreView } from './components/ExploreView';
import { ListView } from './components/ListView';
import { ScheduleView } from './components/ScheduleView';
import { NewsView } from './components/NewsView';
import { YouView } from './components/YouView';
import { DetailView } from './components/DetailView';
import { ChannelView } from './components/ChannelView';
import { TrackersModal } from './components/TrackersModal';
import { SettingsModal } from './components/SettingsModal';
import { ProfileModal } from './components/ProfileModal';
import { ToastHost, toast } from './components/Toast';

const TABS: AppTab[] = ['home', 'explore', 'list', 'schedule', 'news', 'you'];
const MEDIA_TYPE_KEY = 'anitube.mediaType.v1';

const EMPTY_QUERIES: Record<AppTab, string> = {
  home: '',
  explore: '',
  list: '',
  schedule: '',
  news: '',
  you: '',
};

function routeFromHash(): { tab: AppTab; detailId: string | null; channelId: string | null } {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  const tabFromState = window.history.state?.tab as AppTab | undefined;
  const fallback = TABS.includes(tabFromState as AppTab) ? (tabFromState as AppTab) : 'home';

  if (raw.startsWith('anime/')) {
    const id = decodeURIComponent(raw.slice('anime/'.length));
    return { tab: fallback, detailId: id || null, channelId: null };
  }
  if (raw.startsWith('channel/')) {
    const id = decodeURIComponent(raw.slice('channel/'.length));
    return { tab: fallback, detailId: null, channelId: id || null };
  }
  return {
    tab: TABS.includes(raw as AppTab) ? (raw as AppTab) : fallback,
    detailId: null,
    channelId: null,
  };
}

export const App: React.FC = () => {
  const libraryState = useLibrary();
  const [initialRoute] = useState(routeFromHash);
  const [tab, setTab] = useState<AppTab>(initialRoute.tab);
  const [detailId, setDetailId] = useState<string | null>(initialRoute.detailId);
  const [channelAnime, setChannelAnime] = useState<Anime | null>(() =>
    initialRoute.channelId ? animeStore.get(initialRoute.channelId) ?? null : null
  );
  const [mediaType, setMediaType] = useState<MediaType>(() => {
    if (window.location.hash.includes('mode=manga')) return 'MANGA';
    if (window.location.hash.includes('mode=anime')) return 'ANIME';
    return localStorage.getItem(MEDIA_TYPE_KEY) === 'MANGA' ? 'MANGA' : 'ANIME';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [queriesByTab, setQueriesByTab] = useState<Record<AppTab, string>>(EMPTY_QUERIES);
  const [trackersOpen, setTrackersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickTarget, setQuickTarget] = useState<Anime | null>(null);

  type NavSnapshot = { tab: AppTab; detailId: string | null; channelAnime: Anime | null };
  const navStackRef = useRef<NavSnapshot[]>([]);
  const routeRef = useRef<NavSnapshot>({
    tab: initialRoute.tab,
    detailId: initialRoute.detailId,
    channelAnime: initialRoute.channelId ? animeStore.get(initialRoute.channelId) ?? null : null,
  });
  routeRef.current = { tab, detailId, channelAnime };

  const modalRef = useRef({ quickTarget, settingsOpen, trackersOpen, profileOpen });
  modalRef.current = { quickTarget, settingsOpen, trackersOpen, profileOpen };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

  const syncHashReplace = (snap: NavSnapshot) => {
    const hash = snap.detailId
      ? `#/anime/${encodeURIComponent(snap.detailId)}`
      : snap.channelAnime
        ? `#/channel/${encodeURIComponent(snap.channelAnime.id)}`
        : `#/${snap.tab}`;
    window.history.replaceState(
      { tab: snap.tab, detail: snap.detailId ?? undefined, channel: snap.channelAnime?.id ?? undefined },
      '',
      hash
    );
  };

  const pushSnapshot = (snap: NavSnapshot) => {
    const top = navStackRef.current[navStackRef.current.length - 1];
    if (
      top &&
      top.tab === snap.tab &&
      top.detailId === snap.detailId &&
      top.channelAnime?.id === snap.channelAnime?.id
    ) {
      return;
    }
    navStackRef.current.push(snap);
    if (navStackRef.current.length > 50) navStackRef.current.shift();
  };

  const goBackStep = (): boolean => {
    const { quickTarget: qt, settingsOpen: so, trackersOpen: to, profileOpen: po } = modalRef.current;
    if (qt) {
      setQuickTarget(null);
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

    const prev = navStackRef.current.pop();
    if (prev) {
      setTab(prev.tab);
      setDetailId(prev.detailId);
      setChannelAnime(prev.channelAnime);
      syncHashReplace(prev);
      scrollTop();
      return true;
    }

    const curr = routeRef.current;
    if (curr.detailId || curr.channelAnime) {
      const next: NavSnapshot = { tab: curr.tab, detailId: null, channelAnime: null };
      setDetailId(null);
      setChannelAnime(null);
      syncHashReplace(next);
      scrollTop();
      return true;
    }

    if (curr.tab !== 'home') {
      const next: NavSnapshot = { tab: 'home', detailId: null, channelAnime: null };
      setTab('home');
      syncHashReplace(next);
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
    navStackRef.current = [];
    setQueriesByTab(EMPTY_QUERIES);
    scrollTop();
  };

  useEffect(() => {
    window.history.replaceState(
      { tab: initialRoute.tab },
      '',
      initialRoute.detailId
        ? `#/anime/${encodeURIComponent(initialRoute.detailId)}`
        : initialRoute.channelId
          ? `#/channel/${encodeURIComponent(initialRoute.channelId)}`
          : `#/${initialRoute.tab}`
    );
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
    if (detailId === id) return;
    pushSnapshot(routeRef.current);
    const state = { tab, detail: id };
    window.history.pushState(state, '', `#/anime/${encodeURIComponent(id)}`);
    setChannelAnime(null);
    setDetailId(id);
    scrollTop();
  };

  const openAnime = (anime: Anime) => {
    animeStore.remember(anime);
    openDetail(anime.id);
  };

  const openChannel = (anime: Anime) => {
    animeStore.remember(anime);
    if (!detailId && channelAnime?.id === anime.id) return;
    pushSnapshot(routeRef.current);
    const state = { tab, channel: anime.id };
    window.history.pushState(state, '', `#/channel/${encodeURIComponent(anime.id)}`);
    setDetailId(null);
    setChannelAnime(anime);
    scrollTop();
  };

  const closeDetail = () => {
    goBackStep();
  };

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const state = event.state as { tab?: AppTab; detail?: string; channel?: string } | null;
      navStackRef.current.pop();
      if (state?.detail) {
        setTab(state.tab ?? 'home');
        setChannelAnime(null);
        setDetailId(state.detail);
      } else if (state?.channel) {
        setTab(state.tab ?? 'home');
        setDetailId(null);
        setChannelAnime(animeStore.get(state.channel) ?? null);
      } else {
        setDetailId(null);
        setChannelAnime(null);
        if (state?.tab) setTab(state.tab);
      }
      scrollTop();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (next: AppTab) => {
    const curr = routeRef.current;
    if (curr.tab !== next || curr.detailId || curr.channelAnime) {
      pushSnapshot(curr);
    }
    setTab(next);
    setDetailId(null);
    setChannelAnime(null);
    const state = { tab: next };
    if (window.history.state?.tab === next && !window.history.state?.detail && !window.history.state?.channel) {
      window.history.replaceState(state, '', `#/${next}`);
    } else {
      window.history.pushState(state, '', `#/${next}`);
    }
    scrollTop();
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
  const activeSearchKey: AppTab = detailId || channelAnime ? 'explore' : tab;
  const activeQuery = queriesByTab[activeSearchKey];

  const handleQueryChange = (val: string) => {
    setQueriesByTab((prev) => ({ ...prev, [activeSearchKey]: val }));
  };

  const handleSearchSubmit = () => {
    if (detailId || channelAnime) {
      navigate('explore');
      return;
    }
    if (tab === 'you') {
      const q = queriesByTab.you;
      setQueriesByTab((prev) => ({ ...prev, explore: q }));
      navigate('explore');
    }
  };

  return (
    <div className="min-h-screen w-full overflow-x-clip bg-[#0F0F0F] text-[#F1F1F1]">
      <TopBar
        query={activeQuery}
        onQueryChange={handleQueryChange}
        onSubmit={handleSearchSubmit}
        onHome={() => navigate('home')}
        onOpenAnime={openAnime}
        onOpenTrackers={() => setTrackersOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        mediaType={mediaType}
        onMediaTypeChange={handleMediaTypeChange}
        trackers={libraryState.trackers}
      />

      <Sidebar
        active={tab}
        collapsed={sidebarCollapsed}
        mediaType={mediaType}
        libraryState={libraryState}
        onNavigate={navigate}
        onOpenAnime={openAnime}
        onOpenChannel={openChannel}
        onOpenTrackers={() => setTrackersOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        trackers={libraryState.trackers}
        stats={stats}
      />

      <div className={sidebarCollapsed ? 'lg:pl-[74px]' : 'lg:pl-[236px]'}>
        <main>
          {detailId ? (
            <DetailView
              animeId={detailId}
              libraryState={libraryState}
              onOpenId={openDetail}
              onOpenChannel={openChannel}
              onEditProfile={() => setProfileOpen(true)}
              onClose={closeDetail}
              onQuickAdd={quickAdd}
            />
          ) : channelAnime ? (
            <ChannelView
              seedAnime={channelAnime}
              libraryState={libraryState}
              onOpenAnime={openAnime}
              onOpenChannel={openChannel}
              onQuickAdd={quickAdd}
              onBack={closeDetail}
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
                />
              )}
              {tab === 'explore' && (
                <ExploreView
                  library={libraryState}
                  mediaType={mediaType}
                  query={queriesByTab.explore}
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
                  query={queriesByTab.schedule}
                  onOpen={openAnime}
                  onOpenChannel={openChannel}
                  onQuickAdd={quickAdd}
                />
              )}
              {tab === 'news' && (
                <NewsView libraryState={libraryState} query={queriesByTab.news} />
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
                />
              )}
            </>
          )}
        </main>
      </div>

      <BottomNav active={tab} onNavigate={navigate} />
      <ToastHost />

      <TrackersModal
        isOpen={trackersOpen}
        onClose={() => setTrackersOpen(false)}
        trackers={libraryState.trackers}
        onImported={() => navigate('home')}
      />

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />

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
