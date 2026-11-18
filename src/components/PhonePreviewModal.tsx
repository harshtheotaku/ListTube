import React, { useMemo, useState } from 'react';
import { RefreshCw, Smartphone, X } from 'lucide-react';

interface PhonePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_TABS = [
  { id: 'home', label: 'Home' },
  { id: 'explore', label: 'Explore' },
  { id: 'list', label: 'My List' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'feed', label: 'Feed' },
  { id: 'you', label: 'You' },
] as const;

export const PhonePreviewModal: React.FC<PhonePreviewModalProps> = ({ isOpen, onClose }) => {
  const [size, setSize] = useState<'standard' | 'large'>('standard');
  const [tab, setTab] = useState<string>('home');
  const [reloadNonce, setReloadNonce] = useState(0);

  const dims = size === 'large' ? { w: 430, h: 860 } : { w: 390, h: 800 };

  const previewSrc = useMemo(() => {
    if (typeof window === 'undefined') return '/?phonePreview=1';
    const url = new URL(window.location.href);
    url.searchParams.set('phonePreview', '1');
    url.searchParams.set('tab', tab);
    url.searchParams.set('_pv', String(reloadNonce));
    return url.toString();
  }, [tab, reloadNonce]);

  if (!isOpen) return null;

  return (
    <div
      className="lt-backdrop-in fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Laptop Phone Simulator"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[96vh] flex-col items-center gap-3">
        {/* Simulator Controls Bar */}
        <div className="liquid-glass flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/[0.16] px-4 py-2 text-white shadow-2xl">
          <div className="flex items-center gap-1.5 pr-2 text-[12px] font-bold text-[#3EA6FF]">
            <Smartphone className="h-4 w-4" />
            <span>Laptop Phone Simulator</span>
          </div>

          <div className="flex items-center gap-1 rounded-full bg-white/[0.06] p-0.5 text-[11px] font-semibold">
            {PRESET_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-full px-2.5 py-1 transition ${
                  tab === item.id ? 'bg-white text-black' : 'text-[#CCCCCC] hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSize((s) => (s === 'standard' ? 'large' : 'standard'))}
            className="rounded-full bg-white/[0.08] px-3 py-1 text-[11px] font-bold text-neutral-200 hover:bg-white/[0.16]"
          >
            {dims.w}×{dims.h}px
          </button>

          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            aria-label="Reload phone frame"
            className="rounded-full bg-white/[0.08] p-1.5 text-neutral-200 hover:bg-white/[0.16]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close phone simulator"
            className="rounded-full bg-[#FF0000]/80 p-1.5 text-white hover:bg-[#FF0000]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Realistic Device Bezel + Live App Frame */}
        <div
          className="relative overflow-hidden rounded-[42px] border-[8px] border-[#1F222A] bg-black shadow-[0_24px_80px_rgba(0,0,0,0.85)] ring-1 ring-white/20"
          style={{
            width: `${dims.w}px`,
            height: `min(${dims.h}px, calc(100vh - 110px))`,
          }}
        >
          <iframe
            key={previewSrc}
            src={previewSrc}
            title="ListTube 390px Phone Preview"
            className="h-full w-full border-0 bg-[#0F0F0F]"
          />
        </div>
      </div>
    </div>
  );
};
