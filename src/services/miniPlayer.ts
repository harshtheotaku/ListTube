import { useSyncExternalStore } from 'react';

export interface MiniPlayerTrack {
  label: string;
  youtubeId?: string;
  searchQuery?: string;
}

export interface MiniPlayerState {
  youtubeId?: string;
  searchQuery?: string;
  title: string;
  subtitle?: string;
  animeId?: string;
  minimized: boolean;
  queue?: MiniPlayerTrack[];
  queueIndex?: number;
}

let currentState: MiniPlayerState | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export const miniPlayer = {
  open(state: Omit<MiniPlayerState, 'minimized'>) {
    currentState = { ...state, minimized: false };
    emit();
  },
  toggleMinimize() {
    if (!currentState) return;
    currentState = { ...currentState, minimized: !currentState.minimized };
    emit();
  },
  nextTrack() {
    if (!currentState?.queue?.length) return;
    const nextIdx = ((currentState.queueIndex ?? 0) + 1) % currentState.queue.length;
    const next = currentState.queue[nextIdx];
    currentState = {
      ...currentState,
      youtubeId: next.youtubeId,
      searchQuery: next.searchQuery,
      subtitle: next.label,
      queueIndex: nextIdx,
    };
    emit();
  },
  close() {
    currentState = null;
    emit();
  },
  getSnapshot: () => currentState,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useMiniPlayer(): MiniPlayerState | null {
  return useSyncExternalStore(miniPlayer.subscribe, miniPlayer.getSnapshot, miniPlayer.getSnapshot);
}
