/**
 * API 配置和封装
 * 集中管理 API 基础 URL 和请求方法
 */

// API 基础 URL - 支持环境变量覆盖
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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

/**
 * 封装的 fetch 请求方法
 */
export const api = {
    /**
     * GET 请求
     */
    async get<T = any>(path: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            method: 'GET',
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
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
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
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
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
        return fetch(`${API_BASE_URL}${path}`, options)
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
    AI_GENERATE_SENTENCES: '/api/ai/generate-sentences',
    AI_TRANSLATE: '/api/ai/translate',
    AI_TRANSLATIONS: '/api/ai/translations/history',
    AI_TRANSLATION_DELETE: (id: number) => `/api/ai/translations/${id}`,

    // TTS
    TTS_SPEAK: '/api/tts/speak',

    // Import
    IMPORT_UPLOAD: '/api/import/upload',
    IMPORT_WORDS: '/api/import/words',
} as const
