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
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(session),
      })

      if (!response.ok) {
        throw new Error(`Failed to sync chat session ${session.id}: ${response.status}`)
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
      } finally {
        syncInFlightRef.current = null
        if (pendingSessionsRef.current.size > 0) {
          void flush()
        }
      }
    })()

    syncInFlightRef.current = request
    return request
  }, [clearSyncTimer, persistBatch])

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
