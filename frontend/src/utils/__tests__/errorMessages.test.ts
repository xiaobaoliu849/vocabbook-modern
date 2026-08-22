import { describe, it, expect } from 'vitest'
import type { TFunction } from 'i18next'

import { ApiError, ApiTimeoutError } from '../api'
import { CloudApiError } from '../../services/cloudApi'
import { describeApiError } from '../errorMessages'

/** Minimal stand-in for i18next's t() returning the defaultValue. */
const fakeT = ((key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key) as unknown as TFunction

describe('describeApiError', () => {
    it('maps timeouts to the timeout message', () => {
        const message = describeApiError(new ApiTimeoutError(60_000), fakeT)
        expect(message).toBe('Request timed out. Please try again.')
    })

    it('maps network failures to the backend-unavailable message', () => {
        expect(describeApiError(new TypeError('Failed to fetch'), fakeT))
            .toBe('Cannot reach the service. Please make sure the backend is running.')
    })

    it('treats status-less CloudApiError as a cloud connectivity problem', () => {
        expect(describeApiError(new CloudApiError('Cloud API network error: boom'), fakeT))
            .toBe('Cannot reach the cloud service. Please check your network.')
    })

    it('maps auth rejections to the access-denied message', () => {
        expect(describeApiError(new ApiError(401, 'Unauthorized'), fakeT)).toBe(
            'Access denied. Please check your credentials in Settings.'
        )
        expect(describeApiError(new CloudApiError('Cloud API 403: x', 403), fakeT)).toBe(
            'Access denied. Please check your credentials in Settings.'
        )
    })

    it('extracts server detail from JSON bodies on other statuses', () => {
        const err = new ApiError(400, JSON.stringify({ detail: 'Word already exists' }))
        expect(describeApiError(err, fakeT)).toBe('Word already exists')
    })

    it('falls back to the generic message for opaque errors', () => {
        expect(describeApiError(new Error('weird'), fakeT)).toBe('weird')
        expect(describeApiError(undefined, fakeT)).toBe('Request failed. Please try again later.')
    })
})
