import React from 'react';
import { MediaType } from '../types';

export const CardSkeleton: React.FC<{ mediaType?: MediaType }> = ({ mediaType = 'ANIME' }) => (
  <div className="animate-pulse">
    <div
      className={`w-full rounded-xl bg-white/[0.08] ${
        mediaType === 'MANGA' ? 'aspect-[4/5]' : 'aspect-video'
      }`}
    />
    <div className="mt-3 flex gap-3">
      <div className="h-9 w-9 shrink-0 rounded-full bg-white/[0.08]" />
      <div className="flex-1 space-y-2 py-0.5">
        <div className="h-3.5 w-11/12 rounded bg-white/[0.08]" />
        <div className="h-3 w-3/5 rounded bg-white/[0.05]" />
      </div>
    </div>
  </div>
);

export const GridSkeleton: React.FC<{ count?: number; mediaType?: MediaType }> = ({
  count = 8,
  mediaType = 'ANIME',
}) => (
  <div
    className={
      mediaType === 'MANGA'
        ? 'grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
        : 'grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
    }
  >
    {Array.from({ length: count }).map((_, index) => (
      <CardSkeleton key={index} mediaType={mediaType} />
    ))}
  </div>
);

export const ShelfSkeleton: React.FC = () => (
  <div className="space-y-3">
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="h-4 w-44 animate-pulse rounded bg-white/[0.08]" />
    </div>
    <div className="flex gap-4 overflow-hidden px-4 sm:px-6 lg:px-8">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="w-[260px] shrink-0 sm:w-[290px]">
          <CardSkeleton />
        </div>
      ))}
    </div>
  </div>
);
