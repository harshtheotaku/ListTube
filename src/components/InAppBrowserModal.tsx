import React, { useState } from 'react';
import { ExternalLink, Globe, RefreshCw, ShieldCheck, Smartphone, X } from 'lucide-react';
import {
  closeInAppViewer,
  launchBuiltInBrowser,
  launchExternalBrowser,
  useInAppViewer,
} from '../services/inAppBrowser';
import { settingsStore } from '../services/settings';
import { toast } from './Toast';

export const InAppBrowserModal: React.FC = () => {
  const session = useInAppViewer();
  const [frameKey, setFrameKey] = useState(0);
  const [rememberChoice, setRememberChoice] = useState(false);

  if (!session) return null;
  const { target, phase } = session;

  if (phase === 'prompt') {
    return (
      <div
        className="lt-backdrop-in fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Choose Browser for ${target.sourceName}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeInAppViewer();
        }}
      >
        <div className="liquid-glass lt-sheet-up w-full max-w-md overflow-hidden rounded-t-[28px] border border-white/[0.16] p-5 text-white shadow-2xl sm:rounded-[26px]">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/25 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-white">
                Open {target.sourceName}
              </h2>
              <p className="mt-0.5 line-clamp-1 text-[12px] text-[#AAAAAA]">
                {target.title}
              </p>
            </div>
            <button
              type="button"
              onClick={closeInAppViewer}
              aria-label="Close viewer"
              className="lt-press rounded-full bg-white/[0.1] p-1.5 text-[#CCCCCC] hover:bg-white/[0.2] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-2.5">
            <button
              type="button"
              onClick={() => {
                if (rememberChoice) {
                  settingsStore.update({ externalLinkMode: 'external' });
                  toast('Default set to External Browser');
                }
                launchExternalBrowser(target);
              }}
              className="lt-press flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left text-black shadow transition hover:bg-neutral-200"
            >
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-[13.5px] font-bold">Open in External Browser</p>
                  <p className="text-[11px] text-neutral-600">
                    Launches Chrome / Safari (Recommended default)
                  </p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (rememberChoice) {
                  settingsStore.update({ externalLinkMode: 'inapp' });
                  toast('Default set to Built-in Guarded Browser');
                }
                launchBuiltInBrowser(target);
              }}
              className="lt-press flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.14] bg-white/[0.08] px-4 py-3 text-left text-white transition hover:bg-white/[0.14]"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <p className="text-[13.5px] font-bold">Open in Built-in Guarded Browser</p>
                  <p className="text-[11px] text-[#AAAAAA]">
                    Stays inside ListTube with popup &amp; redirect protection
                  </p>
                </div>
              </div>
              <Smartphone className="h-4 w-4 shrink-0 text-[#AAAAAA]" />
            </button>
          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-[12px] text-[#AAAAAA]">
            <input
              type="checkbox"
              checked={rememberChoice}
              onChange={(e) => setRememberChoice(e.target.checked)}
              className="h-4 w-4 accent-[#3EA6FF]"
            />
            Remember my choice (can be changed anytime in Settings)
          </label>
        </div>
      </div>
    );
  }

  return (
    <div
      className="lt-backdrop-in fixed inset-0 z-[90] flex items-end justify-center bg-black/85 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`In-App Reader & Player: ${target.sourceName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeInAppViewer();
      }}
    >
      <div className="liquid-glass lt-sheet-up flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[28px] border border-white/[0.16] bg-[#0B0B0E] text-white shadow-2xl sm:h-[88vh] sm:rounded-[24px]">
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] bg-[#141418] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold text-white">
                {target.sourceName} · {target.title}
              </p>
              <p className="truncate text-[10.5px] text-[#8E8E93]">{target.url}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFrameKey((k) => k + 1)}
              aria-label="Reload page"
              className="lt-press rounded-full bg-white/[0.08] p-2 text-[#CCCCCC] hover:bg-white/[0.15] hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <a
              href={target.url}
              target="_blank"
              rel="noreferrer noopener"
              className="lt-press flex items-center gap-1.5 rounded-full bg-[#FF0000] px-3.5 py-1.5 text-[11.5px] font-bold text-white hover:bg-[#D90000]"
            >
              <span>Open in Browser</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={closeInAppViewer}
              aria-label="Close viewer"
              className="lt-press rounded-full bg-white/[0.08] p-2 text-[#CCCCCC] hover:bg-white/[0.15] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-amber-500/10 px-4 py-2 text-[11.5px] text-amber-200">
          <span className="flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            If {target.sourceName} blocks browser embedding below, tap <strong>Open in Browser</strong> — or use the ListTube Android APK for full ad/popup-guarded in-app playback.
          </span>
        </div>

        <div className="relative flex-1 bg-black">
          <iframe
            key={frameKey}
            src={target.url}
            title={`${target.sourceName} · ${target.title}`}
            sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-fullscreen"
            referrerPolicy="no-referrer"
            className="h-full w-full border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
};
