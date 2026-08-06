import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Menu, Languages, Sparkles, Plus, MoreHorizontal, Eraser, Trash2 } from 'lucide-react'
import EvermemLogo from '../../assets/evermind-powered.svg'

interface ChatHeaderProps {
    sidebarOpen: boolean
    model: string
    evermemEnabled: boolean
    memoryPanelOpen: boolean
    onOpenTranslation?: () => void
    onToggleSidebar: () => void
    onToggleMemoryPanel: () => void
    onNewSession: () => void
    onClearSession: () => void
    onDeleteActiveSession: (e: React.MouseEvent) => void
}

export function ChatHeader({
    sidebarOpen,
    model,
    evermemEnabled,
    memoryPanelOpen,
    onOpenTranslation,
    onToggleSidebar,
    onToggleMemoryPanel,
    onNewSession,
    onClearSession,
    onDeleteActiveSession,
}: ChatHeaderProps) {
    const { t } = useTranslation()
    const [showChatActions, setShowChatActions] = useState(false)
    const [actionsPos, setActionsPos] = useState({ top: 0, right: 0 })
    const actionsBtnRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (!showChatActions) return
        const handleClickOutside = (e: MouseEvent) => {
            if (actionsBtnRef.current?.contains(e.target as Node)) return
            setShowChatActions(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showChatActions])

    return (
        <>
            {/* Header */}
            <div className="flex-none h-16 border-b border-slate-200/30 dark:border-slate-700/30 flex items-center justify-between px-6 bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl sticky top-0 z-10">
                <div className="flex items-center gap-3 min-w-0 flex-shrink-1">
                    <button
                        onClick={onToggleSidebar}
                        className="p-2 -ml-2 text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400 rounded-xl hover:bg-white/50 dark:hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-200/50 dark:hover:border-slate-700/50"
                        title={sidebarOpen ? t('chat.actions.collapseHistory') : t('chat.actions.expandHistory')}
                    >
                        <Menu size={18} />
                    </button>

                    <div className="flex items-center gap-2.5 min-w-0">
                        <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5 flex-shrink-0">
                            <span>{t('chat.header.title')}</span>
                        </h2>
                        <span className="text-slate-200 dark:text-slate-800 text-xs">|</span>
                        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100/80 dark:bg-slate-800/80 text-[11px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200/20 dark:border-slate-700/20">
                                <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="truncate max-w-[120px]">{model || t('chat.header.defaultModel')}</span>
                            </span>
                            {evermemEnabled && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 dark:bg-amber-400/10 text-[11px] font-bold text-amber-800 dark:text-amber-200 border border-amber-500/20 dark:border-amber-500/30 tracking-wider uppercase">
                                    <img src={EvermemLogo} className="w-3.5 h-3.5 object-contain opacity-90" alt="Evermem" />
                                    EVERMIND ACTIVE
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {onOpenTranslation && (
                        <button
                            onClick={onOpenTranslation}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200/50 bg-white/30 text-xs font-bold text-slate-600 transition-all hover:bg-white/60 hover:border-primary-200 dark:border-slate-700/50 dark:bg-slate-800/30 dark:text-slate-300 dark:hover:bg-slate-800/60 shadow-sm"
                            title={t('sidebar.translationTooltip')}
                        >
                            <Languages size={13} />
                            <span className={`hidden ${sidebarOpen ? 'xl:inline' : 'lg:inline'}`}>{t('sidebar.translation')}</span>
                        </button>
                    )}
                    {evermemEnabled && (
                        <button
                            onClick={onToggleMemoryPanel}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xs ${memoryPanelOpen
                                ? 'border-amber-300/60 bg-amber-50/80 text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200'
                                : 'border-slate-200/50 bg-white/30 text-slate-600 hover:bg-white/60 hover:border-amber-300/50 dark:border-slate-700/50 dark:bg-slate-800/30 dark:text-slate-300 dark:hover:bg-slate-800/60'
                                }`}
                            title={t('chat.memory.panel.title')}
                        >
                            <Sparkles size={13} className={memoryPanelOpen ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} />
                            <span className={`hidden ${sidebarOpen ? 'xl:inline' : 'sm:inline'}`}>{t('chat.memory.panel.button')}</span>
                        </button>
                    )}
                    <button
                        onClick={onNewSession}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:scale-[1.02] active:scale-[0.98] text-xs font-bold rounded-xl transition-all shadow-sm"
                        title={t('chat.actions.newChatTitle')}
                    >
                        <Plus size={14} />
                        <span className={`hidden ${sidebarOpen ? 'xl:inline' : 'sm:inline'}`}>{t('chat.actions.newChat')}</span>
                    </button>

                    <div className="relative">
                        <button
                            ref={actionsBtnRef}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (showChatActions) {
                                    setShowChatActions(false);
                                } else {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setActionsPos({ top: rect.bottom + 12, right: window.innerWidth - rect.right });
                                    setShowChatActions(true);
                                }
                            }}
                            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-white/50 dark:hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-200/50 dark:hover:border-slate-700/50"
                            title={t('chat.actions.moreOptions')}
                        >
                            <MoreHorizontal size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Chat Actions Dropdown */}
            {showChatActions && (
                <div
                    className="fixed z-50 min-w-[200px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 dark:border-slate-800/60 overflow-hidden p-1.5 animate-scale-in"
                    style={{ top: actionsPos.top, right: actionsPos.right }}
                >
                    <button
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 rounded-xl transition-all text-left font-bold text-xs uppercase tracking-wider"
                        onClick={() => {
                            setShowChatActions(false);
                            onClearSession();
                        }}
                    >
                        <Eraser size={16} className="opacity-60" />
                        <span>{t('chat.actions.clearCurrentMessages')}</span>
                    </button>

                    <button
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-red-500 hover:bg-red-500/10 rounded-xl transition-all text-left font-bold text-xs uppercase tracking-wider mt-1"
                        onClick={(e) => {
                            setShowChatActions(false);
                            onDeleteActiveSession(e);
                        }}
                    >
                        <Trash2 size={16} className="opacity-60" />
                        <span>{t('chat.actions.deleteSessionRecord')}</span>
                    </button>
                </div>
            )}
        </>
    )
}
