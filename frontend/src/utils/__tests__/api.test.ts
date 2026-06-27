import { describe, it, expect, beforeEach } from 'vitest'
import { ApiError, getClientId, getOwnerTokenHeaders, API_BASE_URL, API_PATHS, getWordAudioUrl, resolveAudioSrc } from '../api'

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
