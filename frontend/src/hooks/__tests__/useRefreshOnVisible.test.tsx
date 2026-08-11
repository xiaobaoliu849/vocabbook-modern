import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRefreshOnVisible } from '../useRefreshOnVisible'

function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
    })
    document.dispatchEvent(new Event('visibilitychange'))
}

describe('useRefreshOnVisible', () => {
    beforeEach(() => {
        setVisibility('visible')
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('does not refresh on mount', () => {
        const refresh = vi.fn()
        renderHook(() => useRefreshOnVisible(refresh))
        expect(refresh).not.toHaveBeenCalled()
    })

    it('refreshes on visible transitions and ignores hidden ones', () => {
        const refresh = vi.fn()
        renderHook(() => useRefreshOnVisible(refresh))

        act(() => setVisibility('hidden'))
        expect(refresh).not.toHaveBeenCalled()

        act(() => setVisibility('visible'))
        expect(refresh).toHaveBeenCalledTimes(1)
    })

    it('rate-limits rapid consecutive show events', () => {
        const refresh = vi.fn()
        renderHook(() => useRefreshOnVisible(refresh))

        act(() => {
            setVisibility('hidden')
            setVisibility('visible')
        })
        expect(refresh).toHaveBeenCalledTimes(1)

        // A second show within the interval is suppressed...
        act(() => {
            setVisibility('hidden')
            setVisibility('visible')
        })
        expect(refresh).toHaveBeenCalledTimes(1)

        // ...but a show after the interval elapses refreshes again.
        act(() => {
            vi.advanceTimersByTime(2500)
        })
        act(() => {
            setVisibility('hidden')
            setVisibility('visible')
        })
        expect(refresh).toHaveBeenCalledTimes(2)
    })

    it('always invokes the latest callback', () => {
        const first = vi.fn()
        const second = vi.fn()
        const { rerender } = renderHook(
            ({ cb }: { cb: () => void }) => useRefreshOnVisible(cb),
            { initialProps: { cb: first } }
        )

        rerender({ cb: second })
        act(() => {
            setVisibility('hidden')
            setVisibility('visible')
        })

        expect(second).toHaveBeenCalledTimes(1)
        expect(first).not.toHaveBeenCalled()
    })

    it('stops refreshing after unmount', () => {
        const refresh = vi.fn()
        const { unmount } = renderHook(() => useRefreshOnVisible(refresh))

        unmount()
        act(() => {
            setVisibility('hidden')
            setVisibility('visible')
        })
        expect(refresh).not.toHaveBeenCalled()
    })

    it('honors a custom minIntervalMs', () => {
        const refresh = vi.fn()
        renderHook(() => useRefreshOnVisible(refresh, { minIntervalMs: 0 }))

        act(() => {
            setVisibility('hidden')
            setVisibility('visible')
        })
        act(() => {
            setVisibility('hidden')
            setVisibility('visible')
        })
        expect(refresh).toHaveBeenCalledTimes(2)
    })
})
