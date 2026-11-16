import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ShelfProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export const Shelf: React.FC<ShelfProps> = ({ title, subtitle, action, children }) => {
  const scroller = useRef<HTMLDivElement>(null);

  const scroll = (direction: -1 | 1) => {
    const node = scroller.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <section className="group/shelf relative">
      <header className="mb-3 flex items-end justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold tracking-tight text-white sm:text-base">{title}</h2>
          {subtitle && <p className="truncate text-[11.5px] text-neutral-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          <div className="hidden items-center gap-1 md:flex">
            <button
              type="button"
              onClick={() => scroll(-1)}
              aria-label="Scroll left"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-300 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/shelf:opacity-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              aria-label="Scroll right"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-300 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/shelf:opacity-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div
        ref={scroller}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:gap-4 sm:px-6 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </section>
  );
};

interface ShelfItemProps {
  children: React.ReactNode;
  width?: string;
}

export const ShelfItem: React.FC<ShelfItemProps> = ({ children, width = 'w-[124px] sm:w-[142px] lg:w-[156px]' }) => (
  <div className={`shrink-0 snap-start ${width}`}>{children}</div>
);
