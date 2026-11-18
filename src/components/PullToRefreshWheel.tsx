import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { triggerHaptic } from '../services/haptics';

interface PullToRefreshWheelProps {
  refreshing: boolean;
  onRefresh: () => void;
}

const DEADZONE = 18;
const THRESHOLD = 72;
const WHEEL_TARGET = 340;
const CIRCUMFERENCE = 94.25;

/**
 * Isolated pull-to-refresh wheel indicator so high-frequency touch/wheel drag
 * ticks never re-render the surrounding Home feed grid.
 */
export const PullToRefreshWheel: React.FC<PullToRefreshWheelProps> = ({
  refreshing,
  onRefresh,
}) => {
  const [pullPx, setPullPx] = useState(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const touchStartYRef = useRef<number | null>(null);
  const pullActiveRef = useRef(false);
  const pullPxRef = useRef(0);
  const pullCrossedRef = useRef(false);
  const wheelAccRef = useRef(0);
  const wheelDecayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelLastTriggerRef = useRef(0);
  const topSettledAtRef = useRef<number>(Date.now());

  useEffect(() => {
    const onScrollTrack = () => {
      if (window.scrollY <= 1) {
        if (topSettledAtRef.current === 0) topSettledAtRef.current = Date.now();
      } else {
        topSettledAtRef.current = 0;
        wheelAccRef.current = 0;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 2 && e.touches.length === 1 && !refreshing) {
        touchStartYRef.current = e.touches[0].clientY;
        pullActiveRef.current = true;
        pullCrossedRef.current = false;
      } else {
        touchStartYRef.current = null;
        pullActiveRef.current = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullActiveRef.current || touchStartYRef.current === null || refreshing) return;
      if (window.scrollY > 4) {
        pullActiveRef.current = false;
        pullPxRef.current = 0;
        setPullPx(0);
        return;
      }
      const dy = e.touches[0].clientY - touchStartYRef.current;
      if (dy > DEADZONE) {
        const clamped = Math.min(96, (dy - DEADZONE) * 0.45);
        pullPxRef.current = clamped;
        setPullPx(clamped);
        if (clamped >= THRESHOLD && !pullCrossedRef.current) {
          pullCrossedRef.current = true;
          triggerHaptic('light');
        } else if (clamped < THRESHOLD) {
          pullCrossedRef.current = false;
        }
      } else if (dy <= 0) {
        pullPxRef.current = 0;
        pullCrossedRef.current = false;
        setPullPx(0);
      }
    };

    const onTouchEnd = () => {
      if (pullActiveRef.current && pullPxRef.current >= THRESHOLD) {
        triggerHaptic('medium');
        onRefreshRef.current();
      }
      touchStartYRef.current = null;
      pullActiveRef.current = false;
      pullCrossedRef.current = false;
      pullPxRef.current = 0;
      setPullPx(0);
    };

    const onWheel = (e: WheelEvent) => {
      if (refreshing || window.scrollY > 1) {
        wheelAccRef.current = 0;
        return;
      }
      const now = Date.now();
      // Ignore upward scroll momentum when user just hit top of page
      if (topSettledAtRef.current === 0 || now - topSettledAtRef.current < 380) {
        return;
      }
      if (e.deltaY < -3) {
        if (now - wheelLastTriggerRef.current < 1800) return;
        wheelAccRef.current = Math.min(WHEEL_TARGET + 40, wheelAccRef.current + Math.abs(e.deltaY));
        const visual = Math.min(84, (wheelAccRef.current / WHEEL_TARGET) * THRESHOLD);
        setPullPx(visual);
        if (wheelDecayRef.current) clearTimeout(wheelDecayRef.current);
        wheelDecayRef.current = setTimeout(() => {
          wheelAccRef.current = 0;
          setPullPx(0);
        }, 320);

        if (wheelAccRef.current >= WHEEL_TARGET) {
          if (wheelDecayRef.current) clearTimeout(wheelDecayRef.current);
          wheelLastTriggerRef.current = now;
          wheelAccRef.current = 0;
          setPullPx(0);
          onRefreshRef.current();
        }
      } else if (e.deltaY > 4) {
        wheelAccRef.current = 0;
        setPullPx(0);
      }
    };

    window.addEventListener('scroll', onScrollTrack, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      if (wheelDecayRef.current) clearTimeout(wheelDecayRef.current);
      window.removeEventListener('scroll', onScrollTrack);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('wheel', onWheel);
    };
  }, [refreshing]);

  if (pullPx <= 4 && !refreshing) return null;

  const pullRatio = refreshing ? 1 : Math.min(1, pullPx / THRESHOLD);
  const dashOffset = CIRCUMFERENCE * (1 - pullRatio * 0.85);
  const ready = refreshing || pullPx >= THRESHOLD;

  return (
    <div
      aria-live="polite"
      aria-label={
        refreshing ? 'Refreshing feed' : ready ? 'Release to refresh' : 'Pull down to refresh'
      }
      className="pointer-events-none fixed left-1/2 top-14 z-50 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-white/[0.16] bg-[#212121]/95 shadow-2xl backdrop-blur-md transition-transform duration-100"
      style={{
        transform: `translate(-50%, ${refreshing ? 18 : Math.round(pullPx * 0.65 - 10)}px) scale(${
          refreshing ? 1 : 0.72 + pullRatio * 0.28
        })`,
      }}
    >
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 36 36">
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="2.5"
        />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke={ready ? '#FF0000' : '#F1F1F1'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={refreshing ? CIRCUMFERENCE * 0.3 : dashOffset}
          className={refreshing ? 'origin-center animate-spin' : ''}
        />
      </svg>
      <RefreshCw
        className={`h-4 w-4 ${ready ? 'text-[#FF0000]' : 'text-white'} ${
          refreshing ? 'animate-spin' : ''
        }`}
        style={!refreshing ? { transform: `rotate(${Math.round(pullRatio * 270)}deg)` } : undefined}
      />
    </div>
  );
};
