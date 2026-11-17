import React from 'react';

interface ListTubeLogoProps {
  compact?: boolean;
  showWordmark?: boolean;
}

/**
 * Clean geometric ListTube brand mark: architectural cinema-red badge pairing
 * a flat checklist spine with a crisp negative-space play triangle (zero gradients or glows).
 */
export const ListTubeLogo: React.FC<ListTubeLogoProps> = ({
  compact = false,
  showWordmark = true,
}) => {
  const height = compact ? 22 : 24;
  const width = compact ? 30 : 32;
  return (
    <span className="inline-flex shrink-0 items-center gap-2 select-none">
      <svg
        width={width}
        height={height}
        viewBox="0 0 36 26"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Classic cinema-red rounded slate */}
        <rect x="0.5" y="0.5" width="35" height="25" rx="6.5" fill="#FF0000" />
        {/* Crisp left queue bars (List motif) */}
        <rect x="7" y="7" width="8.5" height="2.6" rx="1.3" fill="#FFFFFF" />
        <rect x="7" y="11.7" width="6.5" height="2.6" rx="1.3" fill="#FFFFFF" />
        <rect x="7" y="16.4" width="10.5" height="2.6" rx="1.3" fill="#FFFFFF" />
        {/* Sharp geometric Play triangle */}
        <path d="M20 7.2L29.5 13L20 18.8V7.2Z" fill="#FFFFFF" />
      </svg>

      {showWordmark && (
        <span className="font-sans text-[18px] font-extrabold tracking-[-0.03em] text-white sm:text-[19px]">
          List<span className="text-[#FF0000]">Tube</span>
        </span>
      )}
    </span>
  );
};
