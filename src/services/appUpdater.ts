import { useSyncExternalStore } from 'react';
import { isNativeCapacitor } from './platform';

export const APP_VERSION = '1.3.6';
export const GITHUB_RELEASES_API =
  'https://api.github.com/repos/harshtheotaku/ListTube/releases/latest';
export const GITHUB_LATEST_APK_URL =
  'https://github.com/harshtheotaku/ListTube/releases/latest/download/ListTube-android.apk';

const LAST_CHECK_KEY = 'listtube.updater.lastAt.v1';
const DISMISSED_TAG_KEY = 'listtube.updater.dismissedTag.v1';
const AUTO_TRIGGERED_TAG_KEY = 'listtube.updater.autoTriggered.v1';

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  apkUrl: string;
  releaseUrl: string;
  publishedAt?: string;
  releaseNotes?: string;
  assetSizeBytes?: number;
}

export type UpdateDownloadState =
  | 'idle'
  | 'downloading'
  | 'downloaded'
  | 'needs_permission'
  | 'installing'
  | 'error';

export interface AppUpdateRuntimeState {
  info: AppUpdateInfo | null;
  checking: boolean;
  downloadState: UpdateDownloadState;
  downloadProgress: number;
  statusMessage: string;
  bannerDismissed: boolean;
}

const listeners = new Set<() => void>();
const initialHasCachedApk =
  typeof window !== 'undefined' &&
  typeof window.ListTubeNative?.hasDownloadedUpdateApk === 'function' &&
  Boolean(window.ListTubeNative.hasDownloadedUpdateApk());

const initialDismissedCached =
  typeof localStorage !== 'undefined' && localStorage.getItem(DISMISSED_TAG_KEY) === 'cached';

let runtimeState: AppUpdateRuntimeState = {
  info: null,
  checking: false,
  downloadState: initialHasCachedApk ? 'downloaded' : 'idle',
  downloadProgress: initialHasCachedApk ? 100 : 0,
  statusMessage: initialHasCachedApk ? 'Update APK downloaded — tap Install In-App to apply.' : '',
  bannerDismissed: initialDismissedCached,
};

function emit() {
  listeners.forEach((l) => l());
}

function patchState(patch: Partial<AppUpdateRuntimeState>) {
  runtimeState = { ...runtimeState, ...patch };
  emit();
}

export function getAppUpdateSnapshot(): AppUpdateRuntimeState {
  return runtimeState;
}

export function useAppUpdateState(): AppUpdateRuntimeState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => runtimeState,
    () => runtimeState
  );
}

export function getEffectiveAppVersion(): string {
  if (typeof window === 'undefined') return APP_VERSION;
  try {
    const raw = window.ListTubeNative?.getAppVersionInfo?.();
    if (raw) {
      const parsed = JSON.parse(raw) as { versionName?: string };
      if (parsed.versionName && parsed.versionName.trim()) {
        return parsed.versionName.trim().replace(/^v/i, '');
      }
    }
  } catch {
    /* ignore */
  }
  return APP_VERSION;
}

function ensureNativeProgressListener() {
  if (typeof window === 'undefined') return;
  window.__listtubeUpdateProgress = (payload) => {
    const rawStatus = payload?.status;
    const downloadState: UpdateDownloadState =
      rawStatus === 'downloading' ||
      rawStatus === 'downloaded' ||
      rawStatus === 'needs_permission' ||
      rawStatus === 'installing' ||
      rawStatus === 'error'
        ? rawStatus
        : 'idle';
    patchState({
      downloadState,
      downloadProgress: Number.isFinite(Number(payload?.progress))
        ? Math.max(0, Math.min(100, Number(payload?.progress)))
        : runtimeState.downloadProgress,
      statusMessage: typeof payload?.message === 'string' ? payload.message : '',
      bannerDismissed: false,
    });
  };
}

ensureNativeProgressListener();

function parseVersionParts(raw: string): { nums: number[]; isPre: boolean } {
  const cleaned = raw.trim().replace(/^v/i, '');
  const [core, pre] = cleaned.split('-', 2);
  const nums = core.split('.').map((n) => Number.parseInt(n, 10) || 0);
  while (nums.length < 3) nums.push(0);
  return { nums, isPre: Boolean(pre && pre.length > 0) };
}

/**
 * Returns > 0 when candidate is newer than baseline, 0 if equal, < 0 if older.
 */
export function compareSemver(candidate: string, baseline: string): number {
  const a = parseVersionParts(candidate);
  const b = parseVersionParts(baseline);
  for (let i = 0; i < Math.max(a.nums.length, b.nums.length); i += 1) {
    const diff = (a.nums[i] ?? 0) - (b.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (a.isPre !== b.isPre) return a.isPre ? -1 : 1;
  return 0;
}

export async function checkForGitHubUpdate(force = false): Promise<AppUpdateInfo | null> {
  if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return null;
  }

  try {
    if (!force) {
      const lastAt = Number(localStorage.getItem(LAST_CHECK_KEY) || 0);
      if (Date.now() - lastAt < 12 * 3_600_000) return runtimeState.info;
    }
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  } catch {
    /* ignore storage limits */
  }

  patchState({ checking: true });
  try {
    const res = await fetch(GITHUB_RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
      published_at?: string;
      body?: string;
      assets?: { name?: string; browser_download_url?: string; size?: number }[];
    };
    const tag = (data.tag_name ?? '').trim();
    if (!tag) return null;

    const apkAsset = (data.assets ?? []).find(
      (a) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.apk')
    );

    const currentVersion = getEffectiveAppVersion();
    const latestVersion = tag.replace(/^v/i, '');
    const updateAvailable = compareSemver(tag, currentVersion) > 0;
    const info: AppUpdateInfo = {
      currentVersion,
      latestVersion,
      updateAvailable,
      apkUrl: apkAsset?.browser_download_url || GITHUB_LATEST_APK_URL,
      releaseUrl: data.html_url || 'https://github.com/harshtheotaku/ListTube/releases/latest',
      publishedAt: data.published_at,
      releaseNotes: typeof data.body === 'string' ? data.body.trim().slice(0, 260) : undefined,
      assetSizeBytes: typeof apkAsset?.size === 'number' ? apkAsset.size : undefined,
    };

    if (!updateAvailable) {
      window.ListTubeNative?.clearDownloadedUpdateApk?.();
      patchState({
        info,
        downloadState: 'idle',
        downloadProgress: 0,
        statusMessage: '',
        bannerDismissed: true,
      });
    } else {
      patchState({
        info,
        bannerDismissed: isUpdateBannerDismissed(latestVersion),
      });
    }
    return info;
  } catch {
    return null;
  } finally {
    patchState({ checking: false });
  }
}

export function canInstallInAppNative(): boolean {
  return (
    isNativeCapacitor() &&
    typeof window !== 'undefined' &&
    typeof window.ListTubeNative?.downloadAndInstallApk === 'function'
  );
}

export function downloadInAppUpdateOnly(target?: AppUpdateInfo | null): boolean {
  const info = target ?? runtimeState.info;
  const apkUrl = info?.apkUrl || GITHUB_LATEST_APK_URL;
  const targetVer = info?.latestVersion || APP_VERSION;

  if (isNativeCapacitor() && typeof window !== 'undefined' && window.ListTubeNative?.downloadApkOnly) {
    ensureNativeProgressListener();
    patchState({
      downloadState: 'downloading',
      downloadProgress: 2,
      statusMessage: `Downloading v${targetVer} inside app…`,
      bannerDismissed: false,
    });
    window.ListTubeNative.downloadApkOnly(apkUrl, targetVer);
    return true;
  }

  if (typeof window !== 'undefined') {
    window.open(apkUrl, '_blank', 'noopener,noreferrer');
  }
  return false;
}

export function triggerInAppUpdate(target?: AppUpdateInfo | null): boolean {
  const info = target ?? runtimeState.info;
  const apkUrl = info?.apkUrl || GITHUB_LATEST_APK_URL;
  const targetVer = info?.latestVersion || APP_VERSION;

  if (canInstallInAppNative() && window.ListTubeNative?.downloadAndInstallApk) {
    ensureNativeProgressListener();
    if (runtimeState.downloadState === 'downloaded' && window.ListTubeNative?.installPendingUpdate) {
      window.ListTubeNative.installPendingUpdate();
      return true;
    }
    patchState({
      downloadState: 'downloading',
      downloadProgress: 2,
      statusMessage: `Starting in-app download for v${targetVer}…`,
      bannerDismissed: false,
    });
    window.ListTubeNative.downloadAndInstallApk(apkUrl, targetVer);
    return true;
  }

  // Web/PWA path: refresh service worker cleanly; otherwise open direct APK download
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
  }
  if (typeof window !== 'undefined') {
    window.open(apkUrl, '_blank', 'noopener,noreferrer');
  }
  return false;
}

export function openInstallPermissionSettings(): void {
  if (typeof window !== 'undefined') {
    window.ListTubeNative?.openInstallUnknownAppsSettings?.();
  }
}

export function retryPendingInstall(): void {
  if (typeof window !== 'undefined') {
    window.ListTubeNative?.installPendingUpdate?.();
  }
}

export async function maybeAutoCheckAndInstallUpdate(autoUpdateEnabled: boolean): Promise<AppUpdateInfo | null> {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
  }

  const info = await checkForGitHubUpdate(false);
  if (!info || !info.updateAvailable) return info;

  if (autoUpdateEnabled && canInstallInAppNative()) {
    try {
      const alreadyAutoTriggered = localStorage.getItem(AUTO_TRIGGERED_TAG_KEY);
      if (alreadyAutoTriggered !== info.latestVersion) {
        localStorage.setItem(AUTO_TRIGGERED_TAG_KEY, info.latestVersion);
        triggerInAppUpdate(info);
      }
    } catch {
      /* ignore */
    }
  }
  return info;
}

export function isUpdateBannerDismissed(version: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(DISMISSED_TAG_KEY) === version;
}

export function dismissUpdateBanner(version: string): void {
  patchState({ bannerDismissed: true });
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DISMISSED_TAG_KEY, version);
  } catch {
    /* ignore */
  }
}
