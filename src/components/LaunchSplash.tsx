import React, { useEffect, useState } from 'react';
import brandAnimeImg from '../assets/brand-anime.webp';

/**
 * Brief Apple-spring Pochita launch animation on cold start (<= 850ms total, non-blocking).
 */
export const LaunchSplash: React.FC = () => {
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setFading(true), 520);
    const t2 = window.setTimeout(() => setGone(true), 860);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-[120] flex flex-col items-center justify-center bg-[#0F0F0F] transition-opacity duration-300 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="lt-splash-pop flex flex-col items-center gap-3">
        <div className="relative flex h-24 w-24 items-center justify-center rounded-[28px] bg-white/[0.06] p-1.5 shadow-[0_24px_60px_rgba(255,0,0,0.22)] ring-1 ring-white/[0.16]">
          <img
            src={brandAnimeImg}
            alt=""
            className="h-full w-full rounded-[22px] object-cover"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-sans text-[22px] font-extrabold tracking-[-0.03em] text-white">
            List<span className="text-[#FF0000]">Tube</span>
          </span>
          <span className="rounded-full bg-white/[0.1] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#CCCCCC]">
            Beta
          </span>
        </div>
      </div>
    </div>
  );
};
