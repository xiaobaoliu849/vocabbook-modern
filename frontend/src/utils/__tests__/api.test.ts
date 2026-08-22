import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, ApiError, ApiTimeoutError, DEFAULT_TIMEOUT_MS, mergeAbortSignals, getClientId, getOwnerTokenHeaders, API_BASE_URL, API_PATHS, getWordAudioUrl, resolveAudioSrc } from '../api'

describe('ApiError', () => {
    it('stores status and body', () => {
        const err = new ApiError(404, 'Not Found')
        expect(err.status).toBe(404)
        expect(err.body).toBe('Not Found')
        expect(err.message).toContain('404')
        expect(err.name).toBe('ApiError')
    })
})

describe('getClientId', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('generates and caches a client ID', () => {
        const id1 = getClientId()
        const id2 = getClientId()
        expect(id1).toBeTruthy()
        expect(id1).toBe(id2) // Same on subsequent calls
    })

    it('returns existing ID from localStorage', () => {
        localStorage.setItem('vocabbook_client_id', 'existing-id')
        expect(getClientId()).toBe('existing-id')
    })
})

describe('getOwnerTokenHeaders', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('returns empty object when no owner token', () => {
        expect(getOwnerTokenHeaders()).toEqual({})
    })

    it('returns X-Owner-Token header when token exists', () => {
        localStorage.setItem('owner_token', 'my-secret')
        expect(getOwnerTokenHeaders()).toEqual({ 'X-Owner-Token': 'my-secret' })
    })
})

describe('API_PATHS', () => {
    it('encodes word in WORD path', () => {
        expect(API_PATHS.WORD('hello world')).toContain(encodeURIComponent('hello world'))
    })

    it('encodes word in DICT_SEARCH path', () => {
        const path = API_PATHS.DICT_SEARCH('test', 'youdao')
        expect(path).toContain(encodeURIComponent('test'))
        expect(path).toContain('sources=youdao')
    })

    it('generates DICT_SEARCH without sources', () => {
        const path = API_PATHS.DICT_SEARCH('test')
        expect(path).not.toContain('sources')
    })
})

describe('API_BASE_URL', () => {
    it('defaults to localhost:8000', () => {
        expect(API_BASE_URL).toBe('http://localhost:8000')
    })
})

describe('getWordAudioUrl', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('builds local cached audio endpoint', () => {
        const url = getWordAudioUrl('hello')
        expect(url).toBe(`${API_BASE_URL}/api/dict/audio/${encodeURIComponent('hello')}?accent=us`)
    })

    it('respects preferred accent', () => {
        localStorage.setItem('preferred_accent', 'uk')
        const url = getWordAudioUrl('hello')
        expect(url).toContain('accent=uk')
    })
})

describe('resolveAudioSrc', () => {
    it('prefixes API paths with API_BASE_URL', () => {
        expect(resolveAudioSrc('/api/dict/audio/hello?accent=us')).toBe(
            `${API_BASE_URL}/api/dict/audio/hello?accent=us`
        )
    })

    it('returns absolute URLs unchanged', () => {
        const absolute = 'https://example.com/audio.mp3'
        expect(resolveAudioSrc(absolute)).toBe(absolute)
    })
})

describe('request timeout', () => {
    /** fetch stand-in that only rejects when its abort signal fires. */
    function installHangingFetch() {
        const fetchMock = vi.fn((_path: string, init?: RequestInit) =>
            new Promise<Response>((_, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    reject((init.signal as AbortSignal).reason ?? new DOMException('Aborted', 'AbortError'))
                })
            })
        )
        vi.stubGlobal('fetch', fetchMock)
        return fetchMock
    }

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('rejects with ApiTimeoutError when the request exceeds timeoutMs', async () => {
        installHangingFetch()
        await expect(api.get('/api/slow', { timeoutMs: 20 })).rejects.toBeInstanceOf(ApiTimeoutError)
    }, 5000)

    it('applies the default budget to JSON methods', async () => {
        expect(DEFAULT_TIMEOUT_MS).toBe(60_000)
        vi.useFakeTimers()
        try {
            installHangingFetch()
            const pending = api.get('/api/slow')
            const assertion = expect(pending).rejects.toBeInstanceOf(ApiTimeoutError)
            await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS + 1)
            await assertion
        } finally {
            vi.useRealTimers()
        }
    })

    it('does not time out raw() by default (streaming endpoints)', async () => {
        vi.useFakeTimers()
        try {
            const fetchMock = installHangingFetch()
            void api.raw('/api/ai/chat/stream', { method: 'POST' })
            await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS * 2)
            // The only abort source is the caller signal; none was given, so
            // no timer may have fired.
            for (const call of fetchMock.mock.calls) {
                const signal = (call[1] as RequestInit)?.signal as AbortSignal | undefined
                expect(signal?.aborted ?? false).toBe(false)
            }
        } finally {
            vi.useRealTimers()
        }
    })

    it('still honors a caller-provided abort signal alongside the timer', async () => {
        installHangingFetch()
        const controller = new AbortController()
        const pending = api.get('/api/slow', { signal: controller.signal, timeoutMs: 60_000 })
        controller.abort()
        await expect(pending).rejects.not.toBeInstanceOf(ApiTimeoutError)
    }, 5000)

    it('mergeAbortSignals reports aborted immediately for a pre-aborted signal', () => {
        const controller = new AbortController()
        controller.abort()
        const merged = mergeAbortSignals(controller.signal, 1000)
        expect(merged.signal.aborted).toBe(true)
        merged.dispose()
    })
})
