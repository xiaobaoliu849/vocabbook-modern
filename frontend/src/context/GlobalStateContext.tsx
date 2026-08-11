import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { api, API_PATHS, invalidateGetCache } from '../utils/api';

interface GlobalStateContextType {
    dueCount: number;
    refreshDueCount: (nextCount?: number) => Promise<void>;
    notifyWordAdded: () => void;
    notifyWordDeleted: () => void;
    notifyWordUpdated: () => void;
    lastUpdate: number;
}

const GlobalStateContext = createContext<GlobalStateContextType | undefined>(undefined);

export function GlobalStateProvider({ children }: { children: ReactNode }) {
    const [dueCount, setDueCount] = useState<number>(0);
    const [lastUpdate, setLastUpdate] = useState<number>(0);

    const fetchDueCount = useCallback(async () => {
        try {
            const result = await api.get<any>(API_PATHS.REVIEW_DUE_COUNT);
            setDueCount(result.due_count ?? 0);
        } catch (error) {
            console.error('Failed to fetch due count:', error);
        }
    }, []);

    // Poll the due count every 60s while the app is visible. When the window is
    // hidden (minimized / closed to tray) the interval is paused and the count
    // is refreshed once on the next show, so the badge stays fresh without
    // burning background requests while hidden.
    useEffect(() => {
        let interval: number | undefined;

        const stopPolling = () => {
            if (interval !== undefined) {
                window.clearInterval(interval);
                interval = undefined;
            }
        };

        const startPolling = () => {
            if (interval !== undefined) return;
            void fetchDueCount();
            interval = window.setInterval(fetchDueCount, 60000);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                stopPolling();
            } else {
                startPolling();
            }
        };

        startPolling();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            stopPolling();
        };
    }, [fetchDueCount]);

    useEffect(() => {
        const backfillKey = 'audio_backfill_v1';
        if (localStorage.getItem(backfillKey) === 'done') return;

        api.post(API_PATHS.WORDS_BACKFILL_AUDIO)
            .then(() => localStorage.setItem(backfillKey, 'done'))
            .catch((error) => {
                console.warn('Background audio backfill failed:', error);
            });
    }, []);

    const refreshDueCount = useCallback(async (nextCount?: number) => {
        if (typeof nextCount === 'number') {
            setDueCount(nextCount)
            return
        }
        await fetchDueCount();
    }, [fetchDueCount]);

    const notifyWordAdded = useCallback(() => {
        setLastUpdate(Date.now());
        fetchDueCount();
        // Tags may have changed (e.g. new tag on an added word)
        invalidateGetCache(API_PATHS.WORD_TAGS);
    }, [fetchDueCount]);

    const notifyWordDeleted = useCallback(() => {
        setLastUpdate(Date.now());
        fetchDueCount();
        invalidateGetCache(API_PATHS.WORD_TAGS);
    }, [fetchDueCount]);

    const notifyWordUpdated = useCallback(() => {
        setLastUpdate(Date.now());
        fetchDueCount();
        invalidateGetCache(API_PATHS.WORD_TAGS);
    }, [fetchDueCount]);

    const value = useMemo(() => ({
        dueCount,
        refreshDueCount,
        notifyWordAdded,
        notifyWordDeleted,
        notifyWordUpdated,
        lastUpdate
    }), [dueCount, lastUpdate, refreshDueCount, notifyWordAdded, notifyWordDeleted, notifyWordUpdated]);

    return (
        <GlobalStateContext.Provider value={value}>
            {children}
        </GlobalStateContext.Provider>
    );
}

export function useGlobalState() {
    const context = useContext(GlobalStateContext);
    if (context === undefined) {
        throw new Error('useGlobalState must be used within a GlobalStateProvider');
    }
    return context;
}
