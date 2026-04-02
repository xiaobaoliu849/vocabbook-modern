import type { TFunction } from 'i18next'

import { ApiError } from './api'

function extractApiErrorDetail(body: string): string {
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

export function getDictionarySearchErrorMessage(error: unknown, t: TFunction): string {
    if (error instanceof ApiError) {
        if (error.status === 404) {
            return t('addWord.errors.notFound', { defaultValue: 'Word not found' })
        }

        const detail = extractApiErrorDetail(error.body).toLowerCase()
        if (detail.includes('timeout') || detail.includes('timed out')) {
            return t('addWord.errors.lookupTimeout', {
                defaultValue: 'Dictionary sources timed out. Please try again in a moment.'
            })
        }

        if (error.status >= 500) {
            return t('addWord.errors.serviceBusy', {
                defaultValue: 'Dictionary service is temporarily unavailable. Please try again later.'
            })
        }
    }

    if (error instanceof TypeError || (error instanceof Error && error.message.toLowerCase().includes('failed to fetch'))) {
        return t('addWord.errors.backendUnavailable', {
            defaultValue: 'Cannot reach the local dictionary service. Please make sure the backend is running.'
        })
    }

    return t('addWord.errors.searchFailed', {
        defaultValue: 'Lookup failed. Please try again later.'
    })
}
