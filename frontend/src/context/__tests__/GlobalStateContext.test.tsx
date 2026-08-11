import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { GlobalStateProvider } from '../GlobalStateContext'

function mockFetch() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        return {
            ok: true,
            status: 200,
            json: async () => (url.includes('/due-count') ? { due_count: 5 } : {}),
            text: async () => '',
        } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}

function countDueCountFetches(fetchMock: ReturnType<typeof mockFetch>) {
    return fetchMock.mock.calls.filter(([input]) => String(input).includes('/due-count')).length
}

function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
    })
    document.dispatchEvent(new Event('visibilitychange'))
}

describe('GlobalStateProvider due-count polling', () => {
    beforeEach(() => {
        localStorage.clear()
        setVisibility('visible')
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('fetches due count on mount and every 60s while visible', async () => {
        const fetchMock = mockFetch()

        render(
            <GlobalStateProvider>
                <div>child</div>
            </GlobalStateProvider>
        )

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })
        expect(countDueCountFetches(fetchMock)).toBe(1)

        await act(async () => {
            await vi.advanceTimersByTimeAsync(60000)
        })
        expect(countDueCountFetches(fetchMock)).toBe(2)

        await act(async () => {
            await vi.advanceTimersByTimeAsync(60000)
        })
        expect(countDueCountFetches(fetchMock)).toBe(3)
    })

    it('pauses the 60s poll while hidden and refreshes immediately on show', async () => {
        const fetchMock = mockFetch()

        render(
            <GlobalStateProvider>
                <div>child</div>
            </GlobalStateProvider>
        )

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })
        expect(countDueCountFetches(fetchMock)).toBe(1)

        // Hiding the window (e.g. closed to tray) must stop the interval.
        act(() => setVisibility('hidden'))
        await act(async () => {
            await vi.advanceTimersByTimeAsync(120000)
        })
        expect(countDueCountFetches(fetchMock)).toBe(1)

        // Showing the window again resumes polling with an immediate refresh.
        act(() => setVisibility('visible'))
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })
        expect(countDueCountFetches(fetchMock)).toBe(2)

        await act(async () => {
            await vi.advanceTimersByTimeAsync(60000)
        })
        expect(countDueCountFetches(fetchMock)).toBe(3)
    })
})
