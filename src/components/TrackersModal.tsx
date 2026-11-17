import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  ExternalLink,
  FileUp,
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
import { animeStore } from '../services/animeStore';
import { library } from '../services/library';
import { cloudSync, useCloudSync } from '../services/cloudSync';
import {
  fetchOAuthServerStatus,
  getAppBaseUrl,
  OAuthServerStatus,
} from '../services/supabase';
import { toast } from './Toast';

interface TrackersModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackers: TrackerAccount[];
  onImported: (count: number) => void;
}

type Provider = 'anilist' | 'mal';

const PROVIDERS: { id: Provider; name: string; hint: string; accent: string }[] = [
  {
    id: 'anilist',
    name: 'AniList',
    hint: 'AniList username (e.g. Nekomata)',
    accent: 'from-[#02A9FF]/20 to-transparent border-[#02A9FF]/40',
  },
  {
    id: 'mal',
    name: 'MyAnimeList',
    hint: 'MyAnimeList username (e.g. Josh)',
    accent: 'from-[#2E51A2]/25 to-transparent border-[#2E51A2]/50',
  },
];

const CUSTOM_OAUTH_KEY = 'listtube.customOAuth.v1';

export const TrackersModal: React.FC<TrackersModalProps> = ({
  isOpen,
  onClose,
  trackers,
  onImported,
}) => {
  const cloud = useCloudSync();
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
  const [googleBusy, setGoogleBusy] = useState(false);
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
      })),
      imported.account
    );
    setResult(imported);
    toast(`Connected ${imported.entries.length} titles — feed & stats updated!`);
  };

  const handleGoogleSignIn = async () => {
    setGoogleBusy(true);
    setError(null);
    try {
      await cloudSync.signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed');
      setGoogleBusy(false);
    }
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

  const handleStartOAuth = (target: Provider) => {
    setError(null);
    const redirectUri = getAppBaseUrl();
    if (target === 'anilist') {
      const clientId = (oauthStatus.anilistClientId || customAnilistClientId).trim();
      if (!clientId) {
        setShowAdvancedOAuth(true);
        setError(
          `Add ANILIST_CLIENT_ID in Supabase Secrets (or enter an AniList App Client ID below) with redirect URL ${redirectUri}`
        );
        return;
      }
      if (customAnilistClientId.trim()) {
        localStorage.setItem(
          CUSTOM_OAUTH_KEY,
          JSON.stringify({ anilistClientId: customAnilistClientId.trim(), malClientId: customMalClientId.trim() })
        );
      }
      // Use Authorization Code if configured on server, else Implicit Token Grant for zero-secret Client IDs
      const url = buildAniListAuthorizeUrl({
        clientId,
        redirectUri,
        useImplicit: !oauthStatus.anilistConfigured,
        state: `anilist:${crypto.randomUUID?.() ?? Date.now()}`,
      });
      window.location.href = url;
      return;
    }

    const malClientId = (oauthStatus.malClientId || customMalClientId).trim();
    if (!malClientId) {
      setShowAdvancedOAuth(true);
      setError(
        `Add MAL_CLIENT_ID in Supabase Secrets (or enter your MAL App Client ID below) with redirect URL ${redirectUri}`
      );
      return;
    }
    if (customMalClientId.trim()) {
      localStorage.setItem(
        CUSTOM_OAUTH_KEY,
        JSON.stringify({ anilistClientId: customAnilistClientId.trim(), malClientId: customMalClientId.trim() })
      );
    }
    const verifier = generatePkceVerifier(64);
    const state = `mal:${Date.now()}`;
    storeMalPkceSession(verifier, state, malClientId);
    window.location.href = buildMalAuthorizeUrl({
      clientId: malClientId,
      redirectUri,
      codeChallenge: verifier,
      state,
    });
  };

  const submitToken = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!anilistTokenInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const imported = await importAniListWithToken(anilistTokenInput);
      cloudSync.setAniListWritebackToken(anilistTokenInput);
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
      const text = await file.text();
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(text) as { entries?: Record<string, unknown> };
        if (parsed && parsed.entries) {
          localStorage.setItem('anitube.library.v1', text);
          window.location.reload();
          return;
        }
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

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/85 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tracker-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/[0.1] bg-[#1F1F1F] text-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 id="tracker-title" className="flex items-center gap-1.5 text-[16px] font-bold text-white">
              <Sparkles className="h-4 w-4 text-[#FF0000]" />
              Account &amp; Trackers
            </h2>
            <p className="text-[11.5px] text-[#AAAAAA]">
              Connect with Google or enter your AniList / MAL username
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-[#AAAAAA] transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-5">
          {result ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-3 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <Check className="h-6 w-6 stroke-[3]" />
                </span>
                <p className="text-[16px] font-bold text-white">
                  {result.entries.length} titles imported!
                </p>
                <p className="text-[12px] text-[#AAAAAA]">
                  Your For You recommendations, stats &amp; lists are updated.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {['watching', 'completed', 'planned', 'on_hold', 'dropped']
                  .filter((status) => breakdown[status])
                  .map((status) => (
                    <div
                      key={status}
                      className="rounded-xl border border-white/[0.08] bg-[#272727] p-2.5 text-center"
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
                className="w-full rounded-xl bg-[#FF0000] py-3 text-[13px] font-extrabold text-white transition hover:bg-[#CC0000]"
              >
                See My Recommendations
              </button>
            </div>
          ) : (
            <>
              {/* 1. Username Tracker Connect */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-[#CCCCCC]">
                  <User className="h-3.5 w-3.5 text-[#FF0000]" />
                  <span>Username / Profile Import</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {PROVIDERS.map((option) => {
                    const active = provider === option.id;
                    const conn = trackers.find((t) => t.provider === option.id);
                    const twoWay =
                      option.id === 'anilist'
                        ? Boolean(cloud.anilistWritebackToken)
                        : cloud.malConnected;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setProvider(option.id);
                          setError(null);
                        }}
                        className={`rounded-2xl border bg-gradient-to-b p-3 text-left transition ${
                          option.accent
                        } ${active ? 'ring-2 ring-white/35' : 'opacity-70 hover:opacity-100'}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[13px] font-bold text-white">{option.name}</span>
                          {(conn || twoWay) && (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                              {twoWay ? '2-WAY' : 'LINKED'}
                            </span>
                          )}
                        </div>
                        <span className="mt-0.5 block text-[10.5px] text-neutral-300">
                          {twoWay ? 'Full OAuth Write-Back' : 'Username + 2-Way OAuth'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <form onSubmit={submitUsername} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      id="tracker-username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder={PROVIDERS.find((p) => p.id === provider)?.hint}
                      autoComplete="username"
                      className="h-11 flex-1 rounded-xl border border-white/[0.14] bg-[#121212] px-3.5 text-[16px] text-white placeholder:text-[13px] placeholder:text-[#777777] outline-none transition focus:border-[#FF0000] lg:text-[13px]"
                    />
                    <button
                      type="submit"
                      disabled={busy || !username.trim()}
                      className="flex items-center gap-1.5 rounded-xl bg-[#FF0000] px-4 text-[13px] font-bold text-white transition hover:bg-[#CC0000] disabled:opacity-40"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {busy ? 'Loading' : 'Connect'}
                    </button>
                  </div>

                  {/* Direct 2-Way OAuth Launchers */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleStartOAuth('anilist')}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-[#02A9FF]/40 bg-[#02A9FF]/15 py-2 text-[11.5px] font-bold text-[#7DD3FC] transition hover:bg-[#02A9FF]/25"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>AniList OAuth</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartOAuth('mal')}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-[#2E51A2]/60 bg-[#2E51A2]/25 py-2 text-[11.5px] font-bold text-[#93C5FD] transition hover:bg-[#2E51A2]/40"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>MAL OAuth (PKCE)</span>
                    </button>
                  </div>

                  {activeConnected && (
                    <div className="flex items-center justify-between rounded-xl bg-[#272727] px-3 py-2 text-[11.5px]">
                      <span className="text-neutral-300">
                        Connected as <strong className="text-white">{activeConnected.username}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDisconnect(activeConnected.provider)}
                        className="flex items-center gap-1 font-bold text-rose-400 hover:underline"
                      >
                        <LogOut className="h-3 w-3" />
                        Disconnect
                      </button>
                    </div>
                  )}
                </form>

                {error && <p className="rounded-xl bg-rose-500/15 px-3 py-2 text-[11.5px] font-medium text-rose-300">{error}</p>}
              </div>

              {/* Divider */}
              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-white/[0.1]" />
                <span className="mx-3 text-[10.5px] font-bold uppercase tracking-wider text-[#AAAAAA]">
                  Google Account
                </span>
                <div className="flex-grow border-t border-white/[0.1]" />
              </div>

              {/* 2. Real Google Sign-In (Replaces Sync Codes & Email/Password completely) */}
              {cloud.userEmail ? (
                <div className="flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-[#272727] p-3.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-400">
                        Connected with Google
                      </p>
                      <p className="truncate text-[13px] font-bold text-white">{cloud.userEmail}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void cloudSync.signOut();
                      toast('Signed out of Google');
                    }}
                    className="shrink-0 text-[11.5px] font-bold text-rose-400 hover:underline"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={googleBusy}
                    onClick={handleGoogleSignIn}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-white py-3 text-[13px] font-bold text-[#111111] shadow transition hover:bg-neutral-200 disabled:opacity-50"
                  >
                    {googleBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
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
                  {cloud.googleEnabled === false && (
                    <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                      Google OAuth needs to be toggled on in Supabase Dashboard → Authentication → Providers → Google (Redirect URL: <code className="text-white">{getAppBaseUrl()}</code>).
                    </p>
                  )}
                </div>
              )}

              {/* Optional Token / XML / Custom App ID Drawer */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedOAuth(!showAdvancedOAuth)}
                  className="text-[11px] font-medium text-[#AAAAAA] hover:text-white"
                >
                  {showAdvancedOAuth
                    ? 'Hide OAuth setup, Token & XML import'
                    : 'Token / XML file / OAuth Client ID setup'}
                </button>

                {showAdvancedOAuth && (
                  <div className="mt-2.5 space-y-2.5 rounded-xl border border-white/[0.08] bg-[#161616] p-3">
                    <p className="text-[10.5px] text-[#AAAAAA]">
                      Redirect URI: <code className="select-all text-white">{getAppBaseUrl()}</code>
                    </p>
                    {!oauthStatus.anilistConfigured && (
                      <input
                        value={customAnilistClientId}
                        onChange={(e) => setCustomAnilistClientId(e.target.value)}
                        placeholder="AniList OAuth Client ID (from anilist.co/settings/developer)"
                        className="h-9 w-full rounded-lg border border-white/15 bg-[#121212] px-3 text-[12px] text-white outline-none"
                      />
                    )}
                    {!oauthStatus.malConfigured && (
                      <input
                        value={customMalClientId}
                        onChange={(e) => setCustomMalClientId(e.target.value)}
                        placeholder="MyAnimeList Client ID (from myanimelist.net/apiconfig)"
                        className="h-9 w-full rounded-lg border border-white/15 bg-[#121212] px-3 text-[12px] text-white outline-none"
                      />
                    )}
                    <form onSubmit={submitToken} className="flex gap-2">
                      <input
                        type="password"
                        value={anilistTokenInput}
                        onChange={(e) => setAnilistTokenInput(e.target.value)}
                        placeholder="Or paste AniList Bearer Token…"
                        className="h-9 flex-1 rounded-lg border border-white/15 bg-[#121212] px-3 text-[16px] text-white placeholder:text-[12px] outline-none lg:text-[12px]"
                      />
                      <button
                        type="submit"
                        disabled={busy || !anilistTokenInput.trim()}
                        className="rounded-lg bg-[#02A9FF] px-3 text-[11.5px] font-bold text-black disabled:opacity-40"
                      >
                        Connect
                      </button>
                    </form>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xml,.json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#272727] py-2 text-[11.5px] font-semibold text-white hover:bg-[#383838]"
                    >
                      <FileUp className="h-3.5 w-3.5 text-[#3EA6FF]" />
                      Import MAL .xml or ListTube .json
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3 text-[11px] text-[#AAAAAA]">
          <button type="button" onClick={onClose} className="font-medium hover:text-white">
            Continue browsing
          </button>
          <span>AniList · MyAnimeList · Google</span>
        </div>
      </div>
    </div>
  );
};
