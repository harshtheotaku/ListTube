import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  Download,
  FileUp,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Sparkles,
  X,
} from 'lucide-react';
import { TrackerAccount } from '../types';
import {
  importAniList,
  importAniListWithToken,
  importFromExportFile,
  importMyAnimeList,
  TrackerImport,
} from '../services/trackers';
import { animeStore } from '../services/animeStore';
import { library } from '../services/library';
import { cloudSync, useCloudSync } from '../services/cloudSync';
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

export const TrackersModal: React.FC<TrackersModalProps> = ({
  isOpen,
  onClose,
  trackers,
  onImported,
}) => {
  const cloud = useCloudSync();
  const [provider, setProvider] = useState<Provider>('anilist');
  const [username, setUsername] = useState('');
  const [showPrivateOption, setShowPrivateOption] = useState(false);
  const [anilistToken, setAnilistToken] = useState('');
  const [cloudTab, setCloudTab] = useState<'vault' | 'email'>('vault');
  const [vaultCodeInput, setVaultCodeInput] = useState('');
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudAuthMode, setCloudAuthMode] = useState<'signin' | 'signup'>('signin');
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudNotice, setCloudNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackerImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setCloudNotice(null);
    setResult(null);
    setBusy(false);
    setShowPrivateOption(false);
    const existing = trackers[0];
    if (existing) {
      setProvider(existing.provider);
      setUsername(existing.username);
    }
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
      })),
      imported.account
    );
    setResult(imported);
    toast(`Synced ${imported.entries.length} titles — feed updated!`);
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
          : 'Could not sync this username. Ensure your list is public.'
      );
    } finally {
      setBusy(false);
    }
  };

  const submitToken = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!anilistToken.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const imported = await importAniListWithToken(anilistToken);
      cloudSync.setAniListWritebackToken(anilistToken);
      commitImport(imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AniList token sync failed.');
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

  const handleCreateVault = async () => {
    setCloudBusy(true);
    setCloudNotice(null);
    setError(null);
    try {
      const code = await cloudSync.createSyncCode();
      try {
        await navigator.clipboard?.writeText(code);
        toast(`Cloud Sync Code created & copied: ${code}`);
      } catch {
        toast(`Cloud Sync Code created: ${code}`);
      }
      setCloudNotice(`Vault active (${code}) — paste this code on any other device to sync!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create vault');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleLinkVault = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!vaultCodeInput.trim()) return;
    setCloudBusy(true);
    setCloudNotice(null);
    setError(null);
    try {
      await cloudSync.linkSyncCode(vaultCodeInput);
      setVaultCodeInput('');
      toast('Synced with Cloud Vault!');
      setCloudNotice('Vault linked & merged with your library!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid Sync Code');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleEmailAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cloudEmail.trim().includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setCloudBusy(true);
    setCloudNotice(null);
    setError(null);
    try {
      if (cloudAuthMode === 'signup') {
        const res = await cloudSync.signUpWithEmail(cloudEmail, cloudPassword);
        setCloudNotice(res.message);
        if (res.activeSession) toast('Cloud Account created & synced');
      } else {
        await cloudSync.signInWithEmail(cloudEmail, cloudPassword);
        toast(`Signed in as ${cloudEmail}`);
        setCloudNotice('Signed in & synced with Cloud Account!');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cloud sign-in failed.');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleMagicLink = async () => {
    if (!cloudEmail.trim().includes('@')) {
      setError('Enter your email first for a magic link.');
      return;
    }
    setCloudBusy(true);
    setError(null);
    try {
      const msg = await cloudSync.sendMagicLink(cloudEmail);
      setCloudNotice(msg);
      toast('Magic sign-in link sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send magic link');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleDisconnect = (providerToDisconnect: Provider) => {
    library.disconnectTracker(providerToDisconnect);
    setUsername('');
    setResult(null);
    toast('Tracker disconnected');
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
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 id="tracker-title" className="flex items-center gap-1.5 text-[16px] font-bold text-white">
              <Sparkles className="h-4 w-4 text-[#FF0000]" />
              Connect to ListTube
            </h2>
            <p className="text-[11.5px] text-[#AAAAAA]">
              Sync your anime &amp; manga list to personalize recommendations
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
                  Your For You feed is now tuned to your watch history.
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
              {/* Provider Switch: AniList vs MyAnimeList */}
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map((option) => {
                  const active = provider === option.id;
                  const isConn = trackers.some((t) => t.provider === option.id);
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
                      } ${active ? 'ring-2 ring-white/35' : 'opacity-65 hover:opacity-100'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-white">{option.name}</span>
                        {isConn && (
                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                            SYNCED
                          </span>
                        )}
                      </div>
                      <span className="mt-0.5 block text-[10.5px] text-neutral-300">
                        Public Username
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Simple Username Form */}
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
                    {busy ? 'Syncing' : 'Connect'}
                  </button>
                </div>

                {error && <p className="text-[12px] font-medium text-rose-400">{error}</p>}

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

                <button
                  type="button"
                  onClick={() => setShowPrivateOption(!showPrivateOption)}
                  className="text-[11px] font-medium text-[#AAAAAA] hover:text-white"
                >
                  {showPrivateOption ? 'Hide private account options' : 'Private list? Connect via Token or XML file'}
                </button>
              </form>

              {showPrivateOption && (
                <div className="space-y-2.5 rounded-xl border border-white/[0.08] bg-[#161616] p-3">
                  <form onSubmit={submitToken} className="flex gap-2">
                    <input
                      type="password"
                      value={anilistToken}
                      onChange={(e) => setAnilistToken(e.target.value)}
                      placeholder="Paste AniList Bearer Token…"
                      className="h-9 flex-1 rounded-lg border border-white/15 bg-[#121212] px-3 text-[16px] text-white placeholder:text-[12px] outline-none lg:text-[12px]"
                    />
                    <button
                      type="submit"
                      disabled={busy || !anilistToken.trim()}
                      className="rounded-lg bg-[#02A9FF] px-3 text-[11.5px] font-bold text-black disabled:opacity-40"
                    >
                      Sync
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
                    Upload MAL .xml or ListTube .json
                  </button>
                </div>
              )}

              {/* Clean Divider */}
              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-white/[0.1]" />
                <span className="mx-3 flex items-center gap-1 text-[10.5px] font-bold uppercase text-[#AAAAAA]">
                  <Cloud className="h-3.5 w-3.5 text-[#3EA6FF]" />
                  ListTube Cloud Sync
                </span>
                <div className="flex-grow border-t border-white/[0.1]" />
              </div>

              {cloud.anilistWritebackToken && (
                <div className="flex items-center justify-between rounded-xl border border-[#02A9FF]/30 bg-[#02A9FF]/10 px-3 py-2 text-[11px]">
                  <span className="font-semibold text-[#7DD3FC]">
                    AniList 2-way write-back enabled
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      cloudSync.setAniListWritebackToken('');
                      toast('Disabled AniList write-back');
                    }}
                    className="font-bold text-rose-400 hover:underline"
                  >
                    Disable
                  </button>
                </div>
              )}

              {/* Cloud Tabs: 1-Tap Vault Code vs Email Account */}
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#141414] p-1">
                <button
                  type="button"
                  onClick={() => setCloudTab('vault')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11.5px] font-bold transition ${
                    cloudTab === 'vault' ? 'bg-[#272727] text-white' : 'text-[#AAAAAA] hover:text-white'
                  }`}
                >
                  <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
                  1-Tap Sync Code
                </button>
                <button
                  type="button"
                  onClick={() => setCloudTab('email')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11.5px] font-bold transition ${
                    cloudTab === 'email' ? 'bg-[#272727] text-white' : 'text-[#AAAAAA] hover:text-white'
                  }`}
                >
                  <Mail className="h-3.5 w-3.5 text-[#3EA6FF]" />
                  Email Account
                </button>
              </div>

              {cloudTab === 'vault' ? (
                cloud.syncCode ? (
                  <div className="flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-[#272727] p-3">
                    <div className="min-w-0">
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-400">
                        Vault Linked (v{cloud.syncVersion})
                      </p>
                      <p className="font-mono text-[13.5px] font-black text-white">
                        {cloud.syncCode}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!cloud.syncCode) return;
                          await navigator.clipboard?.writeText(cloud.syncCode);
                          toast('Sync Code copied');
                        }}
                        className="rounded-lg bg-white/10 p-1.5 text-white hover:bg-white/20"
                        title="Copy Sync Code"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          cloudSync.unlinkSyncCode();
                          toast('Unlinked Vault');
                        }}
                        className="text-[11px] font-bold text-rose-400 hover:underline"
                      >
                        Unlink
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <button
                      type="button"
                      disabled={cloudBusy}
                      onClick={handleCreateVault}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-[12.5px] font-bold text-black transition hover:bg-neutral-200 disabled:opacity-50"
                    >
                      {cloudBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      Generate 1-Tap Sync Code (No Login Needed)
                    </button>
                    <form onSubmit={handleLinkVault} className="flex gap-2">
                      <input
                        value={vaultCodeInput}
                        onChange={(e) => setVaultCodeInput(e.target.value.toUpperCase())}
                        placeholder="Paste LT-XXXX-XXXX-XXXX from another device"
                        className="h-10 flex-1 rounded-xl border border-white/15 bg-[#121212] px-3 font-mono text-[16px] text-white placeholder:font-sans placeholder:text-[12px] outline-none focus:border-[#3EA6FF] lg:text-[12px]"
                      />
                      <button
                        type="submit"
                        disabled={cloudBusy || vaultCodeInput.trim().length < 8}
                        className="rounded-xl bg-[#272727] px-4 text-[12.5px] font-bold text-white transition hover:bg-[#383838] disabled:opacity-40"
                      >
                        Link
                      </button>
                    </form>
                  </div>
                )
              ) : cloud.userEmail ? (
                <div className="flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-[#272727] p-3">
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-400">
                      Signed In &amp; Synced
                    </p>
                    <p className="truncate text-[13px] font-bold text-white">{cloud.userEmail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void cloudSync.signOut();
                      toast('Signed out of Cloud Account');
                    }}
                    className="text-[11px] font-bold text-rose-400 hover:underline"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <form onSubmit={handleEmailAuth} className="space-y-2">
                  <input
                    type="email"
                    value={cloudEmail}
                    onChange={(e) => setCloudEmail(e.target.value)}
                    placeholder="Email address (you@example.com)"
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#121212] px-3 text-[16px] text-white placeholder:text-[12.5px] outline-none focus:border-[#3EA6FF] lg:text-[12.5px]"
                  />
                  <input
                    type="password"
                    value={cloudPassword}
                    onChange={(e) => setCloudPassword(e.target.value)}
                    placeholder="Password (min 6 chars)"
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#121212] px-3 text-[16px] text-white placeholder:text-[12.5px] outline-none focus:border-[#3EA6FF] lg:text-[12.5px]"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={cloudBusy || !cloudEmail.trim() || cloudPassword.length < 6}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-[12.5px] font-bold text-black transition hover:bg-neutral-200 disabled:opacity-40"
                    >
                      {cloudBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {cloudAuthMode === 'signin' ? 'Sign In' : 'Create Account'}
                    </button>
                    <button
                      type="button"
                      disabled={cloudBusy}
                      onClick={handleMagicLink}
                      className="rounded-xl bg-[#272727] px-3 py-2.5 text-[11.5px] font-bold text-white transition hover:bg-[#383838]"
                    >
                      Magic Link
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCloudAuthMode((m) => (m === 'signin' ? 'signup' : 'signin'))
                    }
                    className="text-[11px] font-medium text-[#AAAAAA] hover:text-white"
                  >
                    {cloudAuthMode === 'signin'
                      ? 'New to ListTube Cloud? Switch to Create Account'
                      : 'Already have an account? Switch to Sign In'}
                  </button>
                </form>
              )}

              {cloudNotice && (
                <p className="rounded-xl bg-emerald-500/15 px-3 py-2 text-[11.5px] font-medium text-emerald-300">
                  {cloudNotice}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3 text-[11px] text-[#AAAAAA]">
          <button type="button" onClick={onClose} className="font-medium hover:text-white">
            Continue without connecting
          </button>
          <span>AniList · MAL · Supabase Cloud</span>
        </div>
      </div>
    </div>
  );
};
