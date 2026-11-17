import React, { useState } from 'react';
import {
  Check,
  GitCompare,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { LibraryState, statusLabel, TrackerAccount } from '../types';
import { animeStore } from '../services/animeStore';
import { library } from '../services/library';
import {
  buildLocalSnapshots,
  computeThreeWaySyncDiffs,
  ProviderSnapshotItem,
  ThreeWayDiffRow,
} from '../services/syncDiff';
import {
  importAniList,
  importAniListWithToken,
  importMyAnimeList,
} from '../services/trackers';
import { cloudSync, useCloudSync } from '../services/cloudSync';
import { fetchMalOAuthListEdge } from '../services/supabase';
import { toast } from './Toast';

interface SyncConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  libraryState: LibraryState;
  trackers: TrackerAccount[];
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  isOpen,
  onClose,
  libraryState,
  trackers,
}) => {
  const cloud = useCloudSync();
  const [busy, setBusy] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [diffs, setDiffs] = useState<ThreeWayDiffRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const runScan = async () => {
    setBusy(true);
    setError(null);
    try {
      const localItems = buildLocalSnapshots(libraryState, (id) => animeStore.get(id));
      let anilistItems: ProviderSnapshotItem[] = [];
      let malItems: ProviderSnapshotItem[] = [];

      const alTracker = trackers.find((t) => t.provider === 'anilist');
      const malTracker = trackers.find((t) => t.provider === 'mal');

      if (cloud.anilistWritebackToken) {
        const res = await importAniListWithToken(cloud.anilistWritebackToken).catch(() => null);
        if (res) {
          anilistItems = res.entries.map((e) => ({
            provider: 'anilist',
            animeId: e.anime.id,
            anilistId: e.anime.anilistId,
            malId: e.anime.malId,
            mediaType: e.anime.mediaType ?? 'ANIME',
            title: e.anime.title,
            cover: e.anime.cover,
            status: e.status,
            progress: e.progress ?? 0,
            score: e.score ?? 0,
          }));
        }
      } else if (alTracker?.username) {
        const res = await importAniList(alTracker.username).catch(() => null);
        if (res) {
          anilistItems = res.entries.map((e) => ({
            provider: 'anilist',
            animeId: e.anime.id,
            anilistId: e.anime.anilistId,
            malId: e.anime.malId,
            mediaType: e.anime.mediaType ?? 'ANIME',
            title: e.anime.title,
            cover: e.anime.cover,
            status: e.status,
            progress: e.progress ?? 0,
            score: e.score ?? 0,
          }));
        }
      }

      if (malTracker?.username) {
        const res = await importMyAnimeList(malTracker.username).catch(() => null);
        if (res) {
          malItems = res.entries.map((e) => ({
            provider: 'mal',
            animeId: e.anime.id,
            anilistId: e.anime.anilistId,
            malId: e.anime.malId,
            mediaType: e.anime.mediaType ?? 'ANIME',
            title: e.anime.title,
            cover: e.anime.cover,
            status: e.status,
            progress: e.progress ?? 0,
            score: e.score ?? 0,
          }));
        }
      } else if (cloud.malConnected) {
        // Fallback if user has MAL OAuth connected without public tracker label
        void fetchMalOAuthListEdge;
      }

      const computed = computeThreeWaySyncDiffs({
        localItems,
        anilistItems,
        malItems,
      });
      setDiffs(computed);
      setScanned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compare libraries');
    } finally {
      setBusy(false);
    }
  };

  const applyRow = (row: ThreeWayDiffRow) => {
    const localId =
      row.listtube?.animeId ?? row.anilist?.animeId ?? row.mal?.animeId ?? row.key;
    const snap = animeStore.get(localId) ?? {
      id: localId,
      mediaType: row.mediaType,
      source: 'anilist' as const,
      title: row.title,
      cover: row.cover || '',
      banner: '',
      description: '',
      genres: [],
      tags: [],
      studios: [],
      streaming: [],
      similar: [],
      fetchedAt: Date.now(),
    };
    animeStore.remember(snap);
    library.setStatus(snap, row.recommended.status);
    library.setProgress(snap.id, row.recommended.progress);
    if (row.recommended.score > 0) {
      library.setScore(snap.id, row.recommended.score);
    }
    setDiffs((prev) => prev.filter((d) => d.key !== row.key));
    toast(`Synced ${row.title} to Ep ${row.recommended.progress} (${statusLabel(row.recommended.status, row.mediaType)})`);
  };

  const applyAll = () => {
    for (const row of diffs) applyRow(row);
    void cloudSync.flushOutbox(true);
    toast('All conflicts resolved & queued for 2-way tracker write-back');
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="3-Way Sync Diff & Conflict Resolver"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/[0.12] bg-[#181818] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <GitCompare className="h-5 w-5 text-[#3EA6FF]" />
            <div>
              <h2 className="text-[15.5px] font-bold text-white">
                3-Way Sync Diff &amp; Conflict Resolver
              </h2>
              <p className="text-[11.5px] text-[#AAAAAA]">
                Compare ListTube, AniList, and MyAnimeList side-by-side and resolve mismatches.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conflict resolver"
            className="rounded-full p-1.5 text-[#AAAAAA] hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-[#121212] p-3.5">
            <div className="text-[12px] text-[#CCCCCC]">
              {trackers.length === 0 && !cloud.anilistWritebackToken
                ? 'Connect AniList or MyAnimeList first to scan live differences.'
                : 'Ready to scan linked AniList & MyAnimeList entries against ListTube.'}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={runScan}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#3EA6FF] px-4 py-1.5 text-[12px] font-bold text-black transition hover:bg-[#65B8FF] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {scanned ? 'Rescan Libraries' : 'Scan for Conflicts'}
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[12px] text-rose-200">
              {error}
            </div>
          )}

          {scanned && diffs.length === 0 && !error && (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-6 text-center">
              <Check className="mx-auto mb-2 h-6 w-6 text-emerald-400" />
              <p className="text-[14px] font-bold text-white">All connected lists are in sync!</p>
              <p className="mt-1 text-[12px] text-[#AAAAAA]">
                Zero status, progress, or score conflicts found across your linked trackers.
              </p>
            </div>
          )}

          {diffs.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-amber-300">
                  {diffs.length} conflict{diffs.length === 1 ? '' : 's'} detected
                </span>
                <button
                  type="button"
                  onClick={applyAll}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-[11.5px] font-bold text-black hover:bg-emerald-400"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Sync All to Highest Progress
                </button>
              </div>

              <div className="space-y-2.5">
                {diffs.slice(0, 40).map((row) => (
                  <div
                    key={row.key}
                    className="rounded-2xl border border-white/[0.08] bg-[#202020] p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {row.cover && (
                          <img
                            src={row.cover}
                            alt=""
                            className="h-14 w-10 shrink-0 rounded-lg object-cover bg-black"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-bold text-white">{row.title}</p>
                          <p className="text-[11px] text-amber-300">
                            {row.mismatchReasons.join(' · ')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => applyRow(row)}
                        className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-black hover:bg-neutral-200"
                      >
                        Use Recommended
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
                      {[
                        { label: 'ListTube', snap: row.listtube, cls: 'border-white/15 bg-black/30' },
                        { label: 'AniList', snap: row.anilist, cls: 'border-sky-500/25 bg-sky-500/10' },
                        { label: 'MAL', snap: row.mal, cls: 'border-indigo-400/25 bg-indigo-500/10' },
                      ].map((col) => (
                        <div key={col.label} className={`rounded-xl border px-2.5 py-2 ${col.cls}`}>
                          <p className="font-bold text-white">{col.label}</p>
                          {col.snap ? (
                            <p className="mt-0.5 text-[#CCCCCC]">
                              {statusLabel(col.snap.status, row.mediaType)} · Ep/Ch {col.snap.progress}
                              {col.snap.score ? ` · ★ ${col.snap.score}` : ''}
                            </p>
                          ) : (
                            <p className="mt-0.5 italic text-[#777777]">Not tracked</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
