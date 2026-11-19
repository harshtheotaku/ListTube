import { useSyncExternalStore } from 'react';
import { isNativeCapacitor } from './platform';
import { settingsStore } from './settings';

export interface InAppBrowserTarget {
  url: string;
  title: string;
  sourceName: string;
  mediaType?: 'ANIME' | 'MANGA';
}

export interface InAppViewerSession {
  target: InAppBrowserTarget;
  phase: 'prompt' | 'browser';
}

declare global {
  interface Window {
    ListTubeNative?: {
      exitApp?: () => void;
      openInAppBrowser?: (url: string, title: string) => void;
      haptic?: (kind: string) => void;
      scheduleAiringAlert?: (id: string, title: string, body: string, triggerAtMs: number) => void;
      cancelAiringAlert?: (id: string) => void;
      getAppVersionInfo?: () => string;
      canRequestPackageInstalls?: () => boolean;
      hasDownloadedUpdateApk?: () => boolean;
      openInstallUnknownAppsSettings?: () => void;
      installPendingUpdate?: () => void;
      downloadApkOnly?: (apkUrl: string, targetVersion: string) => void;
      downloadAndInstallApk?: (apkUrl: string, targetVersion: string) => void;
    };
    __listtubeUpdateProgress?: (payload: {
      status?: string;
      progress?: number;
      message?: string;
    }) => void;
  }
}

let activeSession: InAppViewerSession | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function launchBuiltInBrowser(target: InAppBrowserTarget): void {
  if (
    isNativeCapacitor() &&
    typeof window !== 'undefined' &&
    typeof window.ListTubeNative?.openInAppBrowser === 'function'
  ) {
    activeSession = null;
    emit();
    window.ListTubeNative.openInAppBrowser(target.url, `${target.sourceName} · ${target.title}`);
    return;
  }
  activeSession = { target, phase: 'browser' };
  emit();
}

export function launchExternalBrowser(target: InAppBrowserTarget): void {
  activeSession = null;
  emit();
  if (typeof window !== 'undefined') {
    window.open(target.url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Opens watch/read links respecting `settings.externalLinkMode`:
 * - 'external' (default): launches the user's system browser directly
 * - 'inapp': launches the built-in guarded WebView / fallback viewer
 * - 'ask': shows a quick compact prompt asking External vs Built-in Guarded Browser
 */
export function openInAppViewer(target: InAppBrowserTarget): void {
  const mode = settingsStore.getSnapshot().externalLinkMode;
  if (mode === 'external') {
    launchExternalBrowser(target);
    return;
  }
  if (mode === 'inapp') {
    launchBuiltInBrowser(target);
    return;
  }
  activeSession = { target, phase: 'prompt' };
  emit();
}

export function closeInAppViewer(): void {
  activeSession = null;
  emit();
}

export function useInAppViewer(): InAppViewerSession | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => activeSession,
    () => activeSession
  );
}
