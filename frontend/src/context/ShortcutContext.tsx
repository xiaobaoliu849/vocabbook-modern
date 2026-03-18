import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
    createDefaultShortcutSettings,
    dedupeShortcutBindings,
    defaultShortcutSettings,
    mergeShortcutSettings,
    matchesShortcutBinding,
    normalizeShortcutBinding,
    shortcutDefinitionMap,
    type ShortcutBinding,
    type ShortcutId,
    type ShortcutSettings,
} from '../utils/shortcuts'

const SHORTCUT_STORAGE_KEY = 'vocabbook-shortcuts-v1'
const DESKTOP_TOGGLE_SHORTCUT_ID: ShortcutId = 'desktop.toggleWindow'

interface ShortcutUpdateResult {
    ok: boolean
    bindings: ShortcutBinding[]
    error?: string
}

interface ShortcutContextType {
    shortcuts: ShortcutSettings
    platform: string
    isElectron: boolean
    getBindings: (id: ShortcutId) => ShortcutBinding[]
    matches: (event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key' | 'code'>, id: ShortcutId) => boolean
    findMatching: (
        event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key' | 'code'>,
        ids: ShortcutId[],
    ) => ShortcutId | undefined
    setBindings: (id: ShortcutId, bindings: ShortcutBinding[]) => Promise<ShortcutUpdateResult>
    resetShortcut: (id: ShortcutId) => Promise<ShortcutUpdateResult>
    resetAllShortcuts: () => Promise<{ ok: boolean; error?: string }>
}

const ShortcutContext = createContext<ShortcutContextType | undefined>(undefined)

function loadShortcutsFromStorage() {
    const next = createDefaultShortcutSettings()

    try {
        const raw = localStorage.getItem(SHORTCUT_STORAGE_KEY)
        if (!raw) return next

        const parsed = JSON.parse(raw) as Partial<Record<ShortcutId, ShortcutBinding[]>>
        return mergeShortcutSettings(next, parsed)
    } catch (error) {
        console.warn('Failed to load shortcuts from storage:', error)
        return next
    }
}

function persistShortcuts(shortcuts: ShortcutSettings) {
    localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(shortcuts))
}

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
    const [shortcuts, setShortcuts] = useState<ShortcutSettings>(() => loadShortcutsFromStorage())
    const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI)
    const platform = window.electronAPI?.platform || 'web'

    useEffect(() => {
        persistShortcuts(shortcuts)
    }, [shortcuts])

    useEffect(() => {
        if (!window.electronAPI?.getShortcutSettings) return

        window.electronAPI.getShortcutSettings()
            .then((settings) => {
                const binding = settings.globalToggleWindow
                if (binding === undefined) return

                setShortcuts((prev) => ({
                    ...prev,
                    [DESKTOP_TOGGLE_SHORTCUT_ID]: binding ? [binding] : [],
                }))
            })
            .catch((error) => {
                console.warn('Failed to load desktop shortcut settings:', error)
            })
    }, [])

    const getBindings = useCallback((id: ShortcutId) => {
        return shortcuts[id] ?? []
    }, [shortcuts])

    const matches = useCallback((
        event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key' | 'code'>,
        id: ShortcutId,
    ) => {
        return matchesShortcutBinding(event, shortcuts[id] ?? [])
    }, [shortcuts])

    const findMatching = useCallback((
        event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key' | 'code'>,
        ids: ShortcutId[],
    ) => {
        return ids.find((id) => matchesShortcutBinding(event, shortcuts[id] ?? []))
    }, [shortcuts])

    const syncDesktopShortcut = useCallback(async (bindings: ShortcutBinding[]): Promise<ShortcutUpdateResult> => {
        const normalized = dedupeShortcutBindings(bindings)
        const binding = normalized[0] ?? null

        if (!window.electronAPI?.updateGlobalShortcut) {
            const fallbackBindings = binding ? [binding] : []
            setShortcuts((prev) => ({
                ...prev,
                [DESKTOP_TOGGLE_SHORTCUT_ID]: fallbackBindings,
            }))
            return { ok: true, bindings: fallbackBindings }
        }

        const result = await window.electronAPI.updateGlobalShortcut(binding)
        if (!result.ok) {
            return {
                ok: false,
                bindings: shortcuts[DESKTOP_TOGGLE_SHORTCUT_ID] ?? [],
                error: result.error || 'Failed to update desktop shortcut',
            }
        }

        const nextBindings = result.binding ? [result.binding] : []
        setShortcuts((prev) => ({
            ...prev,
            [DESKTOP_TOGGLE_SHORTCUT_ID]: nextBindings,
        }))

        return { ok: true, bindings: nextBindings }
    }, [shortcuts])

    const setBindings = useCallback(async (id: ShortcutId, bindings: ShortcutBinding[]): Promise<ShortcutUpdateResult> => {
        const definition = shortcutDefinitionMap[id]
        const normalized = bindings
            .map((binding) => normalizeShortcutBinding(binding))
            .filter((binding): binding is ShortcutBinding => Boolean(binding))
        const deduped = dedupeShortcutBindings(normalized)
        const limitedBindings = definition.allowMultiple === false ? deduped.slice(0, 1) : deduped

        if (id === DESKTOP_TOGGLE_SHORTCUT_ID) {
            return syncDesktopShortcut(limitedBindings)
        }

        setShortcuts((prev) => ({
            ...prev,
            [id]: limitedBindings,
        }))

        return { ok: true, bindings: limitedBindings }
    }, [syncDesktopShortcut])

    const resetShortcut = useCallback((id: ShortcutId) => {
        return setBindings(id, defaultShortcutSettings[id])
    }, [setBindings])

    const resetAllShortcuts = useCallback(async () => {
        const desktopResult = await setBindings(DESKTOP_TOGGLE_SHORTCUT_ID, defaultShortcutSettings[DESKTOP_TOGGLE_SHORTCUT_ID])
        if (!desktopResult.ok) {
            return { ok: false, error: desktopResult.error }
        }

        setShortcuts((prev) => {
            const next = createDefaultShortcutSettings()
            next[DESKTOP_TOGGLE_SHORTCUT_ID] = desktopResult.bindings
            return mergeShortcutSettings(prev, next)
        })

        return { ok: true }
    }, [setBindings])

    const value = useMemo<ShortcutContextType>(() => ({
        shortcuts,
        platform,
        isElectron,
        getBindings,
        matches,
        findMatching,
        setBindings,
        resetShortcut,
        resetAllShortcuts,
    }), [findMatching, getBindings, isElectron, matches, platform, resetAllShortcuts, resetShortcut, setBindings, shortcuts])

    return (
        <ShortcutContext.Provider value={value}>
            {children}
        </ShortcutContext.Provider>
    )
}

export function useShortcuts() {
    const context = useContext(ShortcutContext)
    if (!context) {
        throw new Error('useShortcuts must be used within a ShortcutProvider')
    }

    return context
}
