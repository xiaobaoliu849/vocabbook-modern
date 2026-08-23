import { useCallback, useEffect, useRef } from 'react'

export interface PersistedChatSession {
  id: string
  title: string
  messages: unknown[]
  updatedAt: number
  createdAt: number
}

interface PendingSessionSync {
  headers: Record<string, string>
  session: PersistedChatSession
}

interface SyncOptions {
  immediate?: boolean
}

// A hung request must never wedge the queue: without this, a suspended
// connection (laptop sleep / VPN drop) left syncInFlightRef occupied
// forever and cloud backup silently stopped until restart.
const SYNC_TIMEOUT_MS = 30_000

export function useChatSessionSync(apiBaseUrl: string, path: string, delayMs: number = 800) {
  const pendingSessionsRef = useRef<Map<string, PendingSessionSync>>(new Map())
  const syncTimerRef = useRef<number | null>(null)
  const syncInFlightRef = useRef<Promise<void> | null>(null)

  const clearSyncTimer = useCallback(() => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
    }
  }, [])

  const persistBatch = useCallback(async (batch: PendingSessionSync[]) => {
    const results = await Promise.allSettled(batch.map(async ({ session, headers }) => {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS)
      try {
        const response = await fetch(`${apiBaseUrl}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify(session),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Failed to sync chat session ${session.id}: ${response.status}`)
        }
      } finally {
        window.clearTimeout(timeoutId)
      }
    }))

    const rejected = results.filter((result) => result.status === 'rejected')
    if (rejected.length > 0) {
      throw new Error(`Failed to sync ${rejected.length} chat session update(s)`)
    }
  }, [apiBaseUrl, path])

  const flush = useCallback(async () => {
    clearSyncTimer()

    if (syncInFlightRef.current) {
      return syncInFlightRef.current
    }

    if (pendingSessionsRef.current.size === 0) {
      return
    }

    const batch = Array.from(pendingSessionsRef.current.values())
    pendingSessionsRef.current.clear()

    const request = (async () => {
      try {
        await persistBatch(batch)
      } catch {
        // Re-queue the failed batch so a later flush retries. Never
        // overwrite an entry that was re-scheduled while we were in
        // flight — it holds newer data for the same session.
        for (const item of batch) {
          if (!pendingSessionsRef.current.has(item.session.id)) {
            pendingSessionsRef.current.set(item.session.id, item)
          }
        }
      } finally {
        syncInFlightRef.current = null
        if (pendingSessionsRef.current.size > 0 && syncTimerRef.current === null) {
          // Retry after the debounce interval rather than recursing
          // inline — bounds the loop when the network stays down.
          syncTimerRef.current = window.setTimeout(() => {
            void flush()
          }, delayMs)
        }
      }
    })()

    syncInFlightRef.current = request
    return request
  }, [clearSyncTimer, delayMs, persistBatch])

  const schedule = useCallback((
    session: PersistedChatSession,
    headers: Record<string, string>,
    options?: SyncOptions,
  ) => {
    pendingSessionsRef.current.set(session.id, { session, headers })

    if (options?.immediate) {
      void flush()
      return
    }

    clearSyncTimer()
    syncTimerRef.current = window.setTimeout(() => {
      void flush()
    }, delayMs)
  }, [clearSyncTimer, delayMs, flush])

  const drop = useCallback((sessionId: string) => {
    pendingSessionsRef.current.delete(sessionId)
  }, [])

  const clear = useCallback(() => {
    clearSyncTimer()
    pendingSessionsRef.current.clear()
  }, [clearSyncTimer])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flush()
      }
    }

    const handlePageHide = () => {
      void flush()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      clearSyncTimer()
      void flush()
    }
  }, [clearSyncTimer, flush])

  return {
    clear,
    drop,
    flush,
    schedule,
  }
}
