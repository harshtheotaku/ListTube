import React from 'react';

interface AniTubeLogoProps {
  compact?: boolean;
  showWordmark?: boolean;
}

/**
 * Distinctive AniTube crimson prism-"A" crest + anime star glint emblem.
 * Intentionally avoids generic play-rectangle silhouettes.
 */
export const AniTubeLogo: React.FC<AniTubeLogoProps> = ({
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
        className="shrink-0 drop-shadow-[0_2px_8px_rgba(255,30,66,0.35)]"
      >
        <defs>
          <linearGradient id="anitube-crest-grad" x1="3" y1="3" x2="33" y2="33" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF2E54" />
            <stop offset="55%" stopColor="#E5093A" />
            <stop offset="100%" stopColor="#99002B" />
          </linearGradient>
        </defs>
        {/* Rounded Obsidian-Framed Crimson Squircle Crest */}
        <rect
          x="1.5"
          y="1.5"
          width="33"
          height="33"
          rx="10"
          fill="url(#anitube-crest-grad)"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="1.2"
        />
        {/* Stylized Geometric Origami "A" Prism */}
        <path
          d="M18 7.5L26.8 27H22.2L18 17.2L13.8 27H9.2L18 7.5Z"
          fill="#FFFFFF"
        />
        {/* Floating Crimson-Cut Crossbar Ribbon */}
        <path
          d="M13.4 20.6H22.6L21.1 23.6H14.9L13.4 20.6Z"
          fill="#FFE4EA"
        />
        {/* Four-Point Anime Sparkle Accent Top-Right */}
        <path
          d="M27.6 7.2L28.4 9.5L30.7 10.3L28.4 11.1L27.6 13.4L26.8 11.1L24.5 10.3L26.8 9.5L27.6 7.2Z"
          fill="#FFFFFF"
        />
      </svg>

      {showWordmark && (
        <span className="text-[17px] font-black tracking-tight text-white sm:text-[18px]">
          Ani<span className="text-[#FF2E54]">Tube</span>
        </span>
      )}
    </span>
  );
};
