import React, { useState } from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  Contrast,
  Droplets,
  Eye,
  Gauge,
  Layout,
  Palette,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import {
  ContentFilterLevel,
  ExternalLinkMode,
  FontStylePreset,
  ListStatus,
  statusLabel,
  ThemePreset,
} from '../types';
import { animeStore } from '../services/animeStore';
import { SCORE_FORMATS } from '../services/scoring';
import { settingsStore, useSettings } from '../services/settings';
import { toast } from './Toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsSection = 'appearance' | 'home' | 'content' | 'privacy' | 'playback';

const ACCENT_SWATCHES: { bg: string; text: string; accent: string; name: string }[] = [
  { bg: '#0F0F0F', text: '#F1F1F1', accent: '#FF0000', name: 'Crimson Obsidian' },
  { bg: '#000000', text: '#FFFFFF', accent: '#FF9F43', name: 'AMOLED Amber' },
  { bg: '#0A0D14', text: '#F2F5FA', accent: '#3EA6FF', name: 'Apple Cobalt' },
  { bg: '#091112', text: '#ECFAF8', accent: '#10B981', name: 'Jade Glass' },
  { bg: '#100C18', text: '#F6F2FF', accent: '#A855F7', name: 'Amethyst' },
  { bg: '#120C0F', text: '#FFF2F6', accent: '#FB7185', name: 'Sakura Rose' },
  { bg: '#0B1218', text: '#F0F8FF', accent: '#38BDF8', name: 'Glacier Sky' },
  { bg: '#14110B', text: '#FAF6ED', accent: '#F59E0B', name: 'Solar Gold' },
  { bg: '#0F1310', text: '#F2FAF4', accent: '#22C55E', name: 'Emerald' },
  { bg: '#F4F4F7', text: '#111115', accent: '#FF0000', name: 'Daylight Crimson' },
  { bg: '#F4F4F7', text: '#111115', accent: '#007AFF', name: 'Daylight Blue' },
  { bg: '#111113', text: '#F5F5F7', accent: '#FFFFFF', name: 'Monochrome' },
];

const ALL_STATUSES: ListStatus[] = ['watching', 'completed', 'on_hold', 'planned', 'dropped'];
const BLOCKABLE_GENRES = [
  'Ecchi',
  'Harem',
  'Horror',
  'Mecha',
  'Sports',
  'Mahou Shoujo',
  'Slice of Life',
  'Music',
  'Psychological',
  'Romance',
];

const AppleSwitch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors ${
      checked ? 'bg-emerald-500' : 'bg-white/20'
    }`}
  >
    <span
      className={`block h-[22px] w-[22px] translate-y-[2px] rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
      }`}
    />
  </button>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const settings = useSettings();
  const [section, setSection] = useState<SettingsSection>('appearance');

  if (!isOpen) return null;

  return (
    <div
      className="lt-backdrop-in fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="liquid-glass lt-sheet-up flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-[30px] border border-white/[0.16] text-white sm:rounded-[28px]">
        {/* Header + Category Bar */}
        <div className="border-b border-white/[0.08] px-5 pb-3 pt-3">
          <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-white/25 sm:hidden" />
          <div className="flex items-center justify-between">
            <div>
              <h2 id="settings-title" className="text-[20px] font-extrabold tracking-tight text-white">
                Settings
              </h2>
              <p className="text-[11px] text-[#AAAAAA]">
                Saved automatically on device · Synced when signed in
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="lt-press flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.1] text-[#CCCCCC] hover:bg-white/[0.2] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {(
              [
                { id: 'appearance', label: 'Themes & Glass', icon: Palette },
                { id: 'home', label: 'Home & Feeds', icon: Layout },
                { id: 'content', label: 'Content Filter', icon: Shield },
                { id: 'privacy', label: 'Privacy & Alerts', icon: Eye },
                { id: 'playback', label: 'Playback & Data', icon: Play },
              ] as { id: SettingsSection; label: string; icon: React.ElementType }[]
            ).map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`lt-press inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold ${
                    active
                      ? 'bg-white text-black shadow'
                      : 'bg-white/[0.07] text-[#CCCCCC] hover:bg-white/[0.14] hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {section === 'appearance' && (
            <>
              {/* BitChord-inspired Apple Grouped Appearance Card */}
              <div className="divide-y divide-white/[0.07] overflow-hidden rounded-[22px] border border-white/[0.09] bg-white/[0.04]">
                {/* Theme Segmented Control Row */}
                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2.5 text-[14px] font-semibold text-white">
                      <Palette className="h-4 w-4 text-[#AAAAAA]" />
                      Theme
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        settingsStore.resetTheme();
                        toast('Theme colors reset');
                      }}
                      className="text-[11px] font-semibold text-[#3EA6FF] hover:underline"
                    >
                      Reset colors
                    </button>
                  </div>
                  <div className="grid grid-cols-4 rounded-full bg-black/35 p-1 ring-1 ring-white/[0.07]">
                    {(
                      [
                        { id: 'main', label: 'Obsidian' },
                        { id: 'dark', label: 'OLED' },
                        { id: 'light', label: 'Daylight' },
                        { id: 'custom', label: 'Custom' },
                      ] as { id: ThemePreset; label: string }[]
                    ).map((p) => {
                      const active = settings.themePreset === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => settingsStore.setThemePreset(p.id)}
                          className={`lt-press rounded-full py-1.5 text-[12px] font-semibold ${
                            active
                              ? 'bg-white/[0.2] text-white shadow'
                              : 'text-[#9E9EA7] hover:text-white'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Font Style Row */}
                {(() => {
                  const fonts: { id: FontStylePreset; label: string; desc: string }[] = [
                    { id: 'default', label: 'Default', desc: 'SF Pro Display · Apple weights' },
                    { id: 'rounded', label: 'Rounded', desc: 'Soft SF Pro Rounded feel' },
                    { id: 'serif', label: 'Editorial', desc: 'Crisp serif magazine contrast' },
                    { id: 'mono', label: 'Studio Mono', desc: 'Technical monospace rhythm' },
                  ];
                  const cur = fonts.find((f) => f.id === settings.fontFamily) ?? fonts[0];
                  const next = fonts[(fonts.findIndex((f) => f.id === cur.id) + 1) % fonts.length];
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        settingsStore.update({ fontFamily: next.id });
                        toast(`Font changed to ${next.label}`);
                      }}
                      className="lt-press flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03]"
                    >
                      <div className="flex items-start gap-3">
                        <Type className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#CCCCCC]" />
                        <div>
                          <p className="text-[13.5px] font-semibold text-white">Font</p>
                          <p className="text-[11.5px] text-[#8E8E93]">{cur.desc}</p>
                        </div>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-[#AAAAAA]">
                        {cur.label}
                        <ChevronRight className="h-4 w-4 text-[#77777A]" />
                      </span>
                    </button>
                  );
                })()}

                {/* Reduce Animation */}
                <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <Gauge className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#CCCCCC]" />
                    <div>
                      <p className="text-[13.5px] font-semibold text-white">Reduce animation</p>
                      <p className="text-[11.5px] text-[#8E8E93]">
                        Freezes drifting spotlights and spring motion transitions
                      </p>
                    </div>
                  </div>
                  <AppleSwitch
                    label="Reduce animation"
                    checked={settings.reduceMotion}
                    onChange={(v) => settingsStore.update({ reduceMotion: v })}
                  />
                </div>

                {/* Reduce Dynamic Blur */}
                <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <Droplets className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#CCCCCC]" />
                    <div>
                      <p className="text-[13.5px] font-semibold text-white">Reduce dynamic blur</p>
                      <p className="text-[11.5px] text-[#8E8E93]">
                        Swaps frosted glass for solid fills across the app
                      </p>
                    </div>
                  </div>
                  <AppleSwitch
                    label="Reduce dynamic blur"
                    checked={settings.reduceBlur}
                    onChange={(v) => settingsStore.update({ reduceBlur: v })}
                  />
                </div>

                {/* Disable Blend Effects */}
                <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <Contrast className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#CCCCCC]" />
                    <div>
                      <p className="text-[13.5px] font-semibold text-white">Disable blend effects</p>
                      <p className="text-[11.5px] text-[#8E8E93]">
                        Shows clean neutral cards instead of tinting with cover art
                      </p>
                    </div>
                  </div>
                  <AppleSwitch
                    label="Disable blend effects"
                    checked={settings.disableBlend}
                    onChange={(v) => settingsStore.update({ disableBlend: v })}
                  />
                </div>

                {/* Liquid Glass Navigation Toggle */}
                <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#3EA6FF]" />
                    <div>
                      <p className="text-[13.5px] font-semibold text-white">Liquid Glass Navigation</p>
                      <p className="text-[11.5px] text-[#8E8E93]">
                        Real refracting glass on the floating dock and top navigation bar
                      </p>
                    </div>
                  </div>
                  <AppleSwitch
                    label="Toggle Liquid Glass Navigation"
                    checked={settings.liquidGlass}
                    onChange={(v) => {
                      settingsStore.setLiquidGlass(v);
                      toast(v ? 'Liquid Glass Navigation enabled' : 'Classic Navigation enabled');
                    }}
                  />
                </div>
              </div>

              {/* Swatches & Custom Colors */}
              <div className="space-y-4 rounded-[22px] border border-white/[0.09] bg-white/[0.04] p-4">
                <p className="text-[11.5px] font-bold uppercase tracking-wider text-[#8E8E93]">
                  Accent &amp; Palette Swatches
                </p>

                {/* Curated Color Swatch Circles */}
                <div className="flex flex-wrap gap-2.5 pt-1">
                  {ACCENT_SWATCHES.map((sw) => {
                    const selected =
                      settings.themeColors.bg.toLowerCase() === sw.bg.toLowerCase() &&
                      settings.themeColors.accent.toLowerCase() === sw.accent.toLowerCase();
                    return (
                      <button
                        key={sw.name}
                        type="button"
                        title={sw.name}
                        aria-label={`Apply theme ${sw.name}`}
                        onClick={() => {
                          if (sw.bg === '#F4F4F7') {
                            settingsStore.update({
                              themePreset: 'light',
                              themeColors: { bg: sw.bg, text: sw.text, accent: sw.accent },
                            });
                          } else {
                            settingsStore.setThemeColors({
                              bg: sw.bg,
                              text: sw.text,
                              accent: sw.accent,
                            });
                          }
                          toast(`Applied ${sw.name}`);
                        }}
                        className={`relative h-8 w-8 overflow-hidden rounded-full border-2 transition ${
                          selected ? 'scale-110 border-white ring-2 ring-white/40' : 'border-white/25 hover:scale-105'
                        }`}
                        style={{
                          background: `linear-gradient(135deg, ${sw.bg} 50%, ${sw.accent} 50%)`,
                        }}
                      >
                        {selected && (
                          <Check className="mx-auto h-3.5 w-3.5 text-white drop-shadow" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Background / Text / Accent Hex Pickers */}
                <div className="space-y-2 border-t border-white/[0.08] pt-3">
                  {(
                    [
                      { key: 'bg', label: 'Background' },
                      { key: 'text', label: 'Text' },
                      { key: 'accent', label: 'Accent' },
                    ] as const
                  ).map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-3">
                      <span className="text-[12.5px] font-semibold text-neutral-200">
                        {row.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={`${row.label} color picker`}
                          value={settings.themeColors[row.key]}
                          onChange={(e) =>
                            settingsStore.setThemeColors({ [row.key]: e.target.value })
                          }
                          className="h-7 w-9 cursor-pointer rounded border border-white/20 bg-transparent"
                        />
                        <code className="w-20 rounded-lg bg-black/40 px-2 py-1 text-center text-[11px] font-mono text-[#CCCCCC]">
                          {settings.themeColors[row.key].toUpperCase()}
                        </code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {section === 'home' && (
            <>
              <div className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.04]">
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-[13px] font-bold text-white">Show For You Grid</p>
                    <p className="text-[11px] text-[#AAAAAA]">
                      Personalized anime &amp; manga recommendations at top of Home.
                    </p>
                  </div>
                  <AppleSwitch
                    label="Show For You Grid"
                    checked={settings.showHomeForYou}
                    onChange={(v) => settingsStore.update({ showHomeForYou: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-[13px] font-bold text-white">
                      Show Subscriptions / Continue Watching Rail
                    </p>
                    <p className="text-[11px] text-[#AAAAAA]">
                      Quick resume cards filtered by the folder checkboxes below.
                    </p>
                  </div>
                  <AppleSwitch
                    label="Show Subscriptions Rail"
                    checked={settings.showHomeSubscriptions}
                    onChange={(v) => settingsStore.update({ showHomeSubscriptions: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-[13px] font-bold text-white">Show Discovery Shelves</p>
                    <p className="text-[11px] text-[#AAAAAA]">
                      Seasonal spotlight, “Because You Watched”, and hidden-gem rows.
                    </p>
                  </div>
                  <AppleSwitch
                    label="Show Discovery Shelves"
                    checked={settings.showHomeDiscoveryShelves}
                    onChange={(v) => settingsStore.update({ showHomeDiscoveryShelves: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-[13px] font-bold text-white">Auto-load Comments</p>
                    <p className="text-[11px] text-[#AAAAAA]">
                      When off, threads stay collapsed until tapped (helps avoid spoilers).
                    </p>
                  </div>
                  <AppleSwitch
                    label="Auto-load Comments"
                    checked={settings.autoLoadComments}
                    onChange={(v) => settingsStore.update({ autoLoadComments: v })}
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                <p className="text-[12px] font-bold uppercase tracking-wider text-[#CCCCCC]">
                  Followed Titles Folders on Home
                </p>
                <div className="divide-y divide-white/[0.06]">
                  {ALL_STATUSES.map((st) => {
                    const checked = settings.homeStatusFolders.includes(st);
                    return (
                      <label
                        key={st}
                        className="flex cursor-pointer items-center justify-between py-2.5 text-[12.5px] font-semibold text-white"
                      >
                        <span className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => settingsStore.toggleHomeStatusFolder(st)}
                            className="h-4 w-4 accent-[#3EA6FF]"
                          />
                          {statusLabel(st, 'ANIME')}
                        </span>
                        <span className="rounded-md bg-white/[0.07] px-2 py-0.5 text-[10px] text-[#AAAAAA]">
                          built-in
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {section === 'content' && (
            <>
              <div className="space-y-2 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                <p className="text-[12px] font-bold uppercase tracking-wider text-[#CCCCCC]">
                  Content Filter Level
                </p>
                {(
                  [
                    {
                      id: 'safe',
                      title: 'Safe',
                      desc: 'Family-friendly series only. Filters Ecchi, fanservice, and extreme gore.',
                    },
                    {
                      id: 'balanced',
                      title: 'Balanced',
                      badge: 'Recommended',
                      desc: 'Includes standard shonen/seinen action & romance while blocking explicit titles.',
                    },
                    {
                      id: 'mature',
                      title: 'Unfiltered Catalog',
                      desc: 'Includes all AniList non-adult anime & manga genres including Horror and Ecchi.',
                    },
                  ] as { id: ContentFilterLevel; title: string; badge?: string; desc: string }[]
                ).map((opt) => {
                  const active = settings.contentFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        settingsStore.setContentFilter(opt.id);
                        toast(`Content filter set to ${opt.title}`);
                      }}
                      className={`w-full rounded-2xl border p-3.5 text-left transition ${
                        active
                          ? 'border-[#3EA6FF] bg-[#3EA6FF]/15'
                          : 'border-white/[0.08] bg-black/20 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-white">{opt.title}</span>
                        {opt.badge && (
                          <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase text-amber-300">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11.5px] text-[#AAAAAA]">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2.5 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                <p className="text-[12px] font-bold uppercase tracking-wider text-[#CCCCCC]">
                  Hidden / Blocked Genres
                </p>
                <p className="text-[11px] text-[#AAAAAA]">
                  Tap any genre to exclude it from Home &amp; Explore discovery feeds.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {BLOCKABLE_GENRES.map((g) => {
                    const blocked = settings.blockedGenres.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => settingsStore.toggleBlockedGenre(g)}
                        className={`rounded-full px-3 py-1 text-[11.5px] font-semibold transition ${
                          blocked
                            ? 'bg-rose-500/25 text-rose-200 ring-1 ring-rose-400/50'
                            : 'bg-white/[0.07] text-[#CCCCCC] hover:bg-white/[0.14]'
                        }`}
                      >
                        {blocked ? `Hidden: ${g}` : g}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {section === 'privacy' && (
            <>
              <div className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.04]">
                <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                  Public Profile Visibility
                </div>
                {(
                  [
                    {
                      key: 'hideActivity',
                      title: 'Hide recent watch history',
                      desc: 'Visitors cannot see your latest watched episodes on your public profile.',
                    },
                    {
                      key: 'hideStats',
                      title: 'Hide stats & taste affinity',
                      desc: 'Hide score comparison & genre breakdown from public profile viewers.',
                    },
                    {
                      key: 'hideLists',
                      title: 'Hide public watchlist tab',
                      desc: 'Hide your anime & manga list entries on public profile pages.',
                    },
                    {
                      key: 'hideFavorites',
                      title: 'Hide pinned favorites',
                      desc: 'Hide your pinned favorite shows and characters from visitors.',
                    },
                  ] as const
                ).map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-[13px] font-bold text-white">{item.title}</p>
                      <p className="text-[11px] text-[#AAAAAA]">{item.desc}</p>
                    </div>
                    <AppleSwitch
                      label={item.title}
                      checked={settings.profileVisibility[item.key]}
                      onChange={(v) => settingsStore.updateProfileVisibility({ [item.key]: v })}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[#CCCCCC]">
                  <Bell className="h-3.5 w-3.5 text-[#3EA6FF]" />
                  Airing Alert Folders
                </p>
                {ALL_STATUSES.map((st) => {
                  const checked = settings.notifyFolders.includes(st);
                  return (
                    <label
                      key={`nf-${st}`}
                      className="flex cursor-pointer items-center justify-between py-1.5 text-[12.5px] font-semibold text-white"
                    >
                      <span className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => settingsStore.toggleNotifyFolder(st)}
                          className="h-4 w-4 accent-[#3EA6FF]"
                        />
                        {statusLabel(st, 'ANIME')}
                      </span>
                    </label>
                  );
                })}
                <div className="flex items-center justify-between gap-4 border-t border-white/[0.08] pt-3">
                  <div>
                    <p className="text-[12.5px] font-bold text-white">
                      Notify on comment likes &amp; replies
                    </p>
                  </div>
                  <AppleSwitch
                    label="Comment likes alerts"
                    checked={settings.notifyCommentLikes}
                    onChange={(v) => settingsStore.update({ notifyCommentLikes: v })}
                  />
                </div>
              </div>
            </>
          )}

          {section === 'playback' && (
            <>
              <div className="space-y-2.5 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                <p className="text-[12px] font-bold uppercase tracking-wider text-[#CCCCCC]">
                  Scoring System
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {SCORE_FORMATS.map((fmt) => {
                    const active = settings.scoreFormat === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => {
                          settingsStore.setScoreFormat(fmt.id);
                          toast(`Scoring scale set to ${fmt.label}`);
                        }}
                        className={`rounded-xl border px-3 py-2 text-left text-[11.5px] font-semibold transition ${
                          active
                            ? 'border-[#3EA6FF] bg-[#3EA6FF]/15 text-white'
                            : 'border-white/[0.08] bg-black/25 text-[#CCCCCC] hover:border-white/25'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.04]">
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-[13px] font-bold text-white">Auto-hide Header &amp; Dock on Scroll</p>
                    <p className="text-[11px] text-[#AAAAAA]">
                      Hide TopBar and bottom navigation when scrolling down for full-screen browsing.
                    </p>
                  </div>
                  <AppleSwitch
                    label="Auto-hide Header & Dock on Scroll"
                    checked={settings.autoHideBars}
                    onChange={(v) => settingsStore.update({ autoHideBars: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-[13px] font-bold text-white">Enhanced Ambient Mode</p>
                    <p className="text-[11px] text-[#AAAAAA]">
                      Morphe-style cinema glow behind watch players and banners.
                    </p>
                  </div>
                  <AppleSwitch
                    label="Enhanced Ambient Mode"
                    checked={settings.ambientMode}
                    onChange={(v) => settingsStore.update({ ambientMode: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-[13px] font-bold text-white">Dim Ambient While Scrolling</p>
                    <p className="text-[11px] text-[#AAAAAA]">
                      Softly fades ambient cinema backlight when scrolling into comments.
                    </p>
                  </div>
                  <AppleSwitch
                    label="Dim Ambient While Scrolling"
                    checked={settings.dimAmbientOnScroll}
                    onChange={(v) => settingsStore.update({ dimAmbientOnScroll: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-[13px] font-bold text-white">Auto-Play Trailers</p>
                    <p className="text-[11px] text-[#AAAAAA]">
                      Start trailers automatically when opening an anime watch page.
                    </p>
                  </div>
                  <AppleSwitch
                    label="Auto-Play Trailers"
                    checked={settings.autoplayTrailer}
                    onChange={(v) => settingsStore.setAutoplayTrailer(v)}
                  />
                </div>
                <div className="space-y-2.5 p-4">
                  <div>
                    <p className="text-[13px] font-bold text-white">Watch &amp; Reader Link Browser</p>
                    <p className="text-[11px] text-[#AAAAAA]">
                      Choose how KotoPlay, Comix &amp; community watch/read links open.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 rounded-full bg-black/35 p-1 ring-1 ring-white/[0.08]">
                    {(
                      [
                        { id: 'external', label: 'External' },
                        { id: 'ask', label: 'Ask Each Time' },
                        { id: 'inapp', label: 'Built-in' },
                      ] as { id: ExternalLinkMode; label: string }[]
                    ).map((opt) => {
                      const active = settings.externalLinkMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            settingsStore.update({ externalLinkMode: opt.id });
                            toast(`Link opener set to ${opt.label}`);
                          }}
                          className={`lt-press rounded-full py-1.5 text-[11.5px] font-semibold ${
                            active ? 'bg-white text-black shadow' : 'text-[#CCCCCC] hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-[13px] font-bold text-white">
                      Community Watch &amp; Reader Links
                    </p>
                    <p className="text-[11px] text-[#AAAAAA]">
                      Show external shortcuts (KotoPlay, Comix.to, Kagane) beside Official links.
                    </p>
                  </div>
                  <AppleSwitch
                    label="Community Links"
                    checked={settings.showCommunityLinks}
                    onChange={(v) => settingsStore.setShowCommunityLinks(v)}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-[13px] font-bold text-white">Refresh Artwork Cache</p>
                    <p className="text-[11px] text-[#AAAAAA]">
                      Clear unpinned IndexedDB posters while keeping your list intact.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      animeStore.clearUnpinned();
                      toast('IndexedDB cache refreshed');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.1] px-3 py-1.5 text-[11.5px] font-bold text-white hover:bg-white/[0.18]"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-[#3EA6FF]" />
                    Refresh
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3.5">
          <button
            type="button"
            onClick={() => {
              settingsStore.resetAllDefaults();
              toast('Settings restored to defaults');
            }}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#AAAAAA] hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white px-5 py-2 text-[12.5px] font-bold text-black transition hover:bg-neutral-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
