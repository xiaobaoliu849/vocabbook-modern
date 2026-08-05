import { generateId } from './generateId'

export const CHAT_SCOPE_SEPARATOR = '::'

export const normalizeScopeValue = (value: string) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    return normalized || 'guest'
}

export const resolveChatScope = (token?: string | null) => {
    if (!token) return 'guest'

    try {
        const payload = token.split('.')[1]
        if (!payload) return 'guest'
        const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=').replace(/-/g, '+').replace(/_/g, '/')
        const decoded = JSON.parse(atob(padded))
        const sub = typeof decoded?.sub === 'string' ? decoded.sub.trim() : ''
        if (!sub) return 'guest'
        return `cloud_${normalizeScopeValue(sub)}`
    } catch {
        return 'guest'
    }
}

export const getScopedStorageKey = (scope: string) => `chat_sessions_${scope}`
export const buildScopedSessionId = (scope: string) => `${scope}${CHAT_SCOPE_SEPARATOR}${generateId()}`
export const isSessionInScope = (sessionId: string, scope: string) => sessionId.startsWith(`${scope}${CHAT_SCOPE_SEPARATOR}`)
export const DEFAULT_NEW_CHAT_TITLE = '__NEW_CHAT__'
export const LEGACY_NEW_CHAT_TITLE = 'New Chat'
export const LEGACY_MIGRATED_CHAT_TITLE = 'Migrated Chat'
export const isDefaultNewChatTitle = (title: string) => title === DEFAULT_NEW_CHAT_TITLE || title === LEGACY_NEW_CHAT_TITLE
