import { useSyncExternalStore } from 'react';
import { useSettings } from './settings';

let chromeVisible = true;
let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function readScrollOffset(ev?: Event): number {
  const target = ev?.target as HTMLElement | Document | undefined;
  const targetTop =
    target && target !== document && 'scrollTop' in target ? Number(target.scrollTop) || 0 : 0;
  return Math.max(
    0,
    window.scrollY || 0,
    document.documentElement?.scrollTop || 0,
    document.body?.scrollTop || 0,
    targetTop
  );
}

function attachListener() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  let lastY = readScrollOffset();
  let rafPending = false;

  const onScroll = (ev: Event) => {
    if (rafPending) return;
    rafPending = true;
    window.requestAnimationFrame(() => {
      rafPending = false;
      const y = readScrollOffset(ev);
      const delta = y - lastY;

      const hasOpenModal = Boolean(document.querySelector('[role="dialog"]'));
      const activeTag = document.activeElement?.tagName;
      const typing = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

      if (y <= 36 || hasOpenModal || typing) {
        if (!chromeVisible) {
          chromeVisible = true;
          emit();
        }
        lastY = y;
        return;
      }

      if (delta > 8 && y > 52) {
        if (chromeVisible) {
          chromeVisible = false;
          emit();
        }
        lastY = y;
      } else if (delta < -6) {
        if (!chromeVisible) {
          chromeVisible = true;
          emit();
        }
        lastY = y;
      }
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });
}

function applyChromeDataset(visible: boolean, autoHide: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.chromeHidden = autoHide && !visible ? '1' : '0';
}

export function resetScrollChrome() {
  if (!chromeVisible) {
    chromeVisible = true;
    applyChromeDataset(true, true);
    emit();
  }
}

export function useChromeVisible(): boolean {
  const settings = useSettings();
  attachListener();
  const raw = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => chromeVisible,
    () => true
  );
  const visible = settings.autoHideBars ? raw : true;
  applyChromeDataset(raw, settings.autoHideBars);
  return visible;
}
