import { useEffect, useState } from 'react'
import { Keyboard, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useShortcuts } from '../../../context/ShortcutContext'
import {
    bindingFromKeyboardEvent,
    defaultShortcutSettings,
    formatShortcutBinding,
    shortcutDefinitionMap,
    type ShortcutId,
} from '../../../utils/shortcuts'

type ShortcutStatusTone = 'success' | 'error'
type ShortcutStatus = {
    tone: ShortcutStatusTone
    message: string
}

const DESKTOP_TOGGLE_SHORTCUT_ID: ShortcutId = 'desktop.toggleWindow'

function ShortcutBindingPill({ binding, platform }: { binding: string; platform: string }) {
    return (
        <span className="inline-flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
            {formatShortcutBinding(binding, platform).map((key) => (
                <kbd
                    key={`${binding}-${key}`}
                    className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                    {key}
                </kbd>
            ))}
        </span>
    )
}

export default function ShortcutPreferencesCard() {
    const { t } = useTranslation()
    const { getBindings, isElectron, platform, resetShortcut, setBindings } = useShortcuts()
    const [isRecording, setIsRecording] = useState(false)
    const [isBusy, setIsBusy] = useState(false)
    const [status, setStatus] = useState<ShortcutStatus | null>(null)

    const definition = shortcutDefinitionMap[DESKTOP_TOGGLE_SHORTCUT_ID]
    const currentBindings = getBindings(DESKTOP_TOGGLE_SHORTCUT_ID)
    const currentBinding = currentBindings[0] ?? null
    const defaultBinding = defaultShortcutSettings[DESKTOP_TOGGLE_SHORTCUT_ID][0]

    useEffect(() => {
        if (!status) return undefined

        const timeoutId = window.setTimeout(() => {
            setStatus(null)
        }, 3200)

        return () => window.clearTimeout(timeoutId)
    }, [status])

    useEffect(() => {
        if (!isRecording) return undefined

        const handleKeyDown = (event: KeyboardEvent) => {
            const binding = bindingFromKeyboardEvent(event)
            if (!binding) {
                return
            }

            event.preventDefault()
            event.stopPropagation()
            setIsBusy(true)

            void setBindings(DESKTOP_TOGGLE_SHORTCUT_ID, [binding])
                .then((result) => {
                    if (!result.ok) {
                        setStatus({
                            tone: 'error',
                            message: result.error || t('settings.general.shortcuts.error', 'Shortcut update failed'),
                        })
                        return
                    }

                    setStatus({
                        tone: 'success',
                        message: t('settings.general.shortcuts.saved', '{{label}} updated', {
                            label: t(definition.labelKey, definition.fallbackLabel),
                        }),
                    })
                })
                .catch(() => {
                    setStatus({
                        tone: 'error',
                        message: t('settings.general.shortcuts.error', 'Shortcut update failed'),
                    })
                })
                .finally(() => {
                    setIsBusy(false)
                    setIsRecording(false)
                })
        }

        window.addEventListener('keydown', handleKeyDown, true)
        return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [definition.fallbackLabel, definition.labelKey, isRecording, setBindings, t])

    const handleReset = () => {
        setIsBusy(true)
        setIsRecording(false)

        void resetShortcut(DESKTOP_TOGGLE_SHORTCUT_ID)
            .then((result) => {
                if (!result.ok) {
                    setStatus({
                        tone: 'error',
                        message: result.error || t('settings.general.shortcuts.error', 'Shortcut update failed'),
                    })
                    return
                }

                setStatus({
                    tone: 'success',
                    message: t('settings.general.shortcuts.resetOne', '{{label}} reset', {
                        label: t(definition.labelKey, definition.fallbackLabel),
                    }),
                })
            })
            .catch(() => {
                setStatus({
                    tone: 'error',
                    message: t('settings.general.shortcuts.error', 'Shortcut update failed'),
                })
            })
            .finally(() => {
                setIsBusy(false)
            })
    }

    return (
        <div className="glass-card p-6">
            <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary-200 bg-primary-50 text-primary-600 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-300">
                    <Keyboard size={18} />
                </div>
                <div className="min-w-0">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                        {t('shortcuts.title', '⌨️ Keyboard Shortcuts')}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {t('settings.general.shortcuts.compactDesc', 'Only the desktop global shortcut is configurable here. Other in-app shortcuts stay in the help panel.')}
                    </p>
                </div>
            </div>

            {!isElectron ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                    {t('settings.general.shortcuts.desktopOnlyHint', 'This shortcut is only available in the Electron desktop app.')}
                </div>
            ) : (
                <>
                    <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-700/70 dark:bg-slate-900/40">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                                <div className="font-semibold text-slate-800 dark:text-slate-100">
                                    {t(definition.labelKey, definition.fallbackLabel)}
                                </div>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    {t('settings.general.shortcuts.desktopHint', 'The show / hide window shortcut syncs with Electron and may fail if another app already uses it.')}
                                </p>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                                        {t('settings.general.shortcuts.current', 'Current')}
                                    </span>
                                    {currentBinding ? (
                                        <ShortcutBindingPill binding={currentBinding} platform={platform} />
                                    ) : (
                                        <span className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-400 dark:border-slate-700 dark:text-slate-500">
                                            {t('settings.general.shortcuts.notSet', 'Not set')}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                                        {t('settings.general.shortcuts.default', 'Default')}
                                    </span>
                                    <ShortcutBindingPill binding={defaultBinding} platform={platform} />
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 lg:justify-end">
                                {isRecording ? (
                                    <>
                                        <div className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-300">
                                            {t('settings.general.shortcuts.listening', 'Press any key combination now')}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setIsRecording(false)}
                                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                                        >
                                            {t('settings.general.shortcuts.cancel', 'Cancel')}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setIsRecording(true)}
                                            disabled={isBusy}
                                            className="inline-flex items-center justify-center rounded-xl bg-primary-500 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-primary-500/20 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {t('settings.general.shortcuts.record', 'Record')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleReset}
                                            disabled={isBusy}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                                        >
                                            <RotateCcw size={16} />
                                            {t('settings.general.shortcuts.reset', 'Reset')}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                        {t('settings.general.shortcuts.captureHint', 'Click record, then press the shortcut you want to assign.')}
                    </p>
                </>
            )}

            {status && (
                <div
                    className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium ${
                        status.tone === 'success'
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300'
                    }`}
                >
                    {status.message}
                </div>
            )}
        </div>
    )
}
