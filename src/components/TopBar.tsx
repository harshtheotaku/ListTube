import React, { useEffect, useRef, useState } from 'react';
import { Building2, Cloud, Menu, Search, Star, User, Users, X } from 'lucide-react';
import {
  Anime,
  FavoriteCharacterItem,
  MediaType,
  PublicUserSummary,
  StaffSearchItem,
  TrackerAccount,
} from '../types';
import { searchSmart } from '../services/search';
import { searchAniListCharacters, searchAniListStaff } from '../services/anilist';
import { fetchPublicUsers } from '../services/community';
import { useProfile } from '../services/profile';
import { useCloudSync } from '../services/cloudSync';
import { useSettings } from '../services/settings';
import { useChromeVisible } from '../services/scrollChrome';
import { EntityRouteTarget } from './EntityView';
import { ListTubeLogo } from './ListTubeLogo';

type SearchEntityTab = 'all' | 'anime' | 'manga' | 'characters' | 'staff' | 'users';

interface TopBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  onHome: () => void;
  onOpenAnime: (anime: Anime) => void;
  onOpenEntity?: (target: EntityRouteTarget) => void;
  onOpenUser?: (userIdOrHandle: string) => void;
  onOpenTrackers: () => void;
  onToggleSidebar?: () => void;
  mediaType: MediaType;
  trackers: TrackerAccount[];
}

export const TopBar: React.FC<TopBarProps> = ({
  query,
  onQueryChange,
  onSubmit,
  onHome,
  onOpenAnime,
  onOpenEntity,
  onOpenUser,
  onOpenTrackers,
  onToggleSidebar,
  mediaType,
  trackers,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [searchEntity, setSearchEntity] = useState<SearchEntityTab>('all');
  const [suggestions, setSuggestions] = useState<Anime[]>([]);
  const [charResults, setCharResults] = useState<FavoriteCharacterItem[]>([]);
  const [staffResults, setStaffResults] = useState<StaffSearchItem[]>([]);
  const [userResults, setUserResults] = useState<PublicUserSummary[]>([]);
  const [dropdownBusy, setDropdownBusy] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchTicket = useRef(0);
  const profile = useProfile();
  const cloud = useCloudSync();
  const settings = useSettings();
  const chromeVisible = useChromeVisible();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement !== inputRef.current) {
        const target = event.target as HTMLElement | null;
        if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setCharResults([]);
      setStaffResults([]);
      setUserResults([]);
      setDropdownBusy(false);
      return;
    }
    const ticket = ++searchTicket.current;
    setDropdownBusy(true);
    const timer = setTimeout(async () => {
      try {
        const wantMedia = searchEntity === 'all' || searchEntity === 'anime' || searchEntity === 'manga';
        const wantChars = searchEntity === 'all' || searchEntity === 'characters';
        const wantStaff = searchEntity === 'all' || searchEntity === 'staff';
        const wantUsers = searchEntity === 'all' || searchEntity === 'users';

        const targetMediaType: MediaType =
          searchEntity === 'manga' ? 'MANGA' : searchEntity === 'anime' ? 'ANIME' : mediaType;

        const [mediaRes, charRes, staffRes, usersRes] = await Promise.allSettled([
          wantMedia ? searchSmart(trimmed, targetMediaType, searchEntity === 'all' ? 5 : 7) : Promise.resolve([]),
          wantChars ? searchAniListCharacters(trimmed, searchEntity === 'all' ? 2 : 7) : Promise.resolve([]),
          wantStaff ? searchAniListStaff(trimmed, searchEntity === 'all' ? 2 : 7) : Promise.resolve([]),
          wantUsers ? fetchPublicUsers(trimmed, searchEntity === 'all' ? 2 : 7) : Promise.resolve([]),
        ]);

        if (ticket !== searchTicket.current) return;
        setSuggestions(mediaRes.status === 'fulfilled' ? mediaRes.value : []);
        setCharResults(charRes.status === 'fulfilled' ? charRes.value : []);
        setStaffResults(staffRes.status === 'fulfilled' ? staffRes.value : []);
        setUserResults(usersRes.status === 'fulfilled' ? usersRes.value : []);
      } finally {
        if (ticket === searchTicket.current) setDropdownBusy(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, mediaType, searchEntity]);

  const connected = trackers[0];

  const headerShown = chromeVisible || dropdownOpen || Boolean(query.trim());

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        headerShown
          ? 'translate-y-0 opacity-100'
          : '-translate-y-full opacity-0 pointer-events-none'
      } ${
        settings.liquidGlass
          ? 'liquid-glass border-b border-white/[0.15]'
          : 'border-b border-white/[0.08] bg-[#0F0F0F]/95 backdrop-blur-xl'
      }`}
    >
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:gap-3 sm:px-5">
        {/* Left: Three-Line Menu Button + ListTube Logo */}
        <div className="flex shrink-0 items-center gap-2">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Toggle menu"
              className="flex rounded-full p-2 text-white transition hover:bg-[#272727]"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={onHome}
            className="flex shrink-0 items-center focus:outline-none"
            aria-label="ListTube Home"
          >
            <ListTubeLogo />
          </button>
        </div>

        {/* Center: Clean Search Bar with Autocomplete Dropdown */}
        <div ref={dropdownRef} className="relative min-w-0 flex-1 sm:max-w-xl">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setDropdownOpen(false);
              onSubmit();
            }}
            className="flex items-center"
            role="search"
          >
            <div className="relative flex flex-1 items-center">
              <input
                ref={inputRef}
                value={query}
                onFocus={() => setDropdownOpen(true)}
                onChange={(event) => {
                  onQueryChange(event.target.value);
                  setDropdownOpen(true);
                }}
                placeholder={
                  mediaType === 'MANGA'
                    ? 'Search manga (e.g. "vagab", "berserk")…'
                    : 'Search anime (e.g. "shang", "frieren", "aot")…'
                }
                className={`h-9 w-full rounded-l-full border pl-4 pr-8 text-[16px] text-white placeholder:text-[13px] placeholder:text-[#888888] outline-none transition focus:border-[#3EA6FF] lg:text-[13px] ${
                  settings.liquidGlass
                    ? 'border-white/[0.18] bg-white/[0.07]'
                    : 'border-white/[0.15] bg-[#121212]'
                }`}
                aria-label="Search"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    onQueryChange('');
                    setSuggestions([]);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#AAAAAA] hover:bg-white/10 hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              aria-label="Search"
              className={`flex h-9 items-center justify-center rounded-r-full border border-l-0 px-4 text-white transition ${
                settings.liquidGlass
                  ? 'border-white/[0.18] bg-white/[0.12] hover:bg-white/[0.2]'
                  : 'border-white/[0.15] bg-[#222222] hover:bg-[#2F2F2F]'
              }`}
            >
              <Search className="h-4 w-4" />
            </button>
          </form>

          {/* Multi-Entity Live Autocomplete Dropdown */}
          {dropdownOpen && query.trim().length >= 2 && (
            <div className="absolute left-0 right-0 top-11 z-50 max-h-[75vh] overflow-y-auto rounded-2xl border border-white/[0.12] bg-[#212121] py-2 shadow-2xl">
              <div className="mb-1.5 flex items-center gap-1 overflow-x-auto border-b border-white/[0.08] px-3 pb-2 text-[11px] font-bold">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'anime', label: 'Anime' },
                    { id: 'manga', label: 'Manga' },
                    { id: 'characters', label: 'Characters' },
                    { id: 'staff', label: 'Staff & VAs' },
                    { id: 'users', label: 'Users' },
                  ] as { id: SearchEntityTab; label: string }[]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSearchEntity(t.id)}
                    className={`shrink-0 rounded-full px-2.5 py-1 transition ${
                      searchEntity === t.id
                        ? 'bg-[#F1F1F1] text-black'
                        : 'bg-[#2C2C2C] text-[#AAAAAA] hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenAnime(item);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-white/[0.08]"
                >
                  <img
                    src={item.cover}
                    alt=""
                    className="h-11 w-8 shrink-0 rounded object-cover bg-black"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-white">{item.title}</p>
                    <p className="truncate text-[11px] text-[#AAAAAA]">
                      {[item.mediaType === 'MANGA' ? 'Manga' : 'Anime', item.format, item.year, item.studios[0]]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  </div>
                  {item.score ? (
                    <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-amber-300">
                      <Star className="h-3 w-3 fill-current" />
                      {item.score.toFixed(1)}
                    </span>
                  ) : null}
                </button>
              ))}

              {charResults.length > 0 && (
                <div className="mt-1 border-t border-white/[0.06] pt-1">
                  <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-[#888888]">
                    Characters
                  </p>
                  {charResults.map((ch) => (
                    <button
                      key={`ch-${ch.id}`}
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        onOpenEntity?.({ kind: 'character', idOrName: String(ch.id) });
                      }}
                      className="flex w-full items-center gap-3 px-4 py-1.5 text-left transition hover:bg-white/[0.08]"
                    >
                      <img
                        src={ch.image}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full object-cover bg-black"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-white">{ch.name}</p>
                        <p className="truncate text-[10.5px] text-[#AAAAAA]">
                          {ch.mediaTitle || 'Character'}
                        </p>
                      </div>
                      <User className="h-3.5 w-3.5 shrink-0 text-[#3EA6FF]" />
                    </button>
                  ))}
                </div>
              )}

              {staffResults.length > 0 && (
                <div className="mt-1 border-t border-white/[0.06] pt-1">
                  <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-[#888888]">
                    Voice Actors &amp; Staff
                  </p>
                  {staffResults.map((st) => (
                    <button
                      key={`st-${st.id}`}
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        onOpenEntity?.({ kind: 'person', idOrName: String(st.id) });
                      }}
                      className="flex w-full items-center gap-3 px-4 py-1.5 text-left transition hover:bg-white/[0.08]"
                    >
                      {st.image ? (
                        <img
                          src={st.image}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-full object-cover bg-black"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                          <Building2 className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-white">{st.name}</p>
                        <p className="truncate text-[10.5px] text-[#AAAAAA]">
                          {st.primaryOccupations.join(', ') || st.nativeName || 'Staff'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {userResults.length > 0 && (
                <div className="mt-1 border-t border-white/[0.06] pt-1">
                  <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-[#888888]">
                    Community Users
                  </p>
                  {userResults.map((u) => (
                    <button
                      key={`u-${u.id}`}
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        onOpenUser?.(u.handle || u.id);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-1.5 text-left transition hover:bg-white/[0.08]"
                    >
                      <img
                        src={u.avatarUrl || profile.avatarUrl}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full object-cover bg-black"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-white">{u.displayName}</p>
                        <p className="truncate text-[10.5px] text-[#AAAAAA]">{u.handle}</p>
                      </div>
                      <Users className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    </button>
                  ))}
                </div>
              )}

              {dropdownBusy &&
                suggestions.length === 0 &&
                charResults.length === 0 &&
                staffResults.length === 0 &&
                userResults.length === 0 && (
                  <p className="px-4 py-3 text-center text-[12px] text-[#AAAAAA]">Searching…</p>
                )}

              {!dropdownBusy &&
                suggestions.length === 0 &&
                charResults.length === 0 &&
                staffResults.length === 0 &&
                userResults.length === 0 && (
                  <p className="px-4 py-3 text-center text-[12px] text-[#AAAAAA]">
                    No {searchEntity === 'all' ? 'results' : searchEntity} found for &ldquo;{query.trim()}&rdquo;
                  </p>
                )}

              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  onSubmit();
                }}
                className="mt-1 flex w-full items-center justify-center gap-1.5 border-t border-white/[0.08] py-2 text-[12px] font-bold text-[#3EA6FF] hover:bg-white/[0.04]"
              >
                <Search className="h-3.5 w-3.5" />
                See all results for &ldquo;{query.trim()}&rdquo;
              </button>
            </div>
          )}
        </div>

        {/* Minimal Corner Sign In Pill (Only corner control beside search!) */}
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onOpenTrackers}
            aria-label={connected ? `Connected as ${connected.username}` : 'Sign in'}
            className={`lt-press flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12px] font-semibold text-white transition sm:py-1.5 sm:pl-1.5 sm:pr-3 ${
              settings.liquidGlass
                ? 'border-white/[0.18] bg-white/[0.08] backdrop-blur-md hover:bg-white/[0.16]'
                : 'border-white/[0.16] bg-[#222222] hover:bg-[#333333]'
            }`}
          >
            <div className="relative">
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                className="h-6 w-6 rounded-full object-cover"
              />
              {cloud.isLinked && (
                <span
                  title={cloud.userEmail ? `Cloud Sync: ${cloud.userEmail}` : cloud.state}
                  className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#222222] ${
                    cloud.state === 'syncing'
                      ? 'bg-amber-400'
                      : cloud.state === 'error'
                      ? 'bg-rose-400'
                      : 'bg-emerald-400'
                  }`}
                />
              )}
            </div>
            {connected ? (
              <span className="hidden max-w-[90px] truncate sm:block">{connected.username}</span>
            ) : cloud.isLinked ? (
              <span className="hidden items-center gap-1 text-emerald-300 sm:inline-flex">
                <Cloud className="h-3.5 w-3.5" />
                Synced
              </span>
            ) : (
              <span className="text-[11.5px] font-bold text-[#3EA6FF]">Sign In</span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
