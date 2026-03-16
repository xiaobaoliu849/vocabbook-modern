/**
 * API 配置和封装
 * 集中管理 API 基础 URL 和请求方法
 */

// API 基础 URL - 支持环境变量覆盖
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const CLOUD_API_BASE_URL = import.meta.env.VITE_CLOUD_API_URL || 'https://api.historyai.fun'
const CLIENT_ID_STORAGE_KEY = 'vocabbook_client_id'

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

import { useAuthStore } from '../stores/useAuthStore'

/**
 * 封装的 fetch 请求方法
 */
export const api = {
    /**
     * Helper to get headers with Auth token
     */
    _getHeaders(customHeaders?: HeadersInit): HeadersInit {
        const token = useAuthStore.getState().token
        const headers: Record<string, string> = {
            ...getEverMemHeaders(),
        }
        headers['X-Client-Id'] = getClientId()
        if (token) {
            headers['Authorization'] = `Bearer ${token}`
        }
        return {
            ...headers,
            ...(customHeaders as Record<string, string>)
        }
    },

    /**
     * GET 请求
     */
    async get<T = any>(path: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            method: 'GET',
            headers: this._getHeaders(options?.headers)
        })
        if (!response.ok) {
            throw new ApiError(response.status, await response.text())
        }
        return response.json()
    },

    /**
     * POST 请求
     */
    async post<T = any>(path: string, data?: any, options?: RequestInit): Promise<T> {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
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
    },

    /**
     * PUT 请求
     */
    async put<T = any>(path: string, data?: any, options?: RequestInit): Promise<T> {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
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
    },

    /**
     * DELETE 请求
     */
    async delete<T = void>(path: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            method: 'DELETE',
            headers: this._getHeaders(options?.headers)
        })
        if (!response.ok) {
            throw new ApiError(response.status, await response.text())
        }
        const text = await response.text()
        return (text ? JSON.parse(text) : undefined) as T
    },

    /**
     * 上传文件
     */
    async upload<T = any>(path: string, formData: FormData, options?: RequestInit): Promise<T> {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            method: 'POST',
            body: formData,
            headers: this._getHeaders(options?.headers)
            // 不要设置 Content-Type，让浏览器自动设置 multipart/form-data boundary
        })
        if (!response.ok) {
            throw new ApiError(response.status, await response.text())
        }
        return response.json()
    },

    /**
     * 原始 fetch (用于需要自定义处理响应的场景)
     */
    async raw(path: string, options?: RequestInit): Promise<Response> {
        return fetch(`${API_BASE_URL}${path}`, {
            ...options,
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

    // Review
    REVIEW_DUE: '/api/review/due',
    REVIEW_DIFFICULT: '/api/review/difficult',
    REVIEW_SUBMIT: '/api/review/submit',
    REVIEW_SESSION: '/api/review/session',

    // Dictionary
    DICT_SEARCH: (word: string, sources?: string) =>
        `/api/dict/search/${encodeURIComponent(word)}${sources ? `?sources=${sources}` : ''}`,

    // Stats
    STATS_HEATMAP: '/api/stats/heatmap',
    STATS_OVERVIEW: '/api/stats/overview',
    STATS: '/api/stats',
    STATS_STUDY_TIME: '/api/stats/study-time',

    // AI
    AI_CHAT: '/api/ai/chat',
    AI_CHAT_STREAM: '/api/ai/chat/stream',
    AI_MEMORY_OVERVIEW: '/api/ai/memory-overview',
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

    // Cloud Auth & Pay (Note: points to cloud server port 8001 by default unless configured)
    CLOUD_LOGIN: `${CLOUD_API_BASE_URL}/token`,
    CLOUD_REGISTER: `${CLOUD_API_BASE_URL}/register`,
    CLOUD_ME: `${CLOUD_API_BASE_URL}/users/me`,
    CLOUD_PAY_PRECREATE: `${CLOUD_API_BASE_URL}/api/pay/native`,
    CLOUD_ORDER_STATUS: (outTradeNo: string) => `${CLOUD_API_BASE_URL}/api/orders/${encodeURIComponent(outTradeNo)}`,
} as const
