import React, { useMemo, useState } from 'react';
import {
  Bell,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronRight,
  Compass,
  Film,
  Home,
  Menu,
  Newspaper,
  Settings,
  Sparkles,
  Tv,
  User,
  Users,
} from 'lucide-react';
import { Anime, LibraryState, MediaType, TrackerAccount } from '../types';
import { animeStore } from '../services/animeStore';
import { franchiseNameOf } from '../services/franchise';
import { useNotifications } from '../services/notifications';
import { ListTubeLogo } from './ListTubeLogo';

export type AppTab = 'home' | 'explore' | 'list' | 'schedule' | 'news' | 'feed' | 'you';

interface SidebarProps {
  active: AppTab;
  collapsed: boolean;
  overlay?: boolean;
  onClose?: () => void;
  mediaType: MediaType;
  onMediaTypeChange?: (type: MediaType) => void;
  libraryState: LibraryState;
  onNavigate: (tab: AppTab) => void;
  onOpenAnime: (anime: Anime) => void;
  onOpenChannel: (anime: Anime) => void;
  onOpenTrackers: () => void;
  onOpenSettings: () => void;
  onOpenNotifications?: () => void;
  trackers: TrackerAccount[];
  stats: { tracked: number; watching: number };
}

export const Sidebar: React.FC<SidebarProps> = ({
  active,
  collapsed,
  overlay = false,
  onClose,
  mediaType,
  onMediaTypeChange,
  libraryState,
  onNavigate,
  onOpenChannel,
  onOpenTrackers,
  onOpenSettings,
  onOpenNotifications,
  trackers,
  stats,
}) => {
  const [showAllSubs, setShowAllSubs] = useState(false);
  const { unreadCount } = useNotifications();

  const subscribedItems = useMemo(() => {
    const seen = new Set<string>();
    const list = Object.values(libraryState.entries)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((entry) => animeStore.get(entry.animeId))
      .filter((anime): anime is Anime => Boolean(anime))
      .filter((anime) => (anime.mediaType ?? 'ANIME') === mediaType);
    const out: { anime: Anime; channelName: string }[] = [];
    for (const anime of list) {
      const channelName = franchiseNameOf(anime.title);
      const key = channelName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ anime, channelName });
    }
    return out;
  }, [libraryState.entries, mediaType]);

  const displayedSubs = showAllSubs ? subscribedItems : subscribedItems.slice(0, 6);

  if (!overlay && collapsed) {
    const miniNav: { id: AppTab; label: string; icon: React.ElementType }[] = [
      { id: 'home', label: 'Home', icon: Home },
      { id: 'explore', label: 'Explore', icon: Compass },
      { id: 'feed', label: 'Feed', icon: Users },
      { id: 'schedule', label: 'Schedule', icon: Calendar },
      { id: 'news', label: 'News', icon: Newspaper },
      { id: 'list', label: 'Subs', icon: Tv },
      { id: 'you', label: 'You', icon: User },
    ];

    return (
      <aside className="fixed bottom-0 left-0 top-14 z-30 hidden w-[74px] flex-col items-center gap-1 border-r border-white/[0.06] bg-[#0F0F0F] px-1.5 py-3 lg:flex">
        {miniNav.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex w-full flex-col items-center gap-1 rounded-xl py-3 text-[10px] font-medium transition ${
                isActive ? 'bg-[#272727] text-white' : 'text-[#AAAAAA] hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'text-[#FF0000]' : ''}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </aside>
    );
  }

  const handleNav = (t: AppTab) => {
    onNavigate(t);
    onClose?.();
  };

  const navBody = (
    <>
      {overlay && (
        <div className="mb-3 flex h-11 items-center gap-2 px-1">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="rounded-full p-2 text-white transition hover:bg-[#272727]"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => handleNav('home')}
            className="flex items-center focus:outline-none"
          >
            <ListTubeLogo />
          </button>
        </div>
      )}

      {/* Compact Mode Toggle moved into Sidebar */}
      {onMediaTypeChange && (
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-white/[0.08] bg-[#181818] p-1">
          <button
            type="button"
            onClick={() => onMediaTypeChange('ANIME')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11.5px] font-bold transition ${
              mediaType === 'ANIME' ? 'bg-[#FF0000] text-white' : 'text-[#AAAAAA] hover:text-white'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            <span>Anime</span>
          </button>
          <button
            type="button"
            onClick={() => onMediaTypeChange('MANGA')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11.5px] font-bold transition ${
              mediaType === 'MANGA' ? 'bg-[#FF0000] text-white' : 'text-[#AAAAAA] hover:text-white'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Manga</span>
          </button>
        </div>
      )}

      {/* Primary YouTube Feed Links */}
      <nav className="space-y-0.5">
        <SidebarItem
          icon={Home}
          label="Home"
          active={active === 'home'}
          onClick={() => handleNav('home')}
        />
        <SidebarItem
          icon={Compass}
          label="Explore"
          active={active === 'explore'}
          onClick={() => handleNav('explore')}
        />
      </nav>

      <div className="my-3 border-t border-white/[0.08]" />

      {/* Live Hub: Feed, Schedule, News & Notifications */}
      <div className="space-y-0.5">
        <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
          Community &amp; Live Hub
        </p>
        <SidebarItem
          icon={Users}
          label="Activity & People"
          active={active === 'feed'}
          onClick={() => handleNav('feed')}
        />
        <SidebarItem
          icon={Calendar}
          label="Airing Schedule"
          active={active === 'schedule'}
          onClick={() => handleNav('schedule')}
        />
        <SidebarItem
          icon={Newspaper}
          label="Anime & Manga News"
          active={active === 'news'}
          onClick={() => handleNav('news')}
        />
        {onOpenNotifications && (
          <SidebarItem
            icon={Bell}
            label="Notifications"
            badge={unreadCount > 0 ? unreadCount : undefined}
            active={false}
            onClick={() => {
              onClose?.();
              onOpenNotifications();
            }}
          />
        )}
      </div>

      <div className="my-3 border-t border-white/[0.08]" />

      {/* YouTube Subscriptions Section */}
      <div>
        <button
          type="button"
          onClick={() => handleNav('list')}
          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-[14px] font-bold text-white transition hover:bg-white/[0.06]"
        >
          <span>Subscriptions</span>
          <ChevronRight className="h-4 w-4 text-[#AAAAAA]" />
        </button>

        {subscribedItems.length === 0 ? (
          <p className="px-3 py-2 text-[11.5px] leading-relaxed text-[#AAAAAA]">
            Subscribe to {mediaType === 'MANGA' ? 'manga' : 'anime'} to see channels here.
          </p>
        ) : (
          <div className="mt-1 space-y-0.5">
            {displayedSubs.map(({ anime, channelName }) => (
              <button
                key={anime.id}
                type="button"
                onClick={() => {
                  onOpenChannel(anime);
                  onClose?.();
                }}
                title={`Open ${channelName} channel`}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] font-medium text-[#F1F1F1] transition hover:bg-white/[0.06]"
              >
                <img
                  src={anime.cover}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded-full object-cover"
                />
                <span className="min-w-0 flex-1 truncate">{channelName}</span>
                {anime.status === 'Airing' || anime.status === 'Publishing' ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#3EA6FF]" title="Ongoing" />
                ) : null}
              </button>
            ))}

            {subscribedItems.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllSubs(!showAllSubs)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[12.5px] font-medium text-[#AAAAAA] transition hover:bg-white/[0.06] hover:text-white"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showAllSubs ? 'rotate-180' : ''}`}
                />
                <span>{showAllSubs ? 'Show less' : `Show ${subscribedItems.length - 6} more`}</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="my-3 border-t border-white/[0.08]" />

      {/* You & Controls Section */}
      <div>
        <button
          type="button"
          onClick={() => handleNav('you')}
          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-[14px] font-bold text-white transition hover:bg-white/[0.06]"
        >
          <span>You</span>
          <ChevronRight className="h-4 w-4 text-[#AAAAAA]" />
        </button>

        <div className="mt-1 space-y-0.5">
          <SidebarItem
            icon={Tv}
            label={mediaType === 'MANGA' ? 'Reading Lists' : 'All Watchlists'}
            badge={stats.tracked > 0 ? stats.tracked : undefined}
            active={active === 'list'}
            onClick={() => handleNav('list')}
          />
          <SidebarItem
            icon={User}
            label="Taste DNA & Stats"
            active={active === 'you'}
            onClick={() => handleNav('you')}
          />
          <SidebarItem
            icon={Sparkles}
            label={trackers.length ? 'Sync AniList / MAL' : 'Connect Trackers'}
            active={false}
            onClick={() => {
              onClose?.();
              onOpenTrackers();
            }}
          />
          <SidebarItem
            icon={Settings}
            label="Settings"
            active={false}
            onClick={() => {
              onClose?.();
              onOpenSettings();
            }}
          />
        </div>
      </div>

      <div className="mt-auto px-3 pt-6 text-[10.5px] leading-relaxed text-[#717171]">
        <p>Powered by AniList &amp; MyAnimeList</p>
        <p>Offline-first • Sync anywhere</p>
      </div>
    </>
  );

  if (overlay) {
    return (
      <div
        className="fixed inset-0 z-[80] flex bg-black/65 backdrop-blur-xs"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        <aside className="flex h-full w-[248px] flex-col overflow-y-auto border-r border-white/[0.1] bg-[#0F0F0F] px-3 py-2 shadow-2xl">
          {navBody}
        </aside>
      </div>
    );
  }

  return (
    <aside className="fixed bottom-0 left-0 top-14 z-30 hidden w-[236px] flex-col overflow-y-auto border-r border-white/[0.06] bg-[#0F0F0F] px-3 py-3 lg:flex">
      {navBody}
    </aside>
  );
};

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon: Icon, label, active, badge, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-4 rounded-xl px-3 py-2 text-[13.5px] font-medium transition ${
      active
        ? 'bg-[#272727] font-semibold text-white'
        : 'text-[#F1F1F1] hover:bg-white/[0.06]'
    }`}
  >
    <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-[#FF0000]' : ''}`} />
    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
    {badge !== undefined && badge > 0 && (
      <span className="rounded-full bg-[#FF0000] px-2 py-0.5 text-[10px] font-bold text-white">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);
