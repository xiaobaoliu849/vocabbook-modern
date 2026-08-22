/**
 * Global window event fired when the cloud server rejects the stored JWT
 * (401/403) on any authenticated request. The centralized emitter lives in
 * cloudApi; UI layers listen to surface a "session expired" notice and drop
 * stale user state without each caller re-implementing 401 handling.
 */
export const SESSION_EXPIRED_EVENT = 'vocabbook:session-expired'

export function emitSessionExpired(): void {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
}
