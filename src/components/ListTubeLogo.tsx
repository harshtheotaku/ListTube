import React from 'react';
import brandAnimeImg from '../assets/brand-anime.png';

interface ListTubeLogoProps {
  compact?: boolean;
  showWordmark?: boolean;
}

/**
 * ListTube brand lockup featuring an authentic non-AI official anime emblem and clean wordmark.
 */
export const ListTubeLogo: React.FC<ListTubeLogoProps> = ({
  compact = false,
  showWordmark = true,
}) => {
  const dim = compact ? 24 : 28;
  return (
    <span className="inline-flex shrink-0 items-center gap-2 select-none">
      <img
        src={brandAnimeImg}
        alt=""
        width={dim}
        height={dim}
        className="shrink-0 rounded-lg object-cover ring-1 ring-white/[0.18] shadow-sm"
        style={{ width: dim, height: dim }}
      />

      {showWordmark && (
        <span className="font-sans text-[18px] font-extrabold tracking-[-0.03em] text-white sm:text-[19px]">
          List<span className="text-[#FF0000]">Tube</span>
        </span>
      )}
    </span>
  );
};
