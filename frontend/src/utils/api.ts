/**
 * API 配置和封装
 * 集中管理 API 基础 URL 和请求方法
 */

// API 基础 URL - 支持环境变量覆盖
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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
            throw createApiError(response.status, await response.text())
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
            throw createApiError(response.status, await response.text())
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
            throw createApiError(response.status, await response.text())
        }
        return response.json()
    },

    /**
     * DELETE 请求
     */
    async delete(path: string, options?: RequestInit): Promise<Response> {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            method: 'DELETE',
        })
        return response
    },

    /**
     * 原始 fetch (用于需要自定义处理响应的场景)
     */
    async raw(path: string, options?: RequestInit): Promise<Response> {
        return fetch(`${API_BASE_URL}${path}`, options)
    }
}

/**
 * API 错误工厂函数
 */
export function createApiError(status: number, body: string): Error {
    const error = new Error(`API Error ${status}: ${body}`)
    error.name = 'ApiError'
        ; (error as any).status = status
        ; (error as any).body = body
    return error
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
    REVIEW_SUBMIT: '/api/review/submit',
    REVIEW_SESSION: '/api/review/session',

    // Dictionary
    DICT_SEARCH: (word: string, sources?: string) =>
        `/api/dict/search/${encodeURIComponent(word)}${sources ? `?sources=${sources}` : ''}`,

    // Stats
    STATS_HEATMAP: '/api/stats/heatmap',
    STATS_OVERVIEW: '/api/stats/overview',

    // AI
    AI_GENERATE_SENTENCES: '/api/ai/generate-sentences',

    // TTS
    TTS_SPEAK: '/api/tts/speak',
} as const
