import React, { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Compass,
  Home,
  Newspaper,
  Settings,
  Sparkles,
  Tv,
  User,
} from 'lucide-react';
import { Anime, LibraryState, MediaType, TrackerAccount } from '../types';
import { animeStore } from '../services/animeStore';

export type AppTab = 'home' | 'explore' | 'list' | 'schedule' | 'news' | 'you';

interface SidebarProps {
  active: AppTab;
  collapsed: boolean;
  mediaType: MediaType;
  libraryState: LibraryState;
  onNavigate: (tab: AppTab) => void;
  onOpenAnime: (anime: Anime) => void;
  onOpenTrackers: () => void;
  onOpenSettings: () => void;
  trackers: TrackerAccount[];
  stats: { tracked: number; watching: number };
}

export const Sidebar: React.FC<SidebarProps> = ({
  active,
  collapsed,
  mediaType,
  libraryState,
  onNavigate,
  onOpenAnime,
  onOpenTrackers,
  onOpenSettings,
  trackers,
  stats,
}) => {
  const [showAllSubs, setShowAllSubs] = useState(false);

  const subscribedItems = useMemo(() => {
    return Object.values(libraryState.entries)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((entry) => animeStore.get(entry.animeId))
      .filter((anime): anime is Anime => Boolean(anime))
      .filter((anime) => (anime.mediaType ?? 'ANIME') === mediaType);
  }, [libraryState.entries, mediaType]);

  const displayedSubs = showAllSubs ? subscribedItems : subscribedItems.slice(0, 6);

  if (collapsed) {
    const miniNav: { id: AppTab; label: string; icon: React.ElementType }[] = [
      { id: 'home', label: 'Home', icon: Home },
      { id: 'explore', label: 'Explore', icon: Compass },
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

  return (
    <aside className="fixed bottom-0 left-0 top-14 z-30 hidden w-[236px] flex-col overflow-y-auto border-r border-white/[0.06] bg-[#0F0F0F] px-3 py-3 lg:flex">
      {/* Primary YouTube Feed Links */}
      <nav className="space-y-0.5">
        <SidebarItem
          icon={Home}
          label="Home"
          active={active === 'home'}
          onClick={() => onNavigate('home')}
        />
        <SidebarItem
          icon={Compass}
          label="Explore"
          active={active === 'explore'}
          onClick={() => onNavigate('explore')}
        />
      </nav>

      <div className="my-3 border-t border-white/[0.08]" />

      {/* Live Hub: Schedule & News */}
      <div className="space-y-0.5">
        <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
          Live Hub
        </p>
        <SidebarItem
          icon={Calendar}
          label="Airing Schedule"
          active={active === 'schedule'}
          onClick={() => onNavigate('schedule')}
        />
        <SidebarItem
          icon={Newspaper}
          label="Anime & Manga News"
          active={active === 'news'}
          onClick={() => onNavigate('news')}
        />
      </div>

      <div className="my-3 border-t border-white/[0.08]" />

      {/* YouTube Subscriptions Section */}
      <div>
        <button
          type="button"
          onClick={() => onNavigate('list')}
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
            {displayedSubs.map((anime) => (
              <button
                key={anime.id}
                type="button"
                onClick={() => onOpenAnime(anime)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] font-medium text-[#F1F1F1] transition hover:bg-white/[0.06]"
              >
                <img
                  src={anime.cover}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded-full object-cover"
                />
                <span className="min-w-0 flex-1 truncate">{anime.title}</span>
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
          onClick={() => onNavigate('you')}
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
            onClick={() => onNavigate('list')}
          />
          <SidebarItem
            icon={User}
            label="Taste DNA & Stats"
            active={active === 'you'}
            onClick={() => onNavigate('you')}
          />
          <SidebarItem
            icon={Sparkles}
            label={trackers.length ? 'Sync AniList / MAL' : 'Connect Trackers'}
            active={false}
            onClick={onOpenTrackers}
          />
          <SidebarItem
            icon={Settings}
            label="Settings"
            active={false}
            onClick={onOpenSettings}
          />
        </div>
      </div>

      <div className="mt-auto px-3 pt-6 text-[10.5px] leading-relaxed text-[#717171]">
        <p>Powered by AniList &amp; MyAnimeList</p>
        <p>Offline-first • Zero forced login</p>
      </div>
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

const SidebarItem: React.FC<SidebarItemProps> = ({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={`flex w-full items-center gap-4 rounded-xl px-3 py-2.5 text-[13.5px] transition ${
      active
        ? 'bg-[#272727] font-semibold text-white'
        : 'font-medium text-[#F1F1F1] hover:bg-white/[0.06]'
    }`}
  >
    <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-[#FF0000]' : 'text-white'}`} />
    <span className="truncate">{label}</span>
    {badge !== undefined && (
      <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-[#AAAAAA]">
        {badge}
      </span>
    )}
  </button>
);
