import { useSyncExternalStore } from 'react';
import { Anime } from '../types';
import { animeStore } from './animeStore';
import { fetchAiringSchedule, fetchSeasonal } from './anilist';
import { fetchSocialNotifications } from './community';
import { library } from './library';
import { fetchOfficialNewsFeed } from './news';
import { supabase } from './supabase';

export type MalNotificationKind = 'episodes' | 'sequels' | 'news' | 'milestones' | 'social';

export interface MalNotificationItem {
  id: string;
  kind: MalNotificationKind;
  title: string;
  subtitle: string;
  image?: string;
  timestamp: number;
  timeLabel: string;
  animeId?: string;
  externalUrl?: string;
  isTrackedMatch?: boolean;
  read: boolean;
}

export interface NotificationsSnapshot {
  items: MalNotificationItem[];
  unreadCount: number;
  loading: boolean;
  lastUpdated: number;
}

const NOTIF_STORAGE_KEY = 'listtube.notifications.v1';

interface StoredNotifMeta {
  readIds: string[];
}

function loadMeta(): StoredNotifMeta {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return { readIds: [] };
    const parsed = JSON.parse(raw) as Partial<StoredNotifMeta>;
    return { readIds: Array.isArray(parsed.readIds) ? parsed.readIds.slice(-300) : [] };
  } catch {
    return { readIds: [] };
  }
}

let storedMeta: StoredNotifMeta = loadMeta();
let rawItems: Omit<MalNotificationItem, 'read'>[] = [];
let loading = false;
let lastUpdated = 0;
let initialized = false;
let cachedSnap: NotificationsSnapshot | null = null;

const listeners = new Set<() => void>();

function saveMeta() {
  try {
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(storedMeta));
  } catch {
    /* ignore */
  }
}

function emit() {
  cachedSnap = null;
  listeners.forEach((l) => l());
}

function formatCountdown(airingAt: number): string {
  const diffSec = airingAt - Math.floor(Date.now() / 1000);
  if (diffSec <= 0) {
    const agoHrs = Math.max(1, Math.floor(-diffSec / 3600));
    return agoHrs < 24 ? `${agoHrs}h ago` : `${Math.floor(agoHrs / 24)}d ago`;
  }
  const hrs = Math.floor(diffSec / 3600);
  if (hrs < 1) return `in ${Math.max(1, Math.floor(diffSec / 60))}m`;
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${Math.floor(hrs / 24)}d`;
}

function getSnapshot(): NotificationsSnapshot {
  if (!cachedSnap) {
    const readSet = new Set(storedMeta.readIds);
    const items: MalNotificationItem[] = rawItems.map((item) => ({
      ...item,
      read: readSet.has(item.id),
    }));
    const unreadCount = items.filter((i) => !i.read).length;
    cachedSnap = { items, unreadCount, loading, lastUpdated };
  }
  return cachedSnap;
}

function buildLocalNotifications(): Omit<MalNotificationItem, 'read'>[] {
  const lib = library.getSnapshot();
  const out: Omit<MalNotificationItem, 'read'>[] = [];
  const seenIds = new Set<string>();
  const nowSec = Math.floor(Date.now() / 1000);

  const pushUnique = (item: Omit<MalNotificationItem, 'read'>) => {
    if (seenIds.has(item.id)) return;
    seenIds.add(item.id);
    out.push(item);
  };

  // 1. Tracked episodes nearing broadcast (from local cache + nextEpisode)
  for (const entry of Object.values(lib.entries)) {
    const media = animeStore.get(entry.animeId);
    if (!media) continue;

    if (
      media.nextEpisode &&
      (entry.status === 'watching' || entry.status === 'planned') &&
      media.nextEpisode.airingAt >= nowSec - 86400 &&
      media.nextEpisode.airingAt <= nowSec + 5 * 86400
    ) {
      pushUnique({
        id: `ep:${media.id}:${media.nextEpisode.number}`,
        kind: 'episodes',
        title: `Episode ${media.nextEpisode.number} · ${media.title}`,
        subtitle: `Airing schedule alert (${formatCountdown(media.nextEpisode.airingAt)})`,
        image: media.cover,
        timestamp: media.nextEpisode.airingAt * 1000,
        timeLabel: formatCountdown(media.nextEpisode.airingAt),
        animeId: media.id,
        isTrackedMatch: true,
      });
    }

    // 2. MAL Sequel / Adaptation Alerts for user's Completed / Watching titles
    if (entry.status === 'completed' || entry.status === 'watching') {
      for (const rel of media.similar ?? []) {
        if (
          (rel.relation === 'SEQUEL' || rel.relation === 'ADAPTATION' || rel.relation === 'SIDE_STORY') &&
          !lib.entries[rel.id]
        ) {
          pushUnique({
            id: `seq:${rel.id}`,
            kind: 'sequels',
            title: `${rel.relation === 'SEQUEL' ? 'Sequel' : 'Related'}: ${rel.title}`,
            subtitle: `Connected to ${media.title} on your list`,
            image: rel.cover,
            timestamp: Date.now() - 3600_000,
            timeLabel: 'MAL Alert',
            animeId: rel.id,
            isTrackedMatch: true,
          });
        }
      }
    }
  }

  // 3. List Milestones (MAL Achievement style)
  const completedCount = Object.values(lib.entries).filter((e) => e.status === 'completed').length;
  for (const milestone of [100, 50, 25, 10, 5]) {
    if (completedCount >= milestone) {
      pushUnique({
        id: `mile:comp:${milestone}`,
        kind: 'milestones',
        title: `Milestone Unlocked: ${milestone} Titles Completed!`,
        subtitle: `Your Taste DNA now draws from ${completedCount} finished series.`,
        timestamp: Date.now() - 86400_000,
        timeLabel: 'Achievement',
      });
      break;
    }
  }

  return out;
}

export const notificationsService = {
  init() {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;
    rawItems = buildLocalNotifications();
    emit();

    library.subscribe(() => {
      const localOnly = buildLocalNotifications();
      const networkItems = rawItems.filter((i) => !i.id.startsWith('ep:') && !i.id.startsWith('seq:') && !i.id.startsWith('mile:'));
      rawItems = [...localOnly, ...networkItems].sort(
        (a, b) => Number(Boolean(b.isTrackedMatch)) - Number(Boolean(a.isTrackedMatch)) || b.timestamp - a.timestamp
      );
      emit();
    });

    // Gentle initial background refresh after first paint
    setTimeout(() => {
      void notificationsService.refresh();
    }, 1800);
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot,

  async refresh(force = false): Promise<void> {
    if (loading) return;
    if (!force && lastUpdated > 0 && Date.now() - lastUpdated < 10 * 60 * 1000) return;

    loading = true;
    emit();

    try {
      const lib = library.getSnapshot();
      const base = buildLocalNotifications();
      const map = new Map<string, Omit<MalNotificationItem, 'read'>>(base.map((i) => [i.id, i]));

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;

      const [scheduleRes, seasonalRes, newsRes, socialRes] = await Promise.allSettled([
        fetchAiringSchedule(),
        fetchSeasonal(10, 'ANIME', 1),
        fetchOfficialNewsFeed(),
        uid ? fetchSocialNotifications(uid) : Promise.resolve([]),
      ]);

      // Tracked + Popular Airing Schedule alerts
      if (scheduleRes.status === 'fulfilled') {
        const nowSec = Math.floor(Date.now() / 1000);
        const trackedMatches: typeof scheduleRes.value = [];
        const fallbackAiring: typeof scheduleRes.value = [];

        for (const item of scheduleRes.value) {
          if (item.airingAt < nowSec - 86400 || item.airingAt > nowSec + 4 * 86400) continue;
          if (lib.entries[item.anime.id]) trackedMatches.push(item);
          else fallbackAiring.push(item);
        }

        const chosen = [...trackedMatches, ...fallbackAiring.slice(0, 5)].slice(0, 10);
        for (const row of chosen) {
          const id = `sched-notif:${row.anime.id}:${row.episode}`;
          const isTracked = Boolean(lib.entries[row.anime.id]);
          map.set(id, {
            id,
            kind: 'episodes',
            title: `Episode ${row.episode} · ${row.anime.title}`,
            subtitle: isTracked
              ? `In your list · Airs ${formatCountdown(row.airingAt)}`
              : `Seasonal broadcast · Airs ${formatCountdown(row.airingAt)}`,
            image: row.anime.cover,
            timestamp: row.airingAt * 1000,
            timeLabel: formatCountdown(row.airingAt),
            animeId: row.anime.id,
            isTrackedMatch: isTracked,
          });
        }
      }

      // Seasonal spotlight alert (if user doesn't track it yet)
      if (seasonalRes.status === 'fulfilled') {
        for (const s of seasonalRes.value.slice(0, 4)) {
          if (lib.entries[s.id]) continue;
          const id = `season-notif:${s.id}`;
          if (!map.has(id)) {
            map.set(id, {
              id,
              kind: 'sequels',
              title: `Seasonal Spotlight: ${s.title}`,
              subtitle: `${s.season ?? 'Current'} ${s.year ?? ''} · ${s.score ? `${s.score.toFixed(1)}★` : 'Popular'}`,
              image: s.cover,
              timestamp: Date.now() - 7200_000,
              timeLabel: 'This Season',
              animeId: s.id,
              isTrackedMatch: false,
            });
          }
        }
      }

      // MAL & ANN News alerts
      if (newsRes.status === 'fulfilled') {
        for (const story of newsRes.value.slice(0, 6)) {
          const id = `news-notif:${story.id}`;
          map.set(id, {
            id,
            kind: 'news',
            title: story.title,
            subtitle: story.sourceName,
            image: story.image,
            timestamp: Date.parse(story.date) || Date.now() - 10800_000,
            timeLabel: story.sourceName,
            externalUrl: story.url,
            isTrackedMatch: false,
          });
        }
      }

      // Social Notifications (replies, follows)
      if (socialRes.status === 'fulfilled') {
        for (const soc of socialRes.value) {
          map.set(soc.id, {
            id: soc.id,
            kind: 'social',
            title: soc.title,
            subtitle: soc.subtitle,
            image: soc.avatar,
            timestamp: soc.createdAt,
            timeLabel: 'Community',
            isTrackedMatch: true,
          });
        }
      }

      rawItems = Array.from(map.values()).sort(
        (a, b) =>
          Number(Boolean(b.isTrackedMatch)) - Number(Boolean(a.isTrackedMatch)) ||
          b.timestamp - a.timestamp
      );
      lastUpdated = Date.now();
    } finally {
      loading = false;
      emit();
    }
  },

  markRead(id: string) {
    if (storedMeta.readIds.includes(id)) return;
    storedMeta = { readIds: [...storedMeta.readIds, id].slice(-300) };
    saveMeta();
    emit();
  },

  markAllRead() {
    const allIds = Array.from(new Set([...storedMeta.readIds, ...rawItems.map((i) => i.id)])).slice(-350);
    storedMeta = { readIds: allIds };
    saveMeta();
    emit();
  },

  ensureAnimeCached(id: string): Anime | undefined {
    return animeStore.get(id);
  },
};

notificationsService.init();

export function useNotifications(): NotificationsSnapshot {
  return useSyncExternalStore(
    notificationsService.subscribe,
    notificationsService.getSnapshot,
    notificationsService.getSnapshot
  );
}
