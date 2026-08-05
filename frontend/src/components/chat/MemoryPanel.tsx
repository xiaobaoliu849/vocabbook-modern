import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, RotateCw, X } from 'lucide-react'
import MemoryManagementModal from '../MemoryManagementModal'
import type { MemoryOverview } from './types'

interface MemoryPanelProps {
    isOpen: boolean
    memoryOverview: MemoryOverview | null
    loading: boolean
    error: string | null
    updatedAt: number | null
    weakWords: MemoryOverview['review_focus']['weak_words']
    canStartWeakWordPractice: boolean
    onClose: () => void
    onRefresh: () => void
    onPractice: () => void
    onDismissForesight: (memoryId: string) => void
    onPickSuggestion: (text: string) => void
    onMemoryDataChanged: () => void
}

export function MemoryPanel({
    isOpen,
    memoryOverview,
    loading,
    error,
    updatedAt,
    weakWords,
    canStartWeakWordPractice,
    onClose,
    onRefresh,
    onPractice,
    onDismissForesight,
    onPickSuggestion,
    onMemoryDataChanged,
}: MemoryPanelProps) {
    const { t } = useTranslation()
    const [memoryMgmtOpen, setMemoryMgmtOpen] = useState(false)

    const formatMemoryTimestamp = (timestamp?: string) => {
        if (!timestamp) return ''
        try {
            return new Date(timestamp).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch {
            return ''
        }
    }

    const formatPanelUpdatedAt = (timestamp: number | null) => {
        if (!timestamp) return ''
        try {
            return new Date(timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch {
            return ''
        }
    }

    const handleCloseManagement = () => {
        setMemoryMgmtOpen(false)
        onMemoryDataChanged()
    }

    return (
        <>
            <div className={`absolute inset-y-0 right-0 z-30 w-full max-w-sm border-l border-white/20 dark:border-slate-800/20 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-200/20 dark:border-slate-700/20 px-6 py-6">
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                {t('chat.memory.panel.title')}
                            </p>
                            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                                {t('chat.memory.panel.subtitle')}
                            </p>
                            {updatedAt && (
                                <p className="mt-1 text-[10px] font-bold text-amber-500/60 uppercase tracking-wider">
                                    {t('chat.memory.panel.updatedAt', { time: formatPanelUpdatedAt(updatedAt) })}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setMemoryMgmtOpen(true)}
                                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-xs font-bold text-slate-500 transition-all hover:bg-white/50 hover:text-amber-600 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-amber-400"
                                title={t('chat.memory.panel.manage')}
                                aria-label={t('chat.memory.panel.manage')}
                            >
                                <Settings size={16} />
                                <span className="hidden sm:inline">{t('chat.memory.panel.manage')}</span>
                            </button>
                            <button
                                onClick={onRefresh}
                                className="rounded-xl p-2.5 text-slate-400 transition-all hover:bg-white/50 dark:hover:bg-slate-800/50 hover:text-amber-500"
                                title={t('chat.memory.panel.refresh')}
                            >
                                <RotateCw size={16} className={loading ? 'animate-spin' : ''} />
                            </button>
                            <button
                                onClick={onClose}
                                className="rounded-xl p-2.5 text-slate-400 transition-all hover:bg-white/50 dark:hover:bg-slate-800/50 hover:text-slate-600"
                                title={t('chat.memory.panel.close')}
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 custom-scrollbar">
                        {loading && !memoryOverview && (
                            <div className="flex flex-col items-center justify-center h-40 space-y-3">
                                <div className="w-8 h-8 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('chat.memory.panel.loading')}</p>
                            </div>
                        )}

                        {!loading && error && (
                            <div className="rounded-2xl border border-red-200/50 bg-red-500/5 px-4 py-4 text-xs font-bold text-red-500 uppercase tracking-wider">
                                {error}
                            </div>
                        )}

                        {!loading && memoryOverview?.requires_auth && (
                            <div className="rounded-2xl border border-amber-200/50 bg-amber-500/5 px-4 py-4 text-xs font-bold text-amber-600 uppercase tracking-wider">
                                {t('chat.memory.panel.requiresAuth')}
                            </div>
                        )}

                        {!loading && !memoryOverview?.requires_auth && (
                            <>
                                <div className="rounded-2xl border border-slate-200/30 bg-white/40 dark:bg-slate-800/40 p-5 shadow-sm">
                                    <div className="flex items-center justify-between gap-3 mb-4">
                                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                            {t('chat.memory.panel.reviewFocusTitle')}
                                        </p>
                                        <div className="flex gap-2">
                                            <span className="rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-200/30">
                                                {memoryOverview?.review_focus?.due_count || 0}
                                            </span>
                                        </div>
                                    </div>

                                    {weakWords.length > 0 ? (
                                        <div className="space-y-2">
                                            {weakWords.slice(0, 4).map(item => (
                                                <div key={item.word} className="rounded-xl border border-white/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-900/40 px-3 py-2.5 transition-all hover:bg-white/80 dark:hover:bg-slate-900/60">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                                                                {item.word}
                                                            </p>
                                                            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                                                {item.meaning || t('chat.memory.panel.noMeaning')}
                                                            </p>
                                                        </div>
                                                        <span className={`shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-bold ${item.is_due ? 'bg-amber-500/10 text-amber-600 border border-amber-200/30' : 'bg-slate-500/10 text-slate-500 border border-slate-200/30'}`}>
                                                            {item.error_count}x
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs font-medium text-slate-400 italic">
                                            {t('chat.memory.panel.noWeakWords')}
                                        </p>
                                    )}

                                    <button
                                        type="button"
                                        onClick={onPractice}
                                        disabled={!canStartWeakWordPractice}
                                        className="mt-5 w-full rounded-2xl bg-amber-500 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-600 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:hover:scale-100 uppercase tracking-widest"
                                    >
                                        {t('chat.memory.panel.practiceAction')}
                                    </button>
                                </div>

                                {(memoryOverview?.foresights?.length ?? 0) > 0 && (
                                    <div className="rounded-2xl border border-blue-200/30 bg-blue-500/5 p-5 shadow-sm">
                                        <p className="text-xs font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-4">
                                            {t('chat.memory.panel.foresightTitle')}
                                        </p>
                                        <div className="space-y-3">
                                            {(memoryOverview?.foresights || []).map((fs, index) => (
                                                <div key={fs.memory_id || index} className="relative pl-4 border-l-2 border-blue-500/20 pr-6">
                                                    <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                                                        {fs.content}
                                                    </p>
                                                    {fs.timestamp && (
                                                        <span className="text-[10px] font-bold text-slate-400 mt-1 block">
                                                            {formatMemoryTimestamp(fs.timestamp)}
                                                        </span>
                                                    )}
                                                    {fs.memory_id && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onDismissForesight(fs.memory_id!)}
                                                            className="absolute top-0 right-0 rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-all"
                                                            title={t('chat.memory.panel.foresightDismiss')}
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="rounded-2xl border border-slate-200/30 bg-white/40 dark:bg-slate-800/40 p-5 shadow-sm">
                                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                                        {t('chat.memory.panel.profileTitle')}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {(memoryOverview?.profile_facts || []).length > 0 ? (
                                            memoryOverview?.profile_facts.map((fact, index) => (
                                                <div key={`${fact}-${index}`} className="rounded-xl border border-white/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-900/40 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                                                    {fact}
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-xs font-medium text-slate-400 italic">
                                                {t('chat.memory.panel.noProfile')}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200/30 bg-white/40 dark:bg-slate-800/40 p-5 shadow-sm">
                                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                                        {t('chat.memory.panel.recentTitle')}
                                    </p>
                                    <div className="space-y-3">
                                        {(memoryOverview?.recent_memories || []).length > 0 ? (
                                            memoryOverview?.recent_memories.map((item, index) => (
                                                <div key={`${item.content}-${index}`} className="relative pl-4 border-l-2 border-amber-500/20">
                                                    <div className="flex items-center justify-between gap-3 mb-1">
                                                        <span className={`text-[10px] font-bold uppercase tracking-widest ${item.bucket === 'review' ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                            {item.bucket === 'review' ? t('chat.memory.panel.reviewBucket') : t('chat.memory.panel.chatBucket')}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-400">
                                                            {formatMemoryTimestamp(item.timestamp)}
                                                        </span>
                                                    </div>
                                                    <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                                                        {item.content}
                                                    </p>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-xs font-medium text-slate-400 italic">
                                                {t('chat.memory.panel.noRecent')}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {(memoryOverview?.suggestions || []).length > 0 && (
                                    <div className="rounded-2xl border border-amber-200/30 bg-amber-500/5 p-5">
                                        <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-4">
                                            {t('chat.memory.panel.nextTitle')}
                                        </p>
                                        <div className="space-y-2">
                                            {memoryOverview?.suggestions.map((item, index) => (
                                                <button
                                                    key={`${item}-${index}`}
                                                    onClick={() => onPickSuggestion(item)}
                                                    className="w-full text-left rounded-xl bg-white/60 dark:bg-slate-900/40 px-3.5 py-3 text-[13px] font-bold leading-snug text-slate-600 dark:text-slate-300 border border-white/60 dark:border-slate-700/60 hover:bg-white dark:hover:bg-slate-900/80 transition-all"
                                                >
                                                    {item}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
            <MemoryManagementModal isOpen={memoryMgmtOpen} onClose={handleCloseManagement} />
        </>
    )
}
