import { describe, it, expect, afterEach, vi } from 'vitest'

import { useAuthStore } from '../../stores/useAuthStore'
import { SESSION_EXPIRED_EVENT } from '../../utils/authEvents'
import { payService } from '../cloudApi'

function installStatusFetch(status: number, body = '') {
    return vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))
}

describe('cloudApi session-expiry handling', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        useAuthStore.getState().logout()
    })

    it('clears the stored token and emits the event on an authenticated 401', async () => {
        useAuthStore.getState().setToken('expired-jwt')
        installStatusFetch(401)
        const events: Event[] = []
        const listener = (e: Event) => events.push(e)
        window.addEventListener(SESSION_EXPIRED_EVENT, listener)

        try {
            await expect(payService.getOrderStatus('order-1')).rejects.toMatchObject({ status: 401 })
        } finally {
            window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
        }

        expect(useAuthStore.getState().token).toBeNull()
        expect(events).toHaveLength(1)
    })

    it('does not emit the event when no token was attached (e.g. wrong password)', async () => {
        installStatusFetch(401)
        const events: Event[] = []
        const listener = (e: Event) => events.push(e)
        window.addEventListener(SESSION_EXPIRED_EVENT, listener)

        try {
            await expect(payService.getOrderStatus('order-1')).rejects.toMatchObject({ status: 401 })
        } finally {
            window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
        }

        expect(events).toHaveLength(0)
    })
})
