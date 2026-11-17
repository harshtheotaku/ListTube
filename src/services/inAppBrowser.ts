import { useSyncExternalStore } from 'react';
import { isNativeCapacitor } from './platform';

export interface InAppBrowserTarget {
  url: string;
  title: string;
  sourceName: string;
  mediaType?: 'ANIME' | 'MANGA';
}

declare global {
  interface Window {
    ListTubeNative?: {
      exitApp?: () => void;
      openInAppBrowser?: (url: string, title: string) => void;
    };
  }
}

let activeWebViewer: InAppBrowserTarget | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/**
 * Opens an external reading/watching link inside ListTube's native Ad/Redirect-Guarded
 * Android WebView on Capacitor APK, or inside the web fallback viewer sheet on browsers.
 */
export function openInAppViewer(target: InAppBrowserTarget): void {
  if (
    isNativeCapacitor() &&
    typeof window !== 'undefined' &&
    typeof window.ListTubeNative?.openInAppBrowser === 'function'
  ) {
    window.ListTubeNative.openInAppBrowser(target.url, `${target.sourceName} · ${target.title}`);
    return;
  }

  activeWebViewer = target;
  emit();
}

export function closeInAppViewer(): void {
  activeWebViewer = null;
  emit();
}

export function useInAppViewer(): InAppBrowserTarget | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => activeWebViewer,
    () => activeWebViewer
  );
}
