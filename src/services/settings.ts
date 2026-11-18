import { useSyncExternalStore } from 'react';
import {
  Anime,
  AppSettings,
  CardDensity,
  ContentFilterLevel,
  DefaultStartupTab,
  ExternalLinkMode,
  FontStylePreset,
  ListStatus,
  MediaType,
  ProfileVisibilitySettings,
  ScoreFormat,
  ThemeColors,
  ThemePreset,
  TitleLanguage,
} from '../types';

const SETTINGS_KEY = 'anitube.settings.v2';
const LEGACY_SETTINGS_KEY = 'anitube.settings.v1';

export const PRESET_THEME_COLORS: Record<Exclude<ThemePreset, 'custom'>, ThemeColors> = {
  main: { bg: '#0F0F0F', text: '#F1F1F1', accent: '#FF0000' },
  dark: { bg: '#000000', text: '#FFFFFF', accent: '#3EA6FF' },
  light: { bg: '#F4F4F7', text: '#111115', accent: '#FF0000' },
};

export const FONT_STACKS: Record<FontStylePreset, string> = {
  default:
    '"Inter Variable", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
  rounded:
    '"Plus Jakarta Sans Variable", "SF Pro Rounded", ui-rounded, -apple-system, BlinkMacSystemFont, sans-serif',
  serif:
    '"Newsreader Variable", "New York", Georgia, "Times New Roman", serif',
  mono:
    '"JetBrains Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

export const DEFAULT_SETTINGS: AppSettings = {
  autoplayTrailer: false,
  scoreFormat: 'POINT_10_DECIMAL',
  showCommunityLinks: true,
  liquidGlass: true,
  liquidGlassOpacity: 65,
  themePreset: 'main',
  themeColors: { ...PRESET_THEME_COLORS.main },
  fontFamily: 'default',
  reduceMotion: false,
  reduceBlur: false,
  disableBlend: false,
  autoHideBars: true,
  ambientMode: true,
  dimAmbientOnScroll: true,
  autoSkipFillerNotice: true,
  externalLinkMode: 'external',
  contentFilter: 'balanced',
  blockedGenres: [],
  showHomeForYou: true,
  showHomeSubscriptions: true,
  showHomeDiscoveryShelves: true,
  homeStatusFolders: ['watching'],
  autoLoadComments: true,
  autoClearCache: true,
  notifyFolders: ['watching', 'planned'],
  notifyCommentLikes: true,
  profileVisibility: {
    hideActivity: false,
    hideStats: false,
    hideLists: false,
    hideFavorites: false,
  },
  titleLanguage: 'english',
  cardDensity: 'comfortable',
  confirmBeforeRemove: false,
  hideSpoilers: false,
  defaultMediaType: 'ANIME',
  defaultTab: 'home',
  defaultTrailerMuted: false,
  hapticsEnabled: true,
  digestMode: false,
  quietHoursEnabled: false,
};

function mergeSettings(raw: Partial<AppSettings>): AppSettings {
  const preset: ThemePreset =
    raw.themePreset && ['main', 'dark', 'light', 'custom'].includes(raw.themePreset)
      ? raw.themePreset
      : 'main';
  const baseColors =
    preset === 'custom'
      ? raw.themeColors ?? PRESET_THEME_COLORS.main
      : PRESET_THEME_COLORS[preset];
  const externalLinkMode: ExternalLinkMode =
    raw.externalLinkMode && ['external', 'ask', 'inapp'].includes(raw.externalLinkMode)
      ? raw.externalLinkMode
      : 'external';
  const fontFamily: FontStylePreset =
    raw.fontFamily && ['default', 'rounded', 'serif', 'mono'].includes(raw.fontFamily)
      ? raw.fontFamily
      : 'default';

  return {
    autoplayTrailer: Boolean(raw.autoplayTrailer ?? DEFAULT_SETTINGS.autoplayTrailer),
    scoreFormat: raw.scoreFormat ?? DEFAULT_SETTINGS.scoreFormat,
    showCommunityLinks:
      raw.showCommunityLinks !== undefined
        ? Boolean(raw.showCommunityLinks)
        : DEFAULT_SETTINGS.showCommunityLinks,
    liquidGlass:
      raw.liquidGlass !== undefined ? Boolean(raw.liquidGlass) : DEFAULT_SETTINGS.liquidGlass,
    liquidGlassOpacity: Number.isFinite(Number(raw.liquidGlassOpacity))
      ? Math.max(15, Math.min(95, Math.round(Number(raw.liquidGlassOpacity))))
      : DEFAULT_SETTINGS.liquidGlassOpacity,
    themePreset: preset,
    themeColors: {
      bg: baseColors.bg || PRESET_THEME_COLORS.main.bg,
      text: baseColors.text || PRESET_THEME_COLORS.main.text,
      accent: baseColors.accent || PRESET_THEME_COLORS.main.accent,
    },
    fontFamily,
    reduceMotion: Boolean(raw.reduceMotion ?? false),
    reduceBlur: Boolean(raw.reduceBlur ?? false),
    disableBlend: Boolean(raw.disableBlend ?? false),
    autoHideBars:
      raw.autoHideBars !== undefined ? Boolean(raw.autoHideBars) : true,
    ambientMode:
      raw.ambientMode !== undefined ? Boolean(raw.ambientMode) : true,
    dimAmbientOnScroll:
      raw.dimAmbientOnScroll !== undefined ? Boolean(raw.dimAmbientOnScroll) : true,
    autoSkipFillerNotice:
      raw.autoSkipFillerNotice !== undefined ? Boolean(raw.autoSkipFillerNotice) : true,
    externalLinkMode,
    contentFilter:
      raw.contentFilter && ['safe', 'balanced', 'mature'].includes(raw.contentFilter)
        ? raw.contentFilter
        : 'balanced',
    blockedGenres: Array.isArray(raw.blockedGenres)
      ? raw.blockedGenres.filter((x): x is string => typeof x === 'string')
      : [],
    showHomeForYou:
      raw.showHomeForYou !== undefined ? Boolean(raw.showHomeForYou) : true,
    showHomeSubscriptions:
      raw.showHomeSubscriptions !== undefined ? Boolean(raw.showHomeSubscriptions) : true,
    showHomeDiscoveryShelves:
      raw.showHomeDiscoveryShelves !== undefined ? Boolean(raw.showHomeDiscoveryShelves) : true,
    homeStatusFolders:
      Array.isArray(raw.homeStatusFolders) && raw.homeStatusFolders.length > 0
        ? raw.homeStatusFolders
        : ['watching'],
    autoLoadComments:
      raw.autoLoadComments !== undefined ? Boolean(raw.autoLoadComments) : true,
    autoClearCache:
      raw.autoClearCache !== undefined ? Boolean(raw.autoClearCache) : true,
    notifyFolders:
      Array.isArray(raw.notifyFolders) ? raw.notifyFolders : ['watching', 'planned'],
    notifyCommentLikes:
      raw.notifyCommentLikes !== undefined ? Boolean(raw.notifyCommentLikes) : true,
    profileVisibility: {
      hideActivity: Boolean(raw.profileVisibility?.hideActivity),
      hideStats: Boolean(raw.profileVisibility?.hideStats),
      hideLists: Boolean(raw.profileVisibility?.hideLists),
      hideFavorites: Boolean(raw.profileVisibility?.hideFavorites),
    },
    titleLanguage:
      raw.titleLanguage && ['english', 'romaji', 'native'].includes(raw.titleLanguage)
        ? (raw.titleLanguage as TitleLanguage)
        : 'english',
    cardDensity:
      raw.cardDensity && ['comfortable', 'compact'].includes(raw.cardDensity)
        ? (raw.cardDensity as CardDensity)
        : 'comfortable',
    confirmBeforeRemove: Boolean(raw.confirmBeforeRemove ?? false),
    hideSpoilers: Boolean(raw.hideSpoilers ?? false),
    defaultMediaType: raw.defaultMediaType === 'MANGA' ? 'MANGA' : 'ANIME',
    defaultTab:
      raw.defaultTab && ['home', 'explore', 'list', 'schedule'].includes(raw.defaultTab)
        ? (raw.defaultTab as DefaultStartupTab)
        : 'home',
    defaultTrailerMuted: Boolean(raw.defaultTrailerMuted ?? false),
    hapticsEnabled:
      raw.hapticsEnabled !== undefined ? Boolean(raw.hapticsEnabled) : true,
    digestMode: Boolean(raw.digestMode ?? false),
    quietHoursEnabled: Boolean(raw.quietHoursEnabled ?? false),
  };
}

function loadSettings(): AppSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw =
      localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return mergeSettings(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function applyThemeToDocument(s: AppSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const glassPct = Math.max(15, Math.min(95, Math.round(s.liquidGlassOpacity ?? 65)));
  const darkTop = (0.04 + (glassPct / 100) * 0.14).toFixed(3);
  const darkBot = (0.14 + (glassPct / 100) * 0.74).toFixed(3);
  const lightTop = (0.44 + (glassPct / 100) * 0.54).toFixed(3);
  const lightBot = (0.28 + (glassPct / 100) * 0.64).toFixed(3);

  root.style.setProperty('--lt-bg', s.themeColors.bg);
  root.style.setProperty('--lt-text', s.themeColors.text);
  root.style.setProperty('--lt-accent', s.themeColors.accent);
  root.style.setProperty('--lt-glass-top', darkTop);
  root.style.setProperty('--lt-glass-bot', darkBot);
  root.style.setProperty('--lt-glass-light-top', lightTop);
  root.style.setProperty('--lt-glass-light-bot', lightBot);
  root.style.setProperty('--font-sans', FONT_STACKS[s.fontFamily] ?? FONT_STACKS.default);
  root.dataset.theme = s.themePreset === 'light' ? 'light' : 'dark';
  root.dataset.liquidGlass = s.liquidGlass ? '1' : '0';
  root.dataset.glassOpacity = String(glassPct);
  root.dataset.reduceMotion = s.reduceMotion ? '1' : '0';
  root.dataset.reduceBlur = s.reduceBlur ? '1' : '0';
  root.dataset.disableBlend = s.disableBlend ? '1' : '0';
}

let currentSettings = loadSettings();
applyThemeToDocument(currentSettings);
const listeners = new Set<() => void>();

function persist(next: AppSettings) {
  currentSettings = next;
  applyThemeToDocument(next);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export const settingsStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): AppSettings {
    return currentSettings;
  },
  update(patch: Partial<AppSettings>) {
    persist(mergeSettings({ ...currentSettings, ...patch }));
  },
  setAutoplayTrailer(enabled: boolean) {
    persist({ ...currentSettings, autoplayTrailer: enabled });
  },
  setScoreFormat(scoreFormat: ScoreFormat) {
    persist({ ...currentSettings, scoreFormat });
  },
  setShowCommunityLinks(showCommunityLinks: boolean) {
    persist({ ...currentSettings, showCommunityLinks });
  },
  setLiquidGlass(liquidGlass: boolean) {
    persist({ ...currentSettings, liquidGlass });
  },
  setThemePreset(themePreset: ThemePreset) {
    const nextColors =
      themePreset === 'custom'
        ? currentSettings.themeColors
        : { ...PRESET_THEME_COLORS[themePreset] };
    persist({ ...currentSettings, themePreset, themeColors: nextColors });
  },
  setThemeColors(colors: Partial<ThemeColors>) {
    persist({
      ...currentSettings,
      themePreset: 'custom',
      themeColors: { ...currentSettings.themeColors, ...colors },
    });
  },
  resetTheme() {
    persist({
      ...currentSettings,
      themePreset: 'main',
      themeColors: { ...PRESET_THEME_COLORS.main },
    });
  },
  setContentFilter(contentFilter: ContentFilterLevel) {
    persist({ ...currentSettings, contentFilter });
  },
  toggleBlockedGenre(genre: string) {
    const exists = currentSettings.blockedGenres.includes(genre);
    const blockedGenres = exists
      ? currentSettings.blockedGenres.filter((g) => g !== genre)
      : [...currentSettings.blockedGenres, genre];
    persist({ ...currentSettings, blockedGenres });
  },
  toggleHomeStatusFolder(status: ListStatus) {
    const exists = currentSettings.homeStatusFolders.includes(status);
    const next = exists
      ? currentSettings.homeStatusFolders.filter((s) => s !== status)
      : [...currentSettings.homeStatusFolders, status];
    persist({ ...currentSettings, homeStatusFolders: next.length ? next : ['watching'] });
  },
  toggleNotifyFolder(status: ListStatus) {
    const exists = currentSettings.notifyFolders.includes(status);
    const next = exists
      ? currentSettings.notifyFolders.filter((s) => s !== status)
      : [...currentSettings.notifyFolders, status];
    persist({ ...currentSettings, notifyFolders: next });
  },
  updateProfileVisibility(patch: Partial<ProfileVisibilitySettings>) {
    persist({
      ...currentSettings,
      profileVisibility: { ...currentSettings.profileVisibility, ...patch },
    });
  },
  resetAllDefaults() {
    persist({ ...DEFAULT_SETTINGS, themeColors: { ...PRESET_THEME_COLORS.main } });
  },
  replaceFromCloud(next: Partial<AppSettings>) {
    persist(mergeSettings({ ...currentSettings, ...next }));
  },
};

export function useSettings(): AppSettings {
  return useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
    settingsStore.getSnapshot
  );
}

/**
 * Formats primary & secondary title lines respecting user's English / Romaji / Native preference.
 */
export function formatPreferredTitle(
  anime: Pick<Anime, 'title' | 'titleRomaji' | 'titleNative'>,
  pref: TitleLanguage = 'english'
): string {
  if (pref === 'romaji') return anime.titleRomaji || anime.title;
  if (pref === 'native') return anime.titleNative || anime.titleRomaji || anime.title;
  return anime.title;
}

export function formatSecondaryTitle(
  anime: Pick<Anime, 'title' | 'titleRomaji' | 'titleNative'>,
  pref: TitleLanguage = 'english'
): string | null {
  const primary = formatPreferredTitle(anime, pref);
  const alt = pref === 'english' ? anime.titleRomaji : anime.title;
  return alt && alt !== primary ? alt : null;
}

export function gridClassFor(mediaType: MediaType, density: CardDensity): string {
  if (mediaType === 'MANGA') {
    return density === 'compact'
      ? 'grid grid-cols-3 gap-x-2.5 gap-y-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'
      : 'grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5';
  }
  return density === 'compact'
    ? 'grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
    : 'grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const pwaListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    pwaListeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    pwaListeners.forEach((l) => l());
  });
}

export function usePwaInstallPrompt() {
  const available = useSyncExternalStore(
    (l) => {
      pwaListeners.add(l);
      return () => pwaListeners.delete(l);
    },
    () => Boolean(deferredInstallPrompt),
    () => false
  );
  return {
    available,
    async trigger(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
      if (!deferredInstallPrompt) return 'unavailable';
      await deferredInstallPrompt.prompt();
      const res = await deferredInstallPrompt.userChoice;
      if (res.outcome === 'accepted') {
        deferredInstallPrompt = null;
        pwaListeners.forEach((l) => l());
      }
      return res.outcome;
    },
  };
}
