import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Cloud,
  Download,
  FileUp,
  GitCompare,
  Loader2,
  LogOut,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { TrackerAccount } from '../types';
import {
  buildAniListAuthorizeUrl,
  buildMalAuthorizeUrl,
  generatePkceVerifier,
  importAniList,
  importAniListWithToken,
  importFromExportFile,
  importMyAnimeList,
  storeMalPkceSession,
  TrackerImport,
} from '../services/trackers';
import { importComixOrMihonFile } from '../services/backupImport';
import { animeStore } from '../services/animeStore';
import { library } from '../services/library';
import { cloudSync, useCloudSync } from '../services/cloudSync';
import { useProfile } from '../services/profile';
import {
  fetchOAuthServerStatus,
  getOAuthRedirectUri,
  OAuthServerStatus,
} from '../services/supabase';
import { toast } from './Toast';

interface TrackersModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackers: TrackerAccount[];
  onImported: (count: number) => void;
  onOpenSyncDiff?: () => void;
}

type Provider = 'anilist' | 'mal';
type ModalTab = 'accounts' | 'import';

const CUSTOM_OAUTH_KEY = 'listtube.customOAuth.v1';

export const TrackersModal: React.FC<TrackersModalProps> = ({
  isOpen,
  onClose,
  trackers,
  onImported,
  onOpenSyncDiff,
}) => {
  const cloud = useCloudSync();
  const profile = useProfile();
  const [modalTab, setModalTab] = useState<ModalTab>('accounts');
  const [provider, setProvider] = useState<Provider>('anilist');
  const [username, setUsername] = useState('');
  const [showAdvancedOAuth, setShowAdvancedOAuth] = useState(false);
  const [anilistTokenInput, setAnilistTokenInput] = useState('');
  const [customAnilistClientId, setCustomAnilistClientId] = useState('');
  const [customMalClientId, setCustomMalClientId] = useState('');
  const [oauthStatus, setOauthStatus] = useState<OAuthServerStatus>({
    anilistConfigured: false,
    malConfigured: false,
  });
  const [googleBusy, setGoogleBusy] = useState<'google' | 'anilist' | 'mal' | false>(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackerImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setResult(null);
    setBusy(false);
    setGoogleBusy(false);
    setShowAdvancedOAuth(false);
    const existing = trackers[0];
    if (existing) {
      setProvider(existing.provider);
      setUsername(existing.username);
    }
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOM_OAUTH_KEY) ?? '{}') as {
        anilistClientId?: string;
        malClientId?: string;
      };
      if (saved.anilistClientId) setCustomAnilistClientId(saved.anilistClientId);
      if (saved.malClientId) setCustomMalClientId(saved.malClientId);
    } catch {
      /* ignore */
    }
    void fetchOAuthServerStatus().then(setOauthStatus);
  }, [isOpen, trackers]);

  if (!isOpen) return null;

  const commitImport = (imported: TrackerImport) => {
    animeStore.rememberImported(imported.entries.map((entry) => entry.anime));
    library.importEntries(
      imported.entries.map((entry) => ({
        anime: entry.anime,
        status: entry.status,
        score: entry.score,
        progress: entry.progress,
        progressVolumes: entry.progressVolumes,
        repeat: entry.repeat,
        startedAt: entry.startedAt,
        completedAt: entry.completedAt,
        notes: entry.notes,
        customLists: entry.customLists,
        priority: entry.priority,
      })),
      imported.account
    );
    setResult(imported);
    toast(`Connected ${imported.entries.length} titles — feed & stats updated!`);
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleBusy('google');
    try {
      await cloudSync.signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      setGoogleBusy(false);
    }
  };

  const handleOAuthLogin = (target: Provider) => {
    setError(null);
    const redirectUri = getOAuthRedirectUri();
    if (target === 'anilist') {
      const clientId = (customAnilistClientId || oauthStatus.anilistClientId || '57274').trim();
      if (customAnilistClientId.trim()) {
        localStorage.setItem(
          CUSTOM_OAUTH_KEY,
          JSON.stringify({
            anilistClientId: customAnilistClientId.trim(),
            malClientId: customMalClientId.trim(),
          })
        );
      }
      setGoogleBusy('anilist');
      const useImplicit = !oauthStatus.anilistCodeFlowReady;
      window.location.href = buildAniListAuthorizeUrl({
        clientId,
        redirectUri,
        useImplicit,
        state: `anilist:${crypto.randomUUID?.() ?? Date.now()}`,
      });
      return;
    }

    const malClientId = (
      customMalClientId ||
      oauthStatus.malClientId ||
      'f74fba547b6b04cdb063b1ef1bfc76a3'
    ).trim();
    if (customMalClientId.trim()) {
      localStorage.setItem(
        CUSTOM_OAUTH_KEY,
        JSON.stringify({
          anilistClientId: customAnilistClientId.trim(),
          malClientId: customMalClientId.trim(),
        })
      );
    }
    setGoogleBusy('mal');
    const verifier = generatePkceVerifier(64);
    const state = `mal:${crypto.randomUUID?.() ?? Date.now()}`;
    storeMalPkceSession(verifier, state, malClientId);
    window.location.href = buildMalAuthorizeUrl({
      clientId: malClientId,
      redirectUri,
      codeChallenge: verifier,
      state,
    });
  };

  const submitUsername = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim()) {
      setError('Enter a username or paste your profile URL.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const imported =
        provider === 'anilist'
          ? await importAniList(username)
          : await importMyAnimeList(username);
      commitImport(imported);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not connect this username. Ensure your list is public.'
      );
    } finally {
      setBusy(false);
    }
  };

  const submitToken = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!anilistTokenInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const imported = await importAniListWithToken(anilistTokenInput);
      cloudSync.setAniListWritebackToken(anilistTokenInput);
      await cloudSync.bridgeAniListToken(anilistTokenInput).catch(() => {});
      commitImport(imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AniList token connect failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.tachibk') || lower.endsWith('.proto.gz') || lower.endsWith('.gz') || lower.endsWith('.csv')) {
        const imported = await importComixOrMihonFile(file);
        commitImport(imported);
        return;
      }
      const text = await file.text();
      if (lower.endsWith('.json')) {
        const parsed = JSON.parse(text) as { entries?: Record<string, unknown>; updatedAt?: number };
        if (parsed && parsed.entries && typeof parsed.updatedAt === 'number') {
          localStorage.setItem('anitube.library.v1', text);
          window.location.reload();
          return;
        }
        const imported = await importComixOrMihonFile(file);
        commitImport(imported);
        return;
      }
      const imported = await importFromExportFile(text);
      commitImport(imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse export file.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDisconnect = (providerToDisconnect: Provider) => {
    library.disconnectTracker(providerToDisconnect);
    if (providerToDisconnect === 'anilist') cloudSync.setAniListWritebackToken('');
    if (providerToDisconnect === 'mal') cloudSync.clearMalOAuthTokens();
    setUsername('');
    setResult(null);
    toast(`Disconnected ${providerToDisconnect === 'mal' ? 'MyAnimeList' : 'AniList'}`);
  };

  const breakdown = result
    ? result.entries.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.status] = (acc[entry.status] ?? 0) + 1;
        return acc;
      }, {})
    : {};

  const activeConnected = trackers.find((t) => t.provider === provider);
  const cloudLabel = cloud.userEmail?.includes('anilist.')
    ? 'AniList Cloud Account'
    : cloud.userEmail?.includes('mal.')
      ? 'MyAnimeList Cloud Account'
      : cloud.userEmail || 'Synced Cloud Account';

  return (
    <div
      className="lt-backdrop-in fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tracker-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="liquid-glass lt-sheet-up flex max-h-[92vh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-[30px] border border-white/[0.16] text-white sm:rounded-[28px]">
        {/* Apple Sheet Drag Handle + Header */}
        <div className="border-b border-white/[0.08] px-6 pb-4 pt-3.5">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/25 sm:hidden" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                className="h-10 w-10 rounded-full border border-white/20 object-cover shadow"
              />
              <div>
                <h2 id="tracker-title" className="text-[16px] font-bold tracking-tight text-white">
                  Account &amp; Sync
                </h2>
                <p className="text-[11.5px] text-[#AAAAAA]">
                  {cloud.isLinked ? cloudLabel : 'Sign in or link your anime trackers'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.1] text-[#CCCCCC] transition hover:bg-white/[0.2] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Apple Segmented Control */}
          {!result && (
            <div className="mt-4 grid grid-cols-2 rounded-2xl bg-black/35 p-1 ring-1 ring-white/[0.08]">
              {(
                [
                  { id: 'accounts', label: 'Sign In & OAuth' },
                  { id: 'import', label: 'Username & Files' },
                ] as { id: ModalTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setModalTab(tab.id);
                    setError(null);
                  }}
                  className={`rounded-xl py-1.5 text-[12px] font-semibold transition ${
                    modalTab === tab.id
                      ? 'bg-white/[0.16] text-white shadow-sm'
                      : 'text-[#AAAAAA] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {result ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-3 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <Check className="h-6 w-6 stroke-[3]" />
                </span>
                <p className="text-[16px] font-bold text-white">
                  {result.entries.length} titles imported
                </p>
                <p className="text-[12px] text-[#AAAAAA]">
                  Recommendations, library stats &amp; feeds are now updated.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {['watching', 'completed', 'planned', 'on_hold', 'dropped']
                  .filter((status) => breakdown[status])
                  .map((status) => (
                    <div
                      key={status}
                      className="rounded-2xl border border-white/[0.08] bg-white/[0.05] p-2.5 text-center"
                    >
                      <p className="text-[16px] font-black text-white">{breakdown[status]}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                        {status.replace('_', ' ')}
                      </p>
                    </div>
                  ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  onImported(result.entries.length);
                  onClose();
                }}
                className="w-full rounded-2xl bg-white py-3 text-[13px] font-bold text-black transition hover:bg-neutral-200"
              >
                Continue to Home
              </button>
            </div>
          ) : modalTab === 'accounts' ? (
            <div className="space-y-4">
              {/* Cloud Status Row */}
              {cloud.userId ? (
                <div className="flex items-center justify-between rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                      <ShieldCheck className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-300">
                        Cloud Sync Active
                      </p>
                      <p className="truncate text-[13px] font-semibold text-white">{cloudLabel}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void cloudSync.signOut();
                      toast('Signed out of cloud sync');
                    }}
                    className="shrink-0 rounded-full bg-white/[0.08] px-3 py-1 text-[11.5px] font-semibold text-rose-300 transition hover:bg-rose-500/20"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(googleBusy)}
                  onClick={() => void handleGoogleLogin()}
                  className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-white py-3 text-[13.5px] font-semibold text-[#111111] shadow-lg transition hover:bg-neutral-100 active:scale-[0.99] disabled:opacity-50"
                >
                  {googleBusy === 'google' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                      />
                    </svg>
                  )}
                  <span>Continue with Google</span>
                </button>
              )}

              {/* Grouped Apple Settings-Style OAuth Trackers */}
              <div className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.04]">
                {/* AniList Row */}
                <button
                  type="button"
                  disabled={Boolean(googleBusy)}
                  onClick={() => handleOAuthLogin('anilist')}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.06] disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#02A9FF]/20 text-[12px] font-black text-[#38BDF8]">
                      AL
                    </span>
                    <div>
                      <p className="text-[13.5px] font-semibold text-white">
                        Sign in · AniList
                      </p>
                      <p className="text-[11px] text-[#AAAAAA]">
                        {cloud.anilistWritebackToken
                          ? '2-way OAuth write-back connected'
                          : 'Sync watchlists, scores & custom shelves'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {cloud.anilistWritebackToken && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        Active
                      </span>
                    )}
                    {googleBusy === 'anilist' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#AAAAAA]" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-[#777777]" />
                    )}
                  </div>
                </button>

                {/* MyAnimeList Row */}
                <button
                  type="button"
                  disabled={Boolean(googleBusy)}
                  onClick={() => handleOAuthLogin('mal')}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.06] disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2E51A2]/35 text-[11px] font-black text-[#93C5FD]">
                      MAL
                    </span>
                    <div>
                      <p className="text-[13.5px] font-semibold text-white">
                        Sign in · MAL
                      </p>
                      <p className="text-[11px] text-[#AAAAAA]">
                        {cloud.malConnected
                          ? '2-way PKCE OAuth connected'
                          : 'Import & auto-sync episodes and ratings'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {cloud.malConnected && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        Active
                      </span>
                    )}
                    {googleBusy === 'mal' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#AAAAAA]" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-[#777777]" />
                    )}
                  </div>
                </button>

                {/* 3-Way Sync Diff Row */}
                {onOpenSyncDiff && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSyncDiff();
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                        <GitCompare className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[13px] font-semibold text-white">
                          3-Way Sync Diff &amp; Resolver
                        </p>
                        <p className="text-[11px] text-[#AAAAAA]">
                          Compare ListTube, AniList &amp; MAL side-by-side
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#777777]" />
                  </button>
                )}
              </div>

              {cloud.pendingOutboxCount > 0 && (
                <div className="flex items-center justify-between rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-2.5 text-[11.5px]">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-amber-200">
                    <Cloud className="h-3.5 w-3.5" />
                    {cloud.pendingOutboxCount} update(s) queued offline
                  </span>
                  <button
                    type="button"
                    onClick={() => void cloudSync.flushOutbox(true)}
                    className="rounded-full bg-amber-400 px-3 py-1 text-[10.5px] font-bold text-black hover:bg-amber-300"
                  >
                    Sync Now
                  </button>
                </div>
              )}

              {error && (
                <p className="rounded-2xl bg-rose-500/15 px-3.5 py-2.5 text-[11.5px] font-medium text-rose-300">
                  {error}
                </p>
              )}
            </div>
          ) : (
            /* TAB 2: Username & Export File Import */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(['anilist', 'mal'] as Provider[]).map((id) => {
                  const active = provider === id;
                  const conn = trackers.find((t) => t.provider === id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setProvider(id);
                        setError(null);
                      }}
                      className={`rounded-2xl border p-3 text-left transition ${
                        active
                          ? 'border-white/35 bg-white/[0.12]'
                          : 'border-white/[0.08] bg-white/[0.04] opacity-75 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-white">
                          {id === 'anilist' ? 'AniList' : 'MyAnimeList'}
                        </span>
                        {conn && (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300">
                            Linked
                          </span>
                        )}
                      </div>
                      <span className="mt-0.5 block text-[10.5px] text-[#AAAAAA]">
                        Public profile import
                      </span>
                    </button>
                  );
                })}
              </div>

              <form onSubmit={submitUsername} className="flex gap-2">
                <div className="relative flex flex-1 items-center">
                  <User className="pointer-events-none absolute left-3 h-4 w-4 text-[#888888]" />
                  <input
                    id="tracker-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder={
                      provider === 'anilist'
                        ? 'AniList username…'
                        : 'MyAnimeList username…'
                    }
                    autoComplete="username"
                    className="h-11 w-full rounded-2xl border border-white/[0.12] bg-white/[0.06] pl-9 pr-3 text-[14px] text-white placeholder:text-[#777777] outline-none focus:border-[#3EA6FF]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !username.trim()}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-4 text-[12.5px] font-bold text-black transition hover:bg-neutral-200 disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Import
                </button>
              </form>

              {activeConnected && (
                <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 text-[12px]">
                  <span className="text-neutral-300">
                    Connected as <strong className="text-white">{activeConnected.username}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDisconnect(activeConnected.provider)}
                    className="inline-flex items-center gap-1 font-semibold text-rose-400 hover:underline"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Unlink
                  </button>
                </div>
              )}

              {error && (
                <p className="rounded-2xl bg-rose-500/15 px-3.5 py-2.5 text-[11.5px] font-medium text-rose-300">
                  {error}
                </p>
              )}

              {/* Prominent Comix, Mihon / Tachiyomi & MAL Backup Importer */}
              <div className="space-y-2.5 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4">
                <div>
                  <p className="text-[13px] font-bold text-white">
                    Import Comix, Mihon &amp; MAL Backups
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#AAAAAA]">
                    Supports Mihon / Tachiyomi (<code>.tachibk</code>, <code>.proto.gz</code>, <code>.json</code>), Comix (<code>.csv</code>, <code>.json</code>), and MAL (<code>.xml</code>).
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xml,.json,.csv,.tachibk,.proto.gz,.gz"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Import Comix Backup"
                    className="lt-press flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.08] py-2.5 text-[12px] font-bold text-white hover:bg-white/[0.15] disabled:opacity-40"
                  >
                    <FileUp className="h-3.5 w-3.5 text-amber-300" />
                    Comix (.csv / .json)
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Import Mihon Backup"
                    className="lt-press flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.08] py-2.5 text-[12px] font-bold text-white hover:bg-white/[0.15] disabled:opacity-40"
                  >
                    <FileUp className="h-3.5 w-3.5 text-[#3EA6FF]" />
                    Mihon (.tachibk)
                  </button>
                </div>
              </div>

              {/* Apple Disclosure: Advanced Token, XML File, Custom Client ID */}
              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOAuth(!showAdvancedOAuth)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-[12px] font-semibold text-neutral-200 hover:bg-white/[0.04]"
                >
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-[#3EA6FF]" />
                    Token &amp; OAuth Client ID Setup
                  </span>
                  {showAdvancedOAuth ? (
                    <ChevronUp className="h-4 w-4 text-[#AAAAAA]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#AAAAAA]" />
                  )}
                </button>

                {showAdvancedOAuth && (
                  <div className="space-y-2.5 border-t border-white/[0.08] p-4">
                    <p className="text-[10.5px] text-[#AAAAAA]">
                      Redirect URI:{' '}
                      <code className="select-all text-white">{getOAuthRedirectUri()}</code>
                    </p>
                    <input
                      value={customAnilistClientId}
                      onChange={(e) => setCustomAnilistClientId(e.target.value)}
                      placeholder="AniList OAuth Client ID (default: 57274)"
                      className="h-9 w-full rounded-xl border border-white/15 bg-black/40 px-3 text-[12px] text-white outline-none"
                    />
                    <input
                      value={customMalClientId}
                      onChange={(e) => setCustomMalClientId(e.target.value)}
                      placeholder="MyAnimeList Client ID (optional)"
                      className="h-9 w-full rounded-xl border border-white/15 bg-black/40 px-3 text-[12px] text-white outline-none"
                    />
                    <form onSubmit={submitToken} className="flex gap-2">
                      <input
                        type="password"
                        value={anilistTokenInput}
                        onChange={(e) => setAnilistTokenInput(e.target.value)}
                        placeholder="Paste AniList Bearer Token…"
                        className="h-9 flex-1 rounded-xl border border-white/15 bg-black/40 px-3 text-[12px] text-white outline-none"
                      />
                      <button
                        type="submit"
                        disabled={busy || !anilistTokenInput.trim()}
                        className="rounded-xl bg-[#3EA6FF] px-3 text-[11.5px] font-bold text-black disabled:opacity-40"
                      >
                        Connect
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/[0.1] py-2 text-[12px] font-semibold text-white hover:bg-white/[0.16]"
                    >
                      <FileUp className="h-3.5 w-3.5 text-[#3EA6FF]" />
                      Import MAL .xml or ListTube .json
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
