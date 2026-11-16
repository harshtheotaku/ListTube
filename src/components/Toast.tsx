import React, { useEffect, useState } from 'react';

export function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('anitube:toast', { detail: message }));
}

export const ToastHost: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setMessage(detail);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 2400);
    };
    window.addEventListener('anitube:toast', handler as EventListener);
    return () => {
      window.removeEventListener('anitube:toast', handler as EventListener);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed bottom-20 lg:bottom-8 left-1/2 z-[70] -translate-x-1/2 transition-all duration-200 ${
        message ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      {message && (
        <div className="rounded-full border border-white/10 bg-[#1c1c23] px-4 py-2 text-xs font-medium text-white shadow-2xl shadow-black/60">
          {message}
        </div>
      )}
    </div>
  );
};
