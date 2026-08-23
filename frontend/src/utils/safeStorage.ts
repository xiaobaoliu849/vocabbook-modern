/**
 * localStorage access that never throws.
 *
 * Browsers raise SecurityError when storage is disabled (e.g. strict
 * privacy settings) and QuotaExceededError when full. A bare call site
 * in a provider/effect crashes the whole tree — providers sit above the
 * ErrorBoundary, so the result is a white-screen loop, and a quota
 * failure during a save takes the triggering feature down with it.
 *
 * Every helper degrades to a no-op / null instead; callers keep their
 * existing `|| default` fallbacks.
 */

export const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Storage unavailable or full — persistence is best-effort.
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore — nothing we can do without storage access.
    }
  },
}
