import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Film, Menu, Search, Settings, Star, User, X } from 'lucide-react';
import { Anime, MediaType, TrackerAccount } from '../types';
import { searchSmart } from '../services/search';
import { useProfile } from '../services/profile';
import { AniTubeLogo } from './AniTubeLogo';

interface TopBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  onHome: () => void;
  onOpenAnime: (anime: Anime) => void;
  onOpenTrackers: () => void;
  onOpenSettings: () => void;
  onToggleSidebar?: () => void;
  mediaType: MediaType;
  onMediaTypeChange: (type: MediaType) => void;
  trackers: TrackerAccount[];
}

export const TopBar: React.FC<TopBarProps> = ({
  query,
  onQueryChange,
  onSubmit,
  onHome,
  onOpenAnime,
  onOpenTrackers,
  onOpenSettings,
  onToggleSidebar,
  mediaType,
  onMediaTypeChange,
  trackers,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<Anime[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchTicket = useRef(0);
  const profile = useProfile();

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
      return;
    }
    const ticket = ++searchTicket.current;
    const timer = setTimeout(() => {
      searchSmart(trimmed, mediaType, 7)
        .then((res) => {
          if (ticket === searchTicket.current) {
            setSuggestions(res);
          }
        })
        .catch(() => {});
    }, 180);
    return () => clearTimeout(timer);
  }, [query, mediaType]);

  const connected = trackers[0];

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0F0F0F]/95 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:gap-3 sm:px-5">
        {/* Left: Hamburger Menu + YouTube-Style AniTube Logo */}
        <div className="flex shrink-0 items-center gap-2">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Toggle menu"
              className="hidden rounded-full p-2 text-white transition hover:bg-[#272727] lg:flex"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={onHome}
            className="flex shrink-0 items-center focus:outline-none"
            aria-label="AniTube Home"
          >
            <AniTubeLogo />
          </button>
        </div>

        {/* Center: Smart YouTube Search Bar with Instant Autocomplete Dropdown */}
        <div ref={dropdownRef} className="relative min-w-0 flex-1 lg:max-w-xl">
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
                className="h-9 w-full rounded-l-full border border-white/[0.15] bg-[#121212] pl-4 pr-8 text-[16px] text-white placeholder:text-[13px] placeholder:text-[#888888] outline-none transition focus:border-[#3EA6FF] lg:text-[13px]"
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
              className="flex h-9 items-center justify-center rounded-r-full border border-l-0 border-white/[0.15] bg-[#222222] px-4 text-white transition hover:bg-[#2F2F2F]"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>

          {/* Live Fuzzy Autocomplete Dropdown */}
          {dropdownOpen && query.trim().length >= 2 && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-2xl border border-white/[0.12] bg-[#212121] py-2 shadow-2xl">
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
                      {[item.format, item.year, item.studios[0]].filter(Boolean).join(' • ')}
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

        {/* Right (Desktop only): Anime | Manga Switch + Settings + Corner Connect.
            On mobile (< lg), these live inside the You tab so Logo + Search Bar use the full top bar width. */}
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          {/* Anime / Manga Mode Switcher */}
          <div
            className="flex items-center rounded-full border border-white/[0.12] bg-[#1A1A1A] p-0.5"
            role="group"
            aria-label="Media Mode"
          >
            <button
              type="button"
              onClick={() => onMediaTypeChange('ANIME')}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                mediaType === 'ANIME'
                  ? 'bg-[#FF0000] text-white shadow'
                  : 'text-[#AAAAAA] hover:text-white'
              }`}
            >
              <Film className="h-3 w-3" />
              <span className="hidden md:inline">Anime</span>
            </button>
            <button
              type="button"
              onClick={() => onMediaTypeChange('MANGA')}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                mediaType === 'MANGA'
                  ? 'bg-[#FF0000] text-white shadow'
                  : 'text-[#AAAAAA] hover:text-white'
              }`}
            >
              <BookOpen className="h-3 w-3" />
              <span className="hidden md:inline">Manga</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            title="AniTube Settings"
            className="rounded-full p-2 text-[#AAAAAA] transition hover:bg-[#272727] hover:text-white"
          >
            <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>

          {/* Non-Intrusive Corner Login / Tracker Connect Button */}
          <button
            type="button"
            onClick={onOpenTrackers}
            aria-label={connected ? `Connected as ${connected.username}` : 'Connect AniList or MyAnimeList'}
            className="flex items-center gap-2 rounded-full border border-white/[0.16] bg-[#272727] py-1.5 pl-2 pr-3 text-[12px] font-semibold text-white transition hover:bg-[#383838]"
          >
            {connected ? (
              <>
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="h-5 w-5 rounded-full object-cover"
                />
                <span className="hidden max-w-[95px] truncate sm:block">{connected.username}</span>
              </>
            ) : (
              <>
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="h-5 w-5 rounded-full object-cover"
                />
                <span className="hidden text-[#3EA6FF] sm:inline">Connect</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
