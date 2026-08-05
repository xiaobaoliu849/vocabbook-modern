import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, API_PATHS } from '../utils/api'
import type { MemoryOverview } from '../components/chat/types'

export function useMemoryOverview({
    evermemEnabled,
    getApiHeaders,
    isPanelOpen,
}: {
    evermemEnabled: boolean
    getApiHeaders: () => Record<string, string>
    isPanelOpen: boolean
}) {
    const { t } = useTranslation()

    const [memoryOverview, setMemoryOverview] = useState<MemoryOverview | null>(null)
    const [memoryOverviewLoading, setMemoryOverviewLoading] = useState(false)
    const [memoryOverviewError, setMemoryOverviewError] = useState<string | null>(null)
    const [memoryOverviewUpdatedAt, setMemoryOverviewUpdatedAt] = useState<number | null>(null)

    const memoryOverviewRequestRef = useRef<Promise<void> | null>(null)
    const memoryOverviewLastFetchedAtRef = useRef<number>(0)
    const memoryOverviewDirtyRef = useRef(false)
    const memoryOverviewRefreshTimerRef = useRef<number | null>(null)

    const loadMemoryOverview = useCallback(async (
        options?: {
            force?: boolean
            silent?: boolean
        }
    ) => {
        if (!evermemEnabled) {
            setMemoryOverview(null)
            setMemoryOverviewError(null)
            setMemoryOverviewUpdatedAt(null)
            memoryOverviewLastFetchedAtRef.current = 0
            memoryOverviewDirtyRef.current = false
            return
        }

        const force = options?.force === true
        const silent = options?.silent === true
        const now = Date.now()
        const isFresh = now - memoryOverviewLastFetchedAtRef.current < 60_000

        if (!force && memoryOverview && isFresh && !memoryOverviewDirtyRef.current) {
            return
        }

        if (memoryOverviewRequestRef.current) {
            return memoryOverviewRequestRef.current
        }

        if (!silent) {
            setMemoryOverviewLoading(true)
        }
        setMemoryOverviewError(null)

        const request = (async () => {
            try {
                const payload = await api.get(API_PATHS.AI_MEMORY_OVERVIEW, {
                    headers: getApiHeaders()
                })
                setMemoryOverview(payload)
                setMemoryOverviewUpdatedAt(Date.now())
                memoryOverviewLastFetchedAtRef.current = Date.now()
                memoryOverviewDirtyRef.current = false
            } catch (error) {
                console.error('Failed to load memory overview', error)
                setMemoryOverviewError(error instanceof Error ? error.message : t('chat.memory.panel.loadFailed'))
            } finally {
                if (!silent) {
                    setMemoryOverviewLoading(false)
                }
                memoryOverviewRequestRef.current = null
            }
        })()

        memoryOverviewRequestRef.current = request
        return request
    }, [evermemEnabled, getApiHeaders, memoryOverview, t])

    // Refresh when the panel opens or its data becomes stale.
    useEffect(() => {
        if (!isPanelOpen) return
        const now = Date.now()
        const shouldForce = memoryOverviewDirtyRef.current
        const shouldRefreshInBackground =
            Boolean(memoryOverview) &&
            (now - memoryOverviewLastFetchedAtRef.current >= 60_000 || memoryOverviewDirtyRef.current)

        if (!memoryOverview) {
            void loadMemoryOverview()
            return
        }

        if (shouldForce || shouldRefreshInBackground) {
            void loadMemoryOverview({ force: shouldForce, silent: true })
        }
    }, [loadMemoryOverview, memoryOverview, isPanelOpen])

    // Clear a pending refresh timer on unmount.
    useEffect(() => {
        const timerRef = memoryOverviewRefreshTimerRef
        return () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current)
            }
        }
    }, [memoryOverviewRefreshTimerRef])

    return {
        memoryOverview,
        memoryOverviewLoading,
        memoryOverviewError,
        memoryOverviewUpdatedAt,
        memoryOverviewDirtyRef,
        memoryOverviewRefreshTimerRef,
        loadMemoryOverview,
    }
}
