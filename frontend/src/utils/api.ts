/**
 * API 配置和封装
 * 集中管理 API 基础 URL 和请求方法
 */

// API 基础 URL - 支持环境变量覆盖
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const envCloudUrl = import.meta.env.VITE_CLOUD_API_URL;
export const CLOUD_API_BASE_URL = (envCloudUrl && !envCloudUrl.includes('historyai.fun')) ? envCloudUrl : 'http://localhost:8001';
const CLIENT_ID_STORAGE_KEY = 'vocabbook_client_id'

export type PronunciationAccent = 'us' | 'uk'

export function getPreferredAccent(): PronunciationAccent {
    try {
        return localStorage.getItem('preferred_accent') === 'uk' ? 'uk' : 'us'
    } catch {
        return 'us'
    }
}

/** Resolve stored/API audio path to a playable URL */
export function resolveAudioSrc(audio?: string): string | undefined {
    if (!audio) return undefined
    if (audio.startsWith('http://') || audio.startsWith('https://')) return audio
    if (audio.startsWith('/')) return `${API_BASE_URL}${audio}`
    return audio
}

/** Local cached pronunciation endpoint (downloads + caches on first request) */
export function getWordAudioUrl(word: string, accent?: PronunciationAccent): string {
    const resolvedAccent = accent ?? getPreferredAccent()
    return `${API_BASE_URL}/api/dict/audio/${encodeURIComponent(word.trim())}?accent=${resolvedAccent}`
}

export function getOwnerTokenHeaders(): Record<string, string> {
    const ownerToken = localStorage.getItem('owner_token') || ''
    return ownerToken ? { 'X-Owner-Token': ownerToken } : {}
}

export function getClientId(): string {
    try {
        const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY)
        if (existing) return existing

        const generated = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

        localStorage.setItem(CLIENT_ID_STORAGE_KEY, generated)
        return generated
    } catch {
        return 'guest_local'
    }
}

function getEverMemHeaders(): Record<string, string> {
    try {
        const enabled = localStorage.getItem('evermem_enabled') || 'false'
        const url = localStorage.getItem('evermem_url') || ''
        const key = localStorage.getItem('evermem_key') || ''
        const headers: Record<string, string> = {
            'X-EverMem-Enabled': enabled,
        }
        if (url) headers['X-EverMem-Url'] = url
        if (key) headers['X-EverMem-Key'] = key
        return headers
    } catch {
        return {
            'X-EverMem-Enabled': 'false',
        }
    }
}

export class ApiError extends Error {
    status: number
    body: string

    constructor(status: number, body: string) {
        super(`API Error ${status}: ${body}`)
        this.name = 'ApiError'
        this.status = status
        this.body = body
    }
}

/** Thrown when a request exceeds its timeout budget. Subclasses ApiError so
 *  existing `instanceof ApiError` status checks keep working untouched. */
export class ApiTimeoutError extends ApiError {
    constructor(timeoutMs: number) {
        super(408, `Request timed out after ${timeoutMs}ms`)
        this.name = 'ApiTimeoutError'
    }
}

import { useAuthStore } from '../stores/useAuthStore'

// ---------------------------------------------------------------------------
// Timeout plumbing. fetch() has no default timeout: a black-holed connection
// (backend killed mid-request, proxy hang) would leave spinners running
// forever. Every request gets an abort controller that fires after a budget;
// caller-provided signals are merged so unmount/cleanup cancellation still
// works, and the timer is always disposed once the request settles.
// ---------------------------------------------------------------------------
export const DEFAULT_TIMEOUT_MS = 60_000
const UPLOAD_TIMEOUT_MS = 300_000

export type RequestOptions = RequestInit & { timeoutMs?: number }

interface MergedSignal {
    signal: AbortSignal
    dispose: () => void
}

/**
 * Combine an optional caller signal with a timeout into one abort signal.
 * `timeoutMs <= 0` disables the timer (used by streaming endpoints).
 */
export function mergeAbortSignals(signal: AbortSignal | null | undefined, timeoutMs: number): MergedSignal {
    const controller = new AbortController()

    if (signal?.aborted) {
        controller.abort(signal.reason)
        return { signal: controller.signal, dispose: () => {} }
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const forwardAbort = () => controller.abort(signal?.reason)
    if (signal) {
        signal.addEventListener('abort', forwardAbort)
    }
    if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
        // Aborting with the error makes fetch reject with the ApiTimeoutError
        // itself on engines that support abort reasons (Chromium 98+).
        timer = setTimeout(() => controller.abort(new ApiTimeoutError(timeoutMs)), timeoutMs)
    }

    return {
        signal: controller.signal,
        dispose() {
            if (timer !== undefined) clearTimeout(timer)
            signal?.removeEventListener('abort', forwardAbort)
        },
    }
}

// ---------------------------------------------------------------------------
// In-memory GET cache: opt-in TTL caching + in-flight request dedup for
// stable endpoints (e.g. tags). Keyed by the full path (query included).
// ---------------------------------------------------------------------------
interface GetCacheEntry {
    value: unknown
    expiresAt: number
}

const getCache = new Map<string, GetCacheEntry>()
const pendingGets = new Map<string, Promise<unknown>>()

/**
 * Drop cached GET responses, optionally only those whose path starts with `prefix`.
 * Call after mutations that change data served by cached endpoints.
 */
export function invalidateGetCache(prefix?: string): void {
    if (!prefix) {
        getCache.clear()
        return
    }
    for (const key of getCache.keys()) {
        if (key.startsWith(prefix)) {
            getCache.delete(key)
        }
    }
}

/**
 * 封装的 fetch 请求方法
 */
export const api = {
    /**
     * Helper to get headers with Auth token
     */
    _getHeaders(customHeaders?: HeadersInit): HeadersInit {
        const token = useAuthStore.getState().token
        const ownerToken = localStorage.getItem('owner_token') || ''
        const headers: Record<string, string> = {
            ...getEverMemHeaders(),
        }
        headers['X-Client-Id'] = getClientId()
        if (token) {
            headers['Authorization'] = `Bearer ${token}`
        }
        if (ownerToken) {
            headers['X-Owner-Token'] = ownerToken
        }
        return {
            ...headers,
            ...(customHeaders as Record<string, string>)
        }
    },

    /**
     * GET 请求。传入 `ttl`（毫秒）时启用内存缓存 + 并发去重。
     */
    async get<T = any>(path: string, options?: RequestOptions & { ttl?: number }): Promise<T> {
        const ttl = options?.ttl ?? 0
        if (ttl > 0) {
            const cached = getCache.get(path)
            if (cached && cached.expiresAt > Date.now()) {
                return cached.value as T
            }

            const inFlight = pendingGets.get(path)
            if (inFlight) {
                return inFlight as Promise<T>
            }

            const request = (async () => {
                // The dedup path ignores caller signals by design: concurrent
                // callers share one request and none of them owns cancellation.
                const merged = mergeAbortSignals(null, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
                try {
                    const response = await fetch(`${API_BASE_URL}${path}`, {
                        ...options,
                        signal: merged.signal,
                        method: 'GET',
                        headers: this._getHeaders(options?.headers),
                    })
                    if (!response.ok) {
                        throw new ApiError(response.status, await response.text())
                    }
                    const value: unknown = await response.json()
                    getCache.set(path, { value, expiresAt: Date.now() + ttl })
                    return value
                } finally {
                    merged.dispose()
                }
            })()
            pendingGets.set(path, request)
            void request.finally(() => pendingGets.delete(path)).catch(() => {})
            return request as Promise<T>
        }

        const merged = mergeAbortSignals(options?.signal, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
        try {
            const response = await fetch(`${API_BASE_URL}${path}`, {
                ...options,
                signal: merged.signal,
                method: 'GET',
                headers: this._getHeaders(options?.headers)
            })
            if (!response.ok) {
                throw new ApiError(response.status, await response.text())
            }
            return response.json()
        } finally {
            merged.dispose()
        }
    },

    /**
     * POST 请求
     */
    async post<T = any>(path: string, data?: any, options?: RequestOptions): Promise<T> {
        const merged = mergeAbortSignals(options?.signal, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
        try {
            const response = await fetch(`${API_BASE_URL}${path}`, {
                ...options,
                signal: merged.signal,
                method: 'POST',
                headers: this._getHeaders({
                    'Content-Type': 'application/json',
                    ...options?.headers,
                }),
                body: data ? JSON.stringify(data) : undefined,
            })
            if (!response.ok) {
                throw new ApiError(response.status, await response.text())
            }
            return response.json()
        } finally {
            merged.dispose()
        }
    },

    /**
     * PUT 请求
     */
    async put<T = any>(path: string, data?: any, options?: RequestOptions): Promise<T> {
        const merged = mergeAbortSignals(options?.signal, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
        try {
            const response = await fetch(`${API_BASE_URL}${path}`, {
                ...options,
                signal: merged.signal,
                method: 'PUT',
                headers: this._getHeaders({
                    'Content-Type': 'application/json',
                    ...options?.headers,
                }),
                body: data ? JSON.stringify(data) : undefined,
            })
            if (!response.ok) {
                throw new ApiError(response.status, await response.text())
            }
            return response.json()
        } finally {
            merged.dispose()
        }
    },

    /**
     * DELETE 请求
     */
    async delete<T = void>(path: string, options?: RequestOptions): Promise<T> {
        const merged = mergeAbortSignals(options?.signal, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
        try {
            const response = await fetch(`${API_BASE_URL}${path}`, {
                ...options,
                signal: merged.signal,
                method: 'DELETE',
                headers: this._getHeaders(options?.headers)
            })
            if (!response.ok) {
                throw new ApiError(response.status, await response.text())
            }
            const text = await response.text()
            return (text ? JSON.parse(text) : undefined) as T
        } finally {
            merged.dispose()
        }
    },

    /**
     * 上传文件（大文件放宽到 5 分钟）
     */
    async upload<T = any>(path: string, formData: FormData, options?: RequestOptions): Promise<T> {
        const merged = mergeAbortSignals(options?.signal, options?.timeoutMs ?? UPLOAD_TIMEOUT_MS)
        try {
            const response = await fetch(`${API_BASE_URL}${path}`, {
                ...options,
                signal: merged.signal,
                method: 'POST',
                body: formData,
                headers: this._getHeaders(options?.headers)
                // 不要设置 Content-Type，让浏览器自动设置 multipart/form-data boundary
            })
            if (!response.ok) {
                throw new ApiError(response.status, await response.text())
            }
            return response.json()
        } finally {
            merged.dispose()
        }
    },

    /**
     * 原始 fetch (用于需要自定义处理响应的场景，如 SSE 流式接口——默认不超时，
     * 传入 `timeoutMs` 可显式启用)
     */
    async raw(path: string, options?: RequestOptions): Promise<Response> {
        const merged = mergeAbortSignals(options?.signal, options?.timeoutMs ?? 0)
        // NOTE: no dispose here — the returned Response body may outlive this
        // call (streaming readers); the timer only exists when explicitly opted in.
        return fetch(`${API_BASE_URL}${path}`, {
            ...options,
            signal: merged.signal,
            headers: this._getHeaders(options?.headers)
        })
    }
}

/**
 * 常用 API 路径
 */
export const API_PATHS = {
    // Words
    WORDS: '/api/words',
    WORD: (word: string) => `/api/words/${encodeURIComponent(word)}`,
    WORD_TAGS: '/api/words/tags',
    WORD_MASTER: (word: string) => `/api/words/${encodeURIComponent(word)}/master`,
    WORDS_BACKFILL_AUDIO: '/api/words/backfill-audio',

    // Review
    REVIEW_DUE: '/api/review/due',
    REVIEW_DUE_COUNT: '/api/review/due-count',
    REVIEW_DIFFICULT: '/api/review/difficult',
    REVIEW_SUBMIT: '/api/review/submit',
    REVIEW_SESSION: '/api/review/session',

    // Dictionary
    DICT_SEARCH: (word: string, sources?: string) =>
        `/api/dict/search/${encodeURIComponent(word)}${sources ? `?sources=${sources}` : ''}`,
    DICT_FAMILY: (word: string) => `/api/dict/family/${encodeURIComponent(word)}`,

    // Stats
    STATS_HEATMAP: '/api/stats/heatmap',
    STATS_OVERVIEW: '/api/stats/overview',
    STATS: '/api/stats',
    STATS_STUDY_TIME: '/api/stats/study-time',

    // AI
    AI_CHAT: '/api/ai/chat',
    AI_CHAT_STREAM: '/api/ai/chat/stream',
    AI_MEMORY_OVERVIEW: '/api/ai/memory-overview',
    AI_FORESIGHT_DISMISS: (id: string) => `/api/ai/foresights/${encodeURIComponent(id)}`,
    AI_MEMORIES_LIST: '/api/ai/memories',
    AI_MEMORY_DELETE: (id: string) => `/api/ai/memories/${encodeURIComponent(id)}`,
    AI_MEMORIES_CLEAR: '/api/ai/memories/clear',
    AI_CHAT_SESSIONS: '/api/ai/chat-sessions',
    AI_CHAT_SESSION_DELETE: (id: string) => `/api/ai/chat-sessions/${encodeURIComponent(id)}`,
    AI_GENERATE_SENTENCES: '/api/ai/generate-sentences',
    AI_TRANSLATE: '/api/ai/translate',
    AI_TRANSLATIONS: '/api/ai/translations/history',
    AI_TRANSLATION_DELETE: (id: number) => `/api/ai/translations/${id}`,

    // TTS
    TTS_SPEAK: '/api/tts/speak',

    // Import
    IMPORT_UPLOAD: '/api/import/upload',
    IMPORT_WORDS: '/api/import/words',

    // Attachments
    ATTACHMENTS_PRESIGN: '/api/attachments/presign',

    // Cloud Auth & Pay (Note: points to cloud server port 8001 by default unless configured)
    CLOUD_LOGIN: `${CLOUD_API_BASE_URL}/token`,
    CLOUD_REGISTER: `${CLOUD_API_BASE_URL}/register`,
    CLOUD_ME: `${CLOUD_API_BASE_URL}/users/me`,
    CLOUD_PAY_PRECREATE: `${CLOUD_API_BASE_URL}/api/pay/native`,
    CLOUD_ORDER_STATUS: (outTradeNo: string) => `${CLOUD_API_BASE_URL}/api/orders/${encodeURIComponent(outTradeNo)}`,
} as const
