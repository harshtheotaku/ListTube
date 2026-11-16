import React from 'react';

interface ListTubeLogoProps {
  compact?: boolean;
  showWordmark?: boolean;
}

/**
 * Custom ListTube crest: stacked watchlist bars forming a stylized "L" monogram
 * with a four-point anime spark accent on an electric crimson-to-violet gradient badge.
 */
export const ListTubeLogo: React.FC<ListTubeLogoProps> = ({
  compact = false,
  showWordmark = true,
}) => {
  const size = compact ? 26 : 30;
  return (
    <span className="inline-flex shrink-0 items-center gap-2 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0 drop-shadow-[0_2px_8px_rgba(225,29,116,0.4)]"
      >
        <defs>
          <linearGradient id="listtube-crest-grad" x1="2" y1="2" x2="34" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF2E54" />
            <stop offset="52%" stopColor="#E11D74" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
        {/* Squircle Gradient Crest */}
        <rect
          x="1.5"
          y="1.5"
          width="33"
          height="33"
          rx="10"
          fill="url(#listtube-crest-grad)"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.2"
        />
        {/* Vertical Spine of "L" */}
        <rect x="9.5" y="8.5" width="4.4" height="19" rx="2.2" fill="#FFFFFF" />
        {/* Bottom Foot Bar completing "L" */}
        <rect x="9.5" y="23.1" width="17" height="4.4" rx="2.2" fill="#FFFFFF" />
        {/* Two Staggered Queue / List Bars */}
        <rect x="16.5" y="9.5" width="9.5" height="3.6" rx="1.8" fill="#FFE4F0" />
        <rect x="16.5" y="16.3" width="6.5" height="3.6" rx="1.8" fill="#FFE4F0" />
        {/* Four-Point Anime Spark Glint Top-Right */}
        <path
          d="M27.6 14.2L28.3 16.3L30.4 17.0L28.3 17.7L27.6 19.8L26.9 17.7L24.8 17.0L26.9 16.3L27.6 14.2Z"
          fill="#FFFFFF"
        />
      </svg>

      {showWordmark && (
        <span className="text-[17px] font-black tracking-tight text-white sm:text-[18px]">
          List<span className="text-[#FF2E54]">Tube</span>
        </span>
      )}
    </span>
  );
};
