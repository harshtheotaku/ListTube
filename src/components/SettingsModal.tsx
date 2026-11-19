import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellRing,
  Check,
  ChevronRight,
  Contrast,
  Database,
  Download,
  Droplets,
  Eye,
  EyeOff,
  FileUp,
  Gauge,
  HardDrive,
  KeyRound,
  Keyboard,
  Layout,
  Palette,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Smartphone,
  Sparkles,
  Trash2,
  Type,
  VolumeX,
  X,
} from 'lucide-react';
import {
  CardDensity,
  ContentFilterLevel,
  DefaultStartupTab,
  ExternalLinkMode,
  FontStylePreset,
  ListStatus,
  MediaType,
  statusLabel,
  ThemePreset,
  TitleLanguage,
} from '../types';
import { animeStore } from '../services/animeStore';
import {
  APP_VERSION,
  AppUpdateInfo,
  canInstallInAppNative,
  checkForGitHubUpdate,
  downloadInAppUpdateOnly,
  openInstallPermissionSettings,
  retryPendingInstall,
  triggerInAppUpdate,
  useAppUpdateState,
} from '../services/appUpdater';
import { exportMalXml } from '../services/backupImport';
import {
  createUserApiKey,
  listUserApiKeys,
  revokeUserApiKey,
  UserApiKeySummary,
} from '../services/communityStats';
import { useCloudSync } from '../services/cloudSync';
import { library, useLibrary } from '../services/library';
import { EDGE_API_BASE } from '../services/supabase';
import { isNativeCapacitor } from '../services/platform';
import { autoMaintainStorageCache } from '../services/offlineCoverCache';
import { SCORE_FORMATS } from '../services/scoring';
import { settingsStore, usePwaInstallPrompt, useSettings } from '../services/settings';
import { toast } from './Toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPhonePreview?: () => void;
  pageMode?: boolean;
}

type SettingsSection = 'appearance' | 'home' | 'content' | 'privacy' | 'playback' | 'system';

const CATEGORY_META: {
  id: SettingsSection;
  label: string;
  desc: string;
  icon: React.ElementType;
  keywords: string;
}[] = [
  {
    id: 'appearance',
    label: 'Themes & Glass',
    desc: 'Theme, fonts, density & glass',
    icon: Palette,
    keywords: 'theme obsidian oled daylight custom accent font density blur motion blend liquid glass opacity translucency frosted',
  },
  {
    id: 'home',
    label: 'Home & Feeds',
    desc: 'Feeds, titles, startup & rail',
    icon: Layout,
    keywords: 'home feed for you subscriptions discovery comments title romaji english native startup manga',
  },
  {
    id: 'content',
    label: 'Content Filter',
    desc: 'Safety rating, spoilers & genres',
    icon: Shield,
    keywords: 'content filter safe balanced unfiltered ecchi horror spoiler guard confirm remove genres',
  },
  {
    id: 'privacy',
    label: 'Privacy & Alerts',
    desc: 'Profile privacy & push alerts',
    icon: Eye,
    keywords: 'privacy profile visibility activity stats airing push notification desktop browser alert',
  },
  {
    id: 'playback',
    label: 'Playback & Data',
    desc: 'Scores, player, cache & updates',
    icon: Play,
    keywords: 'score format autohide ambient trailer mute haptic external browser simulator cache update',
  },
  {
    id: 'system',
    label: 'Backup, Storage & Keys',
    desc: isNativeCapacitor() ? 'JSON backup, storage & API keys' : 'JSON backup, storage & shortcuts',
    icon: HardDrive,
    keywords: isNativeCapacitor()
      ? 'backup export import json storage quota api key'
      : 'backup export import json storage quota indexeddb pwa install keyboard shortcuts',
  },
];

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

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenPhonePreview,
  pageMode = false,
}) => {
  const settings = useSettings();
  const lib = useLibrary();
  const cloud = useCloudSync();
  const pwaInstall = usePwaInstallPrompt();
  const appUpdate = useAppUpdateState();
  const [section, setSection] = useState<SettingsSection>('appearance');
  const [searchQuery, setSearchQuery] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const resolvedUpdate = updateInfo ?? appUpdate.info;
  const [storageEst, setStorageEst] = useState<{ usage: number; quota: number } | null>(null);
  const [apiKeys, setApiKeys] = useState<UserApiKeySummary[]>([]);
  const [newApiToken, setNewApiToken] = useState<string | null>(null);
  const [apiBusy, setApiBusy] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const watchlistFileRef = useRef<HTMLInputElement>(null);
  const settingsFileRef = useRef<HTMLInputElement>(null);
  const inPhoneFrame =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('phonePreview');

  useEffect(() => {
    if (!isOpen) return;
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      void navigator.storage
        .estimate()
        .then((est) => {
          setStorageEst({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
        })
        .catch(() => {});
    }
    if (typeof Notification !== 'undefined') {
      setNotifPermission(Notification.permission);
    }
    if (cloud.isLinked) {
      void listUserApiKeys()
        .then(setApiKeys)
        .catch(() => {});
    }
  }, [isOpen, cloud.isLinked]);

  const matchingCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return CATEGORY_META.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.desc.toLowerCase().includes(q) ||
        c.keywords.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  if (!isOpen) return null;

  const activeMeta = CATEGORY_META.find((c) => c.id === section) ?? CATEGORY_META[0];
  const trackedCount = Object.keys(lib.entries).length;

  const handleEnableBrowserAlerts = async () => {
    if (typeof Notification === 'undefined') {
      toast('Desktop notifications are not supported in this browser');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result === 'granted') {
        new Notification('ListTube Alerts Active', {
          body: 'You will get desktop notifications for tracked airing episodes and replies.',
        });
        toast('Desktop browser alerts enabled!');
      } else {
        toast('Notification permission was not granted');
      }
    } catch {
      toast('Could not request notification permission');
    }
  };

  const handleExportWatchlist = () => {
    const blob = new Blob([library.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `listtube-watchlist-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Watchlist JSON downloaded');
  };

  const handleImportWatchlist = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object') {
          toast('Invalid ListTube watchlist JSON file');
          return;
        }
        library.replaceFromCloud(parsed as Parameters<typeof library.replaceFromCloud>[0]);
        toast(`Restored watchlist (${Object.keys(parsed.entries as object).length} titles)`);
      })
      .catch(() => toast('Could not parse watchlist JSON'));
  };

  const handleExportSettings = () => {
    const blob = new Blob([JSON.stringify(settingsStore.getSnapshot(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `listtube-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Settings preset JSON downloaded');
  };

  const handleImportSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object') {
          toast('Invalid settings JSON');
          return;
        }
        settingsStore.replaceFromCloud(parsed as Parameters<typeof settingsStore.replaceFromCloud>[0]);
        toast('Settings preset applied!');
      })
      .catch(() => toast('Could not parse settings JSON'));
  };

  return (
    <div
      className={
        pageMode
          ? 'min-h-[calc(100vh-3.5rem)] w-full bg-[#0F0F0F] text-white'
          : 'lt-backdrop-in fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-4'
      }
      role={pageMode ? 'region' : 'dialog'}
      aria-modal={pageMode ? undefined : 'true'}
      aria-labelledby="settings-title"
      onClick={(event) => {
        if (!pageMode && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={
          pageMode
            ? 'flex min-h-[calc(100vh-3.5rem)] w-full flex-col text-white sm:flex-row'
            : 'liquid-glass lt-sheet-up flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-[30px] border border-white/[0.16] text-white sm:h-[82vh] sm:max-h-[780px] sm:max-w-4xl sm:flex-row sm:rounded-[28px]'
        }
      >
        {/* Desktop App Left Sidebar */}
        <aside
          className={`hidden w-64 shrink-0 flex-col border-r border-white/[0.08] p-4 sm:flex lg:w-72 ${
            pageMode ? 'bg-[#121216]/70' : 'bg-black/25'
          }`}
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <h2 id="settings-title" className="text-[20px] font-extrabold tracking-tight text-white">
                Settings
              </h2>
              <p className="text-[11px] text-[#AAAAAA]">
                Synced automatically · App &amp; Web
              </p>
            </div>
            {pageMode && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Back"
                className="lt-press flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-[#CCCCCC] hover:bg-white/[0.16] hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Search box */}
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8E8E93]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings..."
              aria-label="Search settings"
              className="w-full rounded-xl border border-white/[0.1] bg-black/40 py-2 pl-8 pr-7 text-[12px] text-white placeholder-[#77777A] outline-none transition focus:border-[#3EA6FF]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear settings search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8E8E93] hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto pr-0.5 no-scrollbar" aria-label="Settings categories">
            {CATEGORY_META.map((item) => {
              const Icon = item.icon;
              const active = !matchingCategories && section === item.id;
              return (
                <button
                  key={`desk-${item.id}`}
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSection(item.id);
                  }}
                  className={`lt-press flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${
                    active
                      ? 'bg-white text-black shadow'
                      : 'text-[#D4D4D8] hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-black' : 'text-[#AAAAAA]'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold">{item.label}</p>
                    <p
                      className={`truncate text-[10.5px] ${
                        active ? 'text-black/70' : 'text-[#8E8E93]'
                      }`}
                    >
                      {item.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[11px] text-[#AAAAAA]">
            <div className="flex items-center justify-between font-semibold text-white">
              <span>ListTube Web + App</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold">
                v{APP_VERSION}
              </span>
            </div>
            <p className="mt-0.5 text-[10.5px] text-[#8E8E93]">
              {trackedCount} tracked titles · {animeStore.size().toLocaleString()} cached
            </p>
          </div>
        </aside>

        {/* Main Panel (Mobile Header + Active Content + Footer) */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Mobile Header + Pill Tabs */}
          <div className="border-b border-white/[0.08] px-4 pb-3 pt-4 sm:hidden">
            {!pageMode && <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-white/25" />}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[20px] font-extrabold tracking-tight text-white">
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
              {CATEGORY_META.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSection(item.id);
                    }}
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

          {/* Desktop Section Header */}
          <div className="hidden items-center justify-between border-b border-white/[0.08] px-6 py-4 sm:flex">
            <div>
              <h3 className="text-[17px] font-extrabold tracking-tight text-white">
                {matchingCategories
                  ? `Search results (${matchingCategories.length})`
                  : activeMeta.label}
              </h3>
              <p className="text-[11.5px] text-[#AAAAAA]">
                {matchingCategories
                  ? `Showing categories matching "${searchQuery}"`
                  : activeMeta.desc}
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

          {/* Section Body */}
          <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:px-6">
            {matchingCategories && (
              <div className="space-y-2.5">
                {matchingCategories.length === 0 ? (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 text-center text-[13px] text-[#AAAAAA]">
                    No settings matched &ldquo;{searchQuery}&rdquo;. Try searching theme, spoiler, alerts, backup, or cache.
                  </div>
                ) : (
                  matchingCategories.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={`match-${cat.id}`}
                        type="button"
                        onClick={() => {
                          setSection(cat.id);
                          setSearchQuery('');
                        }}
                        className="lt-press flex w-full items-center justify-between rounded-2xl border border-white/[0.1] bg-white/[0.05] p-4 text-left hover:border-[#3EA6FF]/50 hover:bg-white/[0.08]"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3EA6FF]/15 text-[#3EA6FF]">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-[13.5px] font-bold text-white">{cat.label}</p>
                            <p className="text-[11.5px] text-[#AAAAAA]">{cat.desc}</p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-[#AAAAAA]" />
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {!matchingCategories && section === 'appearance' && (
              <>
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

                  {/* Card Layout Density */}
                  <div className="space-y-2.5 p-4">
                    <div>
                      <p className="text-[13.5px] font-semibold text-white">Grid Card Density</p>
                      <p className="text-[11.5px] text-[#8E8E93]">
                        Show larger editorial cards or fit more columns per row on desktop &amp; mobile
                      </p>
                    </div>
                    <div className="grid grid-cols-2 rounded-full bg-black/35 p-1 ring-1 ring-white/[0.07]">
                      {(
                        [
                          { id: 'comfortable', label: 'Comfortable' },
                          { id: 'compact', label: 'Compact Grid' },
                        ] as { id: CardDensity; label: string }[]
                      ).map((opt) => {
                        const active = settings.cardDensity === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              settingsStore.update({ cardDensity: opt.id });
                              toast(`Grid density: ${opt.label}`);
                            }}
                            className={`lt-press rounded-full py-1.5 text-[12px] font-semibold ${
                              active ? 'bg-white text-black shadow' : 'text-[#9E9EA7] hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Font Style Row */}
                  {(() => {
                    const fonts: { id: FontStylePreset; label: string; desc: string }[] = [
                      { id: 'default', label: 'Default', desc: 'Inter / SF Pro Display · Crisp weights' },
                      { id: 'rounded', label: 'Rounded', desc: 'Soft Plus Jakarta / SF Rounded feel' },
                      { id: 'serif', label: 'Editorial', desc: 'Newsreader serif magazine contrast' },
                      { id: 'mono', label: 'Studio Mono', desc: 'JetBrains Mono technical rhythm' },
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

                  {/* Liquid Glass Opacity Slider + Presets + Live Clarity Preview */}
                  <div className="space-y-3 px-4 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[13.5px] font-semibold text-white">Liquid Glass Opacity &amp; Clarity</p>
                        <p className="text-[11.5px] text-[#8E8E93]">
                          {settings.reduceBlur
                            ? 'Turn off Reduce dynamic blur to see translucent glass clarity'
                            : 'Control clarity, blur & translucency of headers, sidebars, docks & sheets'}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[11.5px] font-bold text-white">
                        {settings.liquidGlassOpacity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="Liquid Glass Opacity"
                      min={15}
                      max={95}
                      step={5}
                      value={settings.liquidGlassOpacity}
                      onChange={(e) =>
                        settingsStore.update({ liquidGlassOpacity: Number(e.target.value) })
                      }
                      className="w-full cursor-pointer accent-[#3EA6FF]"
                    />
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { label: 'Clear', value: 25 },
                        { label: 'Crystal', value: 45 },
                        { label: 'Balanced', value: 65 },
                        { label: 'Frosted', value: 85 },
                      ].map((preset) => {
                        const active = Math.abs(settings.liquidGlassOpacity - preset.value) <= 4;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              settingsStore.update({ liquidGlassOpacity: preset.value });
                              toast(`Glass opacity: ${preset.label} (${preset.value}%)`);
                            }}
                            className={`lt-press rounded-full py-1 text-[11px] font-semibold transition ${
                              active
                                ? 'bg-white text-black shadow'
                                : 'bg-white/[0.07] text-[#CCCCCC] hover:bg-white/[0.14]'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Interactive Live Glass Clarity Strip */}
                    <div className="relative h-14 overflow-hidden rounded-xl border border-white/[0.12]">
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 flex items-center justify-around bg-gradient-to-r from-[#FF0000] via-amber-400 to-[#3EA6FF] px-3 text-[12px] font-black tracking-widest text-black"
                      >
                        <span>LISTTUBE</span>
                        <span>ANIME</span>
                        <span>GLASS</span>
                        <span>CLARITY</span>
                      </div>
                      <div className="liquid-glass relative z-10 flex h-full items-center justify-between px-3.5">
                        <span className="text-[11.5px] font-bold text-white drop-shadow">
                          Live Glass Sample ({settings.liquidGlassOpacity}%)
                        </span>
                        <span className="text-[10.5px] font-semibold text-white/90 drop-shadow">
                          {settings.liquidGlassOpacity <= 35
                            ? 'Crystal Clear'
                            : settings.liquidGlassOpacity <= 55
                              ? 'Light Tint'
                              : settings.liquidGlassOpacity <= 75
                                ? 'Balanced Frost'
                                : 'Deep Frosted'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Swatches & Custom Colors */}
                <div className="space-y-4 rounded-[22px] border border-white/[0.09] bg-white/[0.04] p-4">
                  <p className="text-[11.5px] font-bold uppercase tracking-wider text-[#8E8E93]">
                    Accent &amp; Palette Swatches
                  </p>

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

            {!matchingCategories && section === 'home' && (
              <>
                <div className="space-y-4 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                  <div className="space-y-2">
                    <p className="text-[13px] font-bold text-white">Preferred Title Language</p>
                    <p className="text-[11px] text-[#AAAAAA]">
                      Choose whether anime &amp; manga display in English, Romaji, or Native script.
                    </p>
                    <div className="grid grid-cols-3 rounded-full bg-black/35 p-1 ring-1 ring-white/[0.08]">
                      {(
                        [
                          { id: 'english', label: 'English' },
                          { id: 'romaji', label: 'Romaji' },
                          { id: 'native', label: 'Native (日本語)' },
                        ] as { id: TitleLanguage; label: string }[]
                      ).map((opt) => {
                        const active = settings.titleLanguage === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              settingsStore.update({ titleLanguage: opt.id });
                              toast(`Title language: ${opt.label}`);
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

                  <div className="space-y-2 border-t border-white/[0.08] pt-3.5">
                    <p className="text-[13px] font-bold text-white">Startup Screen</p>
                    <div className="grid grid-cols-4 rounded-full bg-black/35 p-1 ring-1 ring-white/[0.08]">
                      {(
                        [
                          { id: 'home', label: 'Home' },
                          { id: 'explore', label: 'Explore' },
                          { id: 'list', label: 'My List' },
                          { id: 'schedule', label: 'Schedule' },
                        ] as { id: DefaultStartupTab; label: string }[]
                      ).map((opt) => {
                        const active = settings.defaultTab === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              settingsStore.update({ defaultTab: opt.id });
                              toast(`Startup screen set to ${opt.label}`);
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

                  <div className="space-y-2 border-t border-white/[0.08] pt-3.5">
                    <p className="text-[13px] font-bold text-white">Default Catalog Mode</p>
                    <div className="grid grid-cols-2 rounded-full bg-black/35 p-1 ring-1 ring-white/[0.08]">
                      {(
                        [
                          { id: 'ANIME', label: 'Anime Mode' },
                          { id: 'MANGA', label: 'Manga Mode' },
                        ] as { id: MediaType; label: string }[]
                      ).map((opt) => {
                        const active = settings.defaultMediaType === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              settingsStore.update({ defaultMediaType: opt.id });
                              toast(`Default mode: ${opt.label}`);
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
                </div>

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
                        Seasonal spotlight, &ldquo;Because You Watched&rdquo;, and hidden-gem rows.
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

            {!matchingCategories && section === 'content' && (
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

                <div className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-4 p-4">
                    <div className="flex items-start gap-3">
                      <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                      <div>
                        <p className="text-[13px] font-bold text-white">Spoiler Guard</p>
                        <p className="text-[11px] text-[#AAAAAA]">
                          Hide plot synopses on watch pages behind a click-to-reveal prompt.
                        </p>
                      </div>
                    </div>
                    <AppleSwitch
                      label="Spoiler Guard"
                      checked={settings.hideSpoilers}
                      onChange={(v) => settingsStore.update({ hideSpoilers: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 p-4">
                    <div className="flex items-start gap-3">
                      <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                      <div>
                        <p className="text-[13px] font-bold text-white">Confirm Before Removing Title</p>
                        <p className="text-[11px] text-[#AAAAAA]">
                          Ask confirmation before unsubscribing &amp; clearing progress for a series.
                        </p>
                      </div>
                    </div>
                    <AppleSwitch
                      label="Confirm Before Removing Title"
                      checked={settings.confirmBeforeRemove}
                      onChange={(v) => settingsStore.update({ confirmBeforeRemove: v })}
                    />
                  </div>
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

            {!matchingCategories && section === 'privacy' && (
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

                {/* Desktop & Browser Push Alerts (Web only — Android uses native airing alarms) */}
                {!isNativeCapacitor() && (
                  <div className="space-y-3 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-1.5 text-[13px] font-bold text-white">
                          <BellRing className="h-4 w-4 text-[#3EA6FF]" />
                          Desktop &amp; Web Push Alerts
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#AAAAAA]">
                          Status:{' '}
                          <span className="font-bold text-white">
                            {notifPermission === 'granted'
                              ? 'Enabled'
                              : notifPermission === 'denied'
                              ? 'Blocked in Browser'
                              : notifPermission === 'unsupported'
                              ? 'Unsupported'
                              : 'Not Enabled'}
                          </span>
                        </p>
                      </div>
                      {notifPermission !== 'unsupported' && (
                        <button
                          type="button"
                          onClick={handleEnableBrowserAlerts}
                          className="lt-press inline-flex items-center gap-1.5 rounded-full bg-[#3EA6FF]/15 px-3.5 py-1.5 text-[11.5px] font-bold text-[#3EA6FF] ring-1 ring-[#3EA6FF]/35 hover:bg-[#3EA6FF]/25"
                        >
                          <Bell className="h-3.5 w-3.5" />
                          {notifPermission === 'granted' ? 'Send Test Alert' : 'Enable Browser Alerts'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

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
                        Daily Evening Airing Digest
                      </p>
                      <p className="text-[11px] text-[#AAAAAA]">
                        Bundle tracked broadcasts releasing tonight into one digest notification card.
                      </p>
                    </div>
                    <AppleSwitch
                      label="Daily Evening Airing Digest"
                      checked={settings.digestMode}
                      onChange={(v) => settingsStore.update({ digestMode: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-white/[0.08] pt-3">
                    <div>
                      <p className="text-[12.5px] font-bold text-white">
                        Notification Quiet Hours
                      </p>
                      <p className="text-[11px] text-[#AAAAAA]">
                        Label late-night schedule alerts quietly for evening digest batching.
                      </p>
                    </div>
                    <AppleSwitch
                      label="Notification Quiet Hours"
                      checked={settings.quietHoursEnabled}
                      onChange={(v) => settingsStore.update({ quietHoursEnabled: v })}
                    />
                  </div>
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

            {!matchingCategories && section === 'playback' && (
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
                  <div className="flex items-center justify-between gap-4 p-4">
                    <div className="flex items-start gap-3">
                      <VolumeX className="mt-0.5 h-4 w-4 shrink-0 text-[#CCCCCC]" />
                      <div>
                        <p className="text-[13px] font-bold text-white">Mute Trailers by Default</p>
                        <p className="text-[11px] text-[#AAAAAA]">
                          Launch watch-page and mini-player trailers muted until unmuted manually.
                        </p>
                      </div>
                    </div>
                    <AppleSwitch
                      label="Mute Trailers by Default"
                      checked={settings.defaultTrailerMuted}
                      onChange={(v) => settingsStore.update({ defaultTrailerMuted: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-[13px] font-bold text-white">Haptic Touch Feedback</p>
                      <p className="text-[11px] text-[#AAAAAA]">
                        Tactile pulse on episode updates and pull-to-refresh on supported devices.
                      </p>
                    </div>
                    <AppleSwitch
                      label="Haptic Touch Feedback"
                      checked={settings.hapticsEnabled}
                      onChange={(v) => settingsStore.update({ hapticsEnabled: v })}
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
                  {onOpenPhonePreview && !isNativeCapacitor() && !inPhoneFrame && (
                    <div className="flex items-center justify-between gap-4 p-4">
                      <div>
                        <p className="text-[13px] font-bold text-white">Laptop Phone Simulator</p>
                        <p className="text-[11px] text-[#AAAAAA]">
                          Preview the 390px mobile UI &amp; Liquid Glass dock directly on laptop without building an APK.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenPhonePreview();
                        }}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#3EA6FF]/15 px-3 py-1.5 text-[11.5px] font-bold text-[#3EA6FF] ring-1 ring-[#3EA6FF]/35 hover:bg-[#3EA6FF]/25"
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        Launch
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-[13px] font-bold text-white">Auto Cache Clear</p>
                      <p className="text-[11px] text-[#AAAAAA]">
                        Automatically evict stale unpinned records (&gt;14d) &amp; old offline caches while preserving your Watchlist.
                      </p>
                    </div>
                    <AppleSwitch
                      label="Auto Cache Clear"
                      checked={settings.autoClearCache}
                      onChange={(v) => settingsStore.update({ autoClearCache: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-[13px] font-bold text-white">Clean &amp; Refresh Cache Now</p>
                      <p className="text-[11px] text-[#AAAAAA]">
                        Sweep stale IndexedDB &amp; Cache Storage entries immediately while keeping your list intact.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        animeStore.clearUnpinned();
                        void autoMaintainStorageCache(true).then((res) => {
                          toast(
                            `Cleaned cache (${res.prunedRecords} stale items, ${res.removedOldCaches} old buckets)`
                          );
                        });
                      }}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.1] px-3 py-1.5 text-[11.5px] font-bold text-white hover:bg-white/[0.18]"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-[#3EA6FF]" />
                      Clean Now
                    </button>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-bold text-white">
                          Direct In-App Auto-Updater (v{APP_VERSION})
                        </p>
                        <p className="text-[11px] text-[#AAAAAA]">
                          {resolvedUpdate
                            ? resolvedUpdate.updateAvailable
                              ? `Update v${resolvedUpdate.latestVersion} ready (${resolvedUpdate.assetSizeBytes ? `${(resolvedUpdate.assetSizeBytes / (1024 * 1024)).toFixed(1)} MB` : 'signed APK'})`
                              : `You are running the latest version (v${resolvedUpdate.latestVersion}).`
                            : 'Downloads & installs APK updates right inside ListTube — no GitHub visit required.'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {appUpdate.downloadState !== 'downloading' && (
                          <>
                            <button
                              type="button"
                              aria-label="Download update in app"
                              onClick={() => {
                                const started = downloadInAppUpdateOnly(resolvedUpdate);
                                toast(
                                  started
                                    ? 'Downloading update APK inside app…'
                                    : 'Downloading latest APK package…'
                                );
                              }}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.12] px-3.5 py-1.5 text-[11.5px] font-bold text-white hover:bg-white/[0.2]"
                            >
                              <Download className="h-3.5 w-3.5 text-emerald-400" />
                              {resolvedUpdate?.latestVersion
                                ? `Download Update (v${resolvedUpdate.latestVersion})`
                                : 'Download Update In-App'}
                            </button>

                            <button
                              type="button"
                              aria-label="Install update in app"
                              onClick={() => {
                                if (appUpdate.downloadState === 'downloaded' && canInstallInAppNative()) {
                                  retryPendingInstall();
                                  toast('Launching in-app installer…');
                                } else {
                                  const nativeHandled = triggerInAppUpdate(resolvedUpdate);
                                  if (!nativeHandled) {
                                    toast('Downloading APK to install…');
                                  }
                                }
                              }}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1.5 text-[11.5px] font-bold text-black hover:bg-emerald-400"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {appUpdate.downloadState === 'downloaded'
                                ? 'Install Downloaded Update'
                                : 'Install Update In-App'}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={checkingUpdate}
                          onClick={() => {
                            setCheckingUpdate(true);
                            void checkForGitHubUpdate(true)
                              .then((res) => {
                                if (res) {
                                  setUpdateInfo(res);
                                  if (res.updateAvailable && settings.autoUpdateApp && canInstallInAppNative()) {
                                    triggerInAppUpdate(res);
                                    toast(`Downloading ListTube v${res.latestVersion} in app…`);
                                  } else {
                                    toast(
                                      res.updateAvailable
                                        ? `ListTube v${res.latestVersion} available!`
                                        : `Up to date (v${res.latestVersion})`
                                    );
                                  }
                                } else {
                                  toast('Could not reach update feed');
                                }
                              })
                              .finally(() => setCheckingUpdate(false));
                          }}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.1] px-3 py-1.5 text-[11.5px] font-bold text-white hover:bg-white/[0.18] disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 text-[#3EA6FF] ${checkingUpdate ? 'animate-spin' : ''}`} />
                          {checkingUpdate ? 'Checking…' : 'Check Now'}
                        </button>
                      </div>
                    </div>

                    {appUpdate.downloadState === 'downloading' && (
                      <div className="space-y-1.5 rounded-xl bg-black/35 p-3">
                        <div className="flex items-center justify-between text-[11px] font-bold text-emerald-300">
                          <span>{appUpdate.statusMessage || 'Downloading update APK…'}</span>
                          <span>{appUpdate.downloadProgress}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-emerald-400 transition-all duration-150"
                            style={{ width: `${appUpdate.downloadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {appUpdate.downloadState === 'needs_permission' && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2.5">
                        <p className="text-[11.5px] font-semibold text-amber-200">
                          {appUpdate.statusMessage || "Enable 'Install unknown apps' to finish updating in app."}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={openInstallPermissionSettings}
                            className="rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold text-black"
                          >
                            Allow Permission
                          </button>
                          <button
                            type="button"
                            onClick={retryPendingInstall}
                            className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold text-white"
                          >
                            Install APK
                          </button>
                        </div>
                      </div>
                    )}

                    {appUpdate.downloadState === 'error' && appUpdate.statusMessage && (
                      <p className="text-[11px] font-semibold text-rose-300">
                        Update error: {appUpdate.statusMessage}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
                      <div>
                        <p className="text-[12.5px] font-bold text-white">
                          Auto-Update App Automatically
                        </p>
                        <p className="text-[10.5px] text-[#AAAAAA]">
                          Checks for new releases automatically and downloads &amp; installs inside the app
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.autoUpdateApp}
                        aria-label="Toggle automatic in-app updates"
                        onClick={() => settingsStore.update({ autoUpdateApp: !settings.autoUpdateApp })}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                          settings.autoUpdateApp ? 'bg-emerald-500' : 'bg-white/20'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                            settings.autoUpdateApp ? 'left-[22px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {!matchingCategories && section === 'system' && (
              <>
                {/* Live Storage Inspector */}
                <div className="space-y-3 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 text-[13px] font-bold text-white">
                      <Database className="h-4 w-4 text-[#3EA6FF]" />
                      Offline Storage &amp; Database
                    </p>
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-white">
                      {storageEst ? formatBytes(storageEst.usage) : 'Local IDB'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-black/30 p-2.5">
                      <p className="text-[16px] font-black text-white">{trackedCount}</p>
                      <p className="text-[10.5px] text-[#AAAAAA]">Tracked Titles</p>
                    </div>
                    <div className="rounded-xl bg-black/30 p-2.5">
                      <p className="text-[16px] font-black text-white">
                        {animeStore.size().toLocaleString()}
                      </p>
                      <p className="text-[10.5px] text-[#AAAAAA]">Cached Catalog</p>
                    </div>
                    <div className="rounded-xl bg-black/30 p-2.5">
                      <p className="text-[16px] font-black text-white">
                        {storageEst?.quota ? formatBytes(storageEst.quota) : '—'}
                      </p>
                      <p className="text-[10.5px] text-[#AAAAAA]">Browser Quota</p>
                    </div>
                  </div>
                </div>

                {/* Watchlist & Settings Backup / Restore */}
                <div className="space-y-3 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                  <p className="text-[12px] font-bold uppercase tracking-wider text-[#CCCCCC]">
                    Backup &amp; Restore JSON
                  </p>
                  <input
                    ref={watchlistFileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={handleImportWatchlist}
                  />
                  <input
                    ref={settingsFileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={handleImportSettings}
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleExportWatchlist}
                      className="lt-press flex items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.07] px-3 py-2.5 text-[12px] font-bold text-white hover:bg-white/[0.14]"
                    >
                      <Download className="h-3.5 w-3.5 text-[#3EA6FF]" />
                      Export Watchlist JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => watchlistFileRef.current?.click()}
                      className="lt-press flex items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.07] px-3 py-2.5 text-[12px] font-bold text-white hover:bg-white/[0.14]"
                    >
                      <FileUp className="h-3.5 w-3.5 text-emerald-400" />
                      Restore Watchlist JSON
                    </button>
                    <button
                      type="button"
                      onClick={handleExportSettings}
                      className="lt-press flex items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.07] px-3 py-2.5 text-[12px] font-bold text-white hover:bg-white/[0.14]"
                    >
                      <Download className="h-3.5 w-3.5 text-[#AAAAAA]" />
                      Export Settings Preset
                    </button>
                    <button
                      type="button"
                      onClick={() => settingsFileRef.current?.click()}
                      className="lt-press flex items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.07] px-3 py-2.5 text-[12px] font-bold text-white hover:bg-white/[0.14]"
                    >
                      <FileUp className="h-3.5 w-3.5 text-[#AAAAAA]" />
                      Import Settings Preset
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const xml = exportMalXml(lib);
                        const blob = new Blob([xml], { type: 'application/xml' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `listtube-mal-export-${new Date().toISOString().slice(0, 10)}.xml`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast('Exported MAL XML backup');
                      }}
                      className="lt-press sm:col-span-2 flex items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.07] px-3 py-2.5 text-[12px] font-bold text-white hover:bg-white/[0.14]"
                    >
                      <Download className="h-3.5 w-3.5 text-amber-300" />
                      Export MyAnimeList (.xml)
                    </button>
                  </div>
                </div>

                {/* Scoped Tracker API & Browser Auto-Tracker Companion */}
                <div className="space-y-3 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1.5 text-[13px] font-bold text-white">
                        <KeyRound className="h-4 w-4 text-[#3EA6FF]" />
                        Tracker API &amp; Browser Auto-Tracker Companion
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#AAAAAA]">
                        Generate a scoped <code>lt_...</code> API key for third-party apps or the{' '}
                        <code>companion-extension/</code> Chrome/Edge scrobbler.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={apiBusy || !cloud.isLinked}
                      onClick={() => {
                        setApiBusy(true);
                        void createUserApiKey('Browser Scrobbler')
                          .then((res) => {
                            setNewApiToken(res.token);
                            setApiKeys((prev) => [res.key, ...prev]);
                            toast('Generated new Tracker API Key');
                          })
                          .catch((err) => {
                            toast(err instanceof Error ? err.message : 'Sign in first or deploy migration');
                          })
                          .finally(() => setApiBusy(false));
                      }}
                      className="lt-press rounded-full bg-[#3EA6FF] px-3.5 py-1.5 text-[11.5px] font-bold text-black disabled:opacity-40"
                    >
                      {apiBusy ? 'Creating…' : cloud.isLinked ? '+ Create API Key' : 'Sign in Required'}
                    </button>
                  </div>

                  <p className="rounded-xl bg-black/35 px-3 py-2 font-mono text-[10.5px] text-[#AAAAAA] select-all">
                    Endpoint: {EDGE_API_BASE}/v1
                  </p>

                  {newApiToken && (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-[11.5px]">
                      <code className="truncate font-mono font-bold text-emerald-200 select-all">
                        {newApiToken}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(newApiToken);
                          toast('Copied API key');
                        }}
                        className="shrink-0 rounded-lg bg-emerald-400 px-2.5 py-1 text-[10.5px] font-bold text-black"
                      >
                        Copy
                      </button>
                    </div>
                  )}

                  {apiKeys.length > 0 && (
                    <div className="space-y-1.5">
                      {apiKeys.map((k) => (
                        <div
                          key={k.id}
                          className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-[11.5px]"
                        >
                          <div>
                            <span className="font-bold text-white">{k.label}</span>
                            <span className="ml-2 font-mono text-[10.5px] text-[#8E8E93]">
                              {k.token_prefix}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void revokeUserApiKey(k.id).then(() => {
                                setApiKeys((prev) => prev.filter((x) => x.id !== k.id));
                                toast('API key revoked');
                              });
                            }}
                            className="text-[11px] font-bold text-rose-400 hover:underline"
                          >
                            Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Desktop PWA Install + Keyboard Shortcuts */}
                {!isNativeCapacitor() && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                    <div>
                      <p className="text-[13px] font-bold text-white">Install ListTube Desktop / Web App</p>
                      <p className="text-[11px] text-[#AAAAAA]">
                        {pwaInstall.available
                          ? 'Install ListTube in its own standalone window directly from this browser.'
                          : 'Use your browser address bar "Install app" icon (or Add to Home Screen) anytime.'}
                      </p>
                    </div>
                    {pwaInstall.available && (
                      <button
                        type="button"
                        onClick={() => {
                          void pwaInstall.trigger().then((res) => {
                            if (res === 'accepted') toast('ListTube installed!');
                          });
                        }}
                        className="lt-press inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[12px] font-bold text-black hover:bg-neutral-200"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Install App
                      </button>
                    )}
                  </div>
                )}

                {!isNativeCapacitor() && (
                  <div className="space-y-2.5 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                    <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[#CCCCCC]">
                      <Keyboard className="h-3.5 w-3.5 text-[#3EA6FF]" />
                      Website Keyboard Shortcuts
                    </p>
                    <div className="grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
                      {[
                        { keys: '⌘K / Ctrl+K', action: 'Open Quick Command Palette' },
                        { keys: '/', action: 'Focus Global Search' },
                        { keys: '?', action: 'Open Shortcuts & Palette' },
                        { keys: 'E', action: 'Watch Page: Log +1 Episode' },
                        { keys: 'T', action: 'Watch Page: Toggle Theater' },
                        { keys: 'Esc', action: 'Close Modals or Go Back' },
                      ].map((s) => (
                        <div
                          key={s.keys}
                          className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2"
                        >
                          <span className="text-[#CCCCCC]">{s.action}</span>
                          <kbd className="rounded-md border border-white/15 bg-white/10 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                            {s.keys}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className={`flex items-center justify-between border-t border-white/[0.08] px-5 py-3.5 sm:px-6 ${pageMode ? 'pb-24 sm:pb-4' : ''}`}>
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
    </div>
  );
};
