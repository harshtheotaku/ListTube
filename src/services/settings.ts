import { useSyncExternalStore } from 'react';
import { AppSettings } from '../types';

const SETTINGS_KEY = 'anitube.settings.v1';

const DEFAULT_SETTINGS: AppSettings = {
  autoplayTrailer: false,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      autoplayTrailer: parsed.autoplayTrailer ?? false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let currentSettings = loadSettings();
const listeners = new Set<() => void>();

function persist(next: AppSettings) {
  currentSettings = next;
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
  setAutoplayTrailer(enabled: boolean) {
    persist({ ...currentSettings, autoplayTrailer: enabled });
  },
};

export function useSettings(): AppSettings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot);
}
