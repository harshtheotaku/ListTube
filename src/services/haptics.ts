import { isNativeCapacitor } from './platform';
import './inAppBrowser';

export type HapticStyle = 'light' | 'medium' | 'success';

/**
 * Triggers native Android tactile feedback on supported devices (no-op on desktop web).
 */
export function triggerHaptic(style: HapticStyle = 'light'): void {
  try {
    if (
      isNativeCapacitor() &&
      typeof window !== 'undefined' &&
      typeof window.ListTubeNative?.haptic === 'function'
    ) {
      window.ListTubeNative.haptic(style);
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(style === 'success' ? [12, 30, 16] : style === 'medium' ? 16 : 10);
    }
  } catch {
    /* ignore unsupported runtime */
  }
}
