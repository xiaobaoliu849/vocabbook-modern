import type { TFunction } from 'i18next'

import { ApiError, ApiTimeoutError } from './api'
import { CloudApiError } from '../services/cloudApi'

/** Pull a human-readable `detail`/`message` out of an error response body. */
export function extractApiErrorDetail(body: string): string {
    if (!body) return ''

    try {
        const parsed = JSON.parse(body)
        if (typeof parsed?.detail === 'string') {
            return parsed.detail
        }
        if (typeof parsed?.message === 'string') {
            return parsed.message
        }
    } catch {
        // Ignore invalid JSON bodies and fall back to raw text.
    }

    return body.trim()
}

/**
 * Normalize any request-layer error into a user-presentable message.
 * Optional `t` localizes the canned branches; server-provided details are
 * passed through verbatim when present.
 */
export function describeApiError(error: unknown, t?: TFunction): string {
    const msg = (key: string, fallback: string, params?: Record<string, unknown>): string => (
        t ? t(key, { defaultValue: fallback, ...(params ?? {}) }) : fallback
    )

    if (error instanceof ApiTimeoutError) {
        return msg('errors.timeout', 'Request timed out. Please try again.')
    }

    // fetch() network-level failure (offline, backend down, refused).
    if (error instanceof TypeError || (error instanceof Error && /failed to fetch/i.test(error.message))) {
        return msg('errors.networkUnavailable', 'Cannot reach the service. Please make sure the backend is running.')
    }

    if (error instanceof CloudApiError && error.status === undefined) {
        return msg('errors.cloudUnavailable', 'Cannot reach the cloud service. Please check your network.')
    }

    if (error instanceof ApiError || error instanceof CloudApiError) {
        const status = error instanceof ApiError ? error.status : error.status ?? 0

        if (status === 401 || status === 403) {
            return msg('errors.accessDenied', 'Access denied. Please check your credentials in Settings.')
        }
        if (status >= 500) {
            return msg('errors.serverBusy', 'The service is temporarily unavailable ({{status}}). Please try again later.', { status })
        }

        const detail = extractApiErrorDetail(error instanceof ApiError ? error.body : error.message).replace(/^Cloud API \d+:\s*/, '')
        if (detail) return detail
    }

    if (error instanceof Error && error.message) {
        return error.message
    }

    return msg('errors.requestFailed', 'Request failed. Please try again later.')
}
