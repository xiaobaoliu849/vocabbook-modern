import { useEffect, useRef } from 'react'

export interface UseRefreshOnVisibleOptions {
    /**
     * Minimum time (ms) between two refresh calls triggered by window-show
     * events. Guards against request storms when the window is toggled
     * rapidly (e.g. via the global shortcut). Defaults to 2000.
     */
    minIntervalMs?: number
}

/**
 * Calls `refresh` once each time the document transitions from hidden to
 * visible — i.e. when the Electron window is reopened from tray/minimize, or
 * the browser tab is focused again. Use it to heal mounted page data whose
 * requests failed or went stale while the window was hidden.
 *
 * - The callback is stored in a ref, so the latest closure (current filters,
 *   page, active state, ...) is always used and the listener is never
 *   re-registered.
 * - Refreshes are rate-limited to `minIntervalMs` to collapse rapid
 *   hide/show toggles.
 * - Nothing happens on mount: only actual hidden -> visible transitions fire.
 *
 * Callers are responsible for error handling inside `refresh` (same contract
 * as a normal fetch effect).
 */
export function useRefreshOnVisible(
    refresh: () => void | Promise<void>,
    options: UseRefreshOnVisibleOptions = {}
): void {
    const refreshRef = useRef(refresh)
    useEffect(() => {
        refreshRef.current = refresh
    }, [refresh])

    const lastRefreshAtRef = useRef(0)
    const minIntervalMs = options.minIntervalMs ?? 2000

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return
            const now = Date.now()
            if (now - lastRefreshAtRef.current < minIntervalMs) return
            lastRefreshAtRef.current = now
            void refreshRef.current()
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [minIntervalMs])
}
