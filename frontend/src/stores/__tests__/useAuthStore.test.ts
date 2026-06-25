import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '../useAuthStore'

describe('useAuthStore', () => {
    beforeEach(() => {
        // Reset store state between tests
        useAuthStore.setState({ token: null, user: null })
        localStorage.clear()
    })

    it('starts with null token and user', () => {
        const { token, user } = useAuthStore.getState()
        expect(token).toBeNull()
        expect(user).toBeNull()
    })

    it('setToken updates the token', () => {
        useAuthStore.getState().setToken('test-token-123')
        expect(useAuthStore.getState().token).toBe('test-token-123')
    })

    it('setUser updates the user', () => {
        const user = { id: '1', email: 'test@example.com', tier: 'free' as const, is_active: true }
        useAuthStore.getState().setUser(user)
        expect(useAuthStore.getState().user).toEqual(user)
    })

    it('logout clears token and user', () => {
        useAuthStore.getState().setToken('token')
        useAuthStore.getState().setUser({ id: '1', email: 'a@b.com', tier: 'premium', is_active: true })
        useAuthStore.getState().logout()
        expect(useAuthStore.getState().token).toBeNull()
        expect(useAuthStore.getState().user).toBeNull()
    })
})
