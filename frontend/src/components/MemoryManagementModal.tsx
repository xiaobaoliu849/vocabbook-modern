import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Trash2, AlertTriangle, RefreshCcw, Database } from 'lucide-react'
import { useAuthStore } from '../stores/useAuthStore'
import {
    clearMemoriesApi,
    deleteMemoryApi,
    isEvermemConfigured,
    listMemoriesApi,
    type MemoryItem,
    type MemoryType,
} from '../utils/evermem'

interface MemoryManagementModalProps {
    isOpen: boolean
    onClose: () => void
}

const MEMORY_TYPES: MemoryType[] = [
    'episodic_memory',
    'profile',
    'foresight',
    'agent_case',
    'agent_skill',
]

const PAGE_SIZE = 20

function formatMemoryTimestamp(ts: number | null | undefined): string {
    if (!ts) return ''
    const ms = ts > 1e12 ? ts : ts * 1000
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString()
}

export default function MemoryManagementModal({ isOpen, onClose }: MemoryManagementModalProps) {
    const { t } = useTranslation()
    const token = useAuthStore((s) => s.token)
    const [memoryType, setMemoryType] = useState<MemoryType>('episodic_memory')
    const [page, setPage] = useState(1)
    const [items, setItems] = useState<MemoryItem[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [emptyHint, setEmptyHint] = useState(false)
    const [confirmClear, setConfirmClear] = useState(false)
    const [clearing, setClearing] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const configured = isEvermemConfigured()

    const load = useCallback(async (type: MemoryType, p: number) => {
        if (!configured) return
        setLoading(true)
        setError(null)
        setEmptyHint(false)
        try {
            const resp = await listMemoriesApi(token, type, p, PAGE_SIZE)
            setItems(resp.items || [])
            if (!resp.items || resp.items.length === 0) setEmptyHint(true)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            setError(msg)
            setItems([])
        } finally {
            setLoading(false)
        }
    }, [configured, token])

    useEffect(() => {
        if (!isOpen) return
        setPage(1)
        setItems([])
        setError(null)
        if (configured) {
            void load(memoryType, 1)
        }
    }, [isOpen, memoryType, configured, load])

    const handleDelete = async (memoryId: string | undefined) => {
        if (!memoryId) return
        setDeletingId(memoryId)
        try {
            await deleteMemoryApi(token, memoryId)
            setItems((prev) => prev.filter((it) => it.memory_id !== memoryId))
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            setError(msg)
        } finally {
            setDeletingId(null)
        }
    }

    const handleClear = async () => {
        setClearing(true)
        try {
            await clearMemoriesApi(token)
            setItems([])
            setEmptyHint(true)
            setConfirmClear(false)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            setError(msg)
        } finally {
            setClearing(false)
        }
    }

    const handleRefresh = () => {
        void load(memoryType, page)
    }

    const nextPage = () => {
        if (items.length < PAGE_SIZE) return
        const next = page + 1
        setPage(next)
        void load(memoryType, next)
    }

    const prevPage = () => {
        if (page <= 1) return
        const next = page - 1
        setPage(next)
        void load(memoryType, next)
    }

    if (!isOpen) return null

    const title = t('memoryMgmt.title', 'Memory Management')
    const typeLabels: Partial<Record<MemoryType, string>> = {
        episodic_memory: t('memoryMgmt.type.episodic', 'Episodic'),
        profile: t('memoryMgmt.type.profile', 'Profile'),
        foresight: t('memoryMgmt.type.foresight', 'Foresight'),
        agent_case: t('memoryMgmt.type.agentCase', 'Agent Cases'),
        agent_skill: t('memoryMgmt.type.agentSkill', 'Agent Skills'),
    }

    useEffect(() => {
        if (!isOpen) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (confirmClear) {
                    setConfirmClear(false)
                } else {
                    onClose()
                }
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [isOpen, confirmClear, onClose])

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose()
    }

    const modalContent = (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={handleBackdropClick}
        >
            <div className="relative flex w-full max-w-3xl max-h-[85vh] flex-col rounded-3xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-indigo-500/10 p-2">
                            <Database size={20} className="text-indigo-500" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        aria-label={t('memoryMgmt.close', 'Close')}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 px-6 py-3">
                    <div className="flex flex-wrap gap-2">
                        {MEMORY_TYPES.map((mt) => (
                            <button
                                key={mt}
                                type="button"
                                onClick={() => setMemoryType(mt)}
                                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                    memoryType === mt
                                        ? 'bg-indigo-500 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                {typeLabels[mt]}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={loading || !configured}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40"
                            aria-label={t('memoryMgmt.refresh', 'Refresh')}
                        >
                            <RefreshCcw size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmClear(true)}
                            disabled={!configured || clearing || loading || (items.length === 0 && emptyHint)}
                            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/20 transition disabled:opacity-40"
                        >
                            <AlertTriangle size={14} />
                            {t('memoryMgmt.clearAll', 'Clear All')}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {!configured && (
                        <div className="rounded-2xl border border-amber-200/50 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-400/20 p-6 text-center">
                            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                                {t('memoryMgmt.notConfigured', 'EverMemOS is not enabled or API key is missing.')}
                            </p>
                            <p className="text-xs text-amber-600/80 dark:text-amber-300/80 mt-1">
                                {t('memoryMgmt.configureHint', 'Enable it and provide an API key in AI Settings.')}
                            </p>
                        </div>
                    )}

                    {configured && loading && (
                        <div className="py-12 text-center text-sm text-slate-500">
                            {t('memoryMgmt.loading', 'Loading memories...')}
                        </div>
                    )}

                    {configured && !loading && error && (
                        <div className="rounded-2xl border border-red-200/50 bg-red-50 dark:bg-red-500/10 dark:border-red-400/20 p-6 text-center">
                            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                                {t('memoryMgmt.loadError', 'Failed to load memories.')}
                            </p>
                            <p className="text-xs text-red-600/80 dark:text-red-300/80 mt-1 break-all">{error}</p>
                        </div>
                    )}

                    {configured && !loading && !error && emptyHint && (
                        <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                            {t('memoryMgmt.empty', 'No memories of this type yet.')}
                        </div>
                    )}

                    {configured && !loading && !error && items.length > 0 && (
                        <div className="space-y-3">
                            {items.map((it, idx) => (
                                <div
                                    key={it.memory_id || `${it.type}-${idx}`}
                                    className="group rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 transition hover:bg-white dark:hover:bg-slate-800"
                                >
                                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed break-words">
                                        {it.content || it.raw_content || '—'}
                                    </p>
                                    <div className="mt-2 flex items-center justify-between gap-3">
                                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                            {it.group_id && <span>group: {it.group_id}</span>}
                                            {formatMemoryTimestamp(it.timestamp) && (
                                                <span>{formatMemoryTimestamp(it.timestamp)}</span>
                                            )}
                                            {it.sender_name && <span>by: {it.sender_name}</span>}
                                        </div>
                                        {it.memory_id && (
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(it.memory_id)}
                                                disabled={deletingId === it.memory_id}
                                                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-500/10 transition disabled:opacity-40"
                                                aria-label={t('memoryMgmt.delete', 'Delete')}
                                            >
                                                <Trash2 size={13} />
                                                {deletingId === it.memory_id
                                                    ? t('memoryMgmt.deleting', 'Deleting...')
                                                    : t('memoryMgmt.delete', 'Delete')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {configured && (items.length > 0 || page > 1) && (
                    <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 px-6 py-3">
                        <button
                            type="button"
                            onClick={prevPage}
                            disabled={page <= 1}
                            className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-40"
                        >
                            {t('memoryMgmt.prev', 'Previous')}
                        </button>
                        <span className="text-xs font-semibold text-slate-500">
                            {t('memoryMgmt.pageInfo', 'Page {{page}}', { page })}
                        </span>
                        <button
                            type="button"
                            onClick={nextPage}
                            disabled={items.length < PAGE_SIZE}
                            className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-40"
                        >
                            {t('memoryMgmt.next', 'Next')}
                        </button>
                    </div>
                )}

                {confirmClear && (
                    <div
                        className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6"
                        onClick={(e) => { if (e.target === e.currentTarget) setConfirmClear(false) }}
                    >
                        <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="rounded-xl bg-red-500/10 p-2">
                                    <AlertTriangle size={20} className="text-red-500" />
                                </div>
                                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                    {t('memoryMgmt.clearConfirmTitle', 'Clear All Memories?')}
                                </h3>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                {t(
                                    'memoryMgmt.clearConfirmBody',
                                    'This will permanently delete all memories for your account across all types. This action cannot be undone.',
                                )}
                            </p>
                            <div className="mt-6 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setConfirmClear(false)}
                                    disabled={clearing}
                                    className="rounded-lg bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                >
                                    {t('common.cancel', 'Cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleClear}
                                    disabled={clearing}
                                    className="rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 transition disabled:opacity-60"
                                >
                                    {clearing ? t('memoryMgmt.clearing', 'Clearing...') : t('memoryMgmt.confirmClear', 'Delete All')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )

    return createPortal(modalContent, document.body)
}
