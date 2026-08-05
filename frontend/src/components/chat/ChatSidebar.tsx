import React from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search, MessageSquare, Edit2, Trash2 } from 'lucide-react'
import { isDefaultNewChatTitle, LEGACY_MIGRATED_CHAT_TITLE } from '../../utils/chatScope'
import type { ChatSession } from './types'

interface ChatSidebarProps {
    isOpen: boolean
    sessions: ChatSession[]
    groupedSessions: Record<string, ChatSession[]>
    activeSessionId: string | null
    searchQuery: string
    editingSessionId: string | null
    editingTitle: string
    onClose: () => void
    onNewSession: () => void
    onSearchChange: (value: string) => void
    onSelectSession: (sessionId: string) => void
    onStartRename: (e: React.MouseEvent, session: ChatSession) => void
    onCommitRename: (sessionId: string) => void
    onCancelRename: () => void
    onEditingTitleChange: (value: string) => void
    onDeleteSession: (e: React.MouseEvent, sessionId: string) => void
    onClearAll: () => void
}

export function ChatSidebar({
    isOpen,
    sessions,
    groupedSessions,
    activeSessionId,
    searchQuery,
    editingSessionId,
    editingTitle,
    onClose,
    onNewSession,
    onSearchChange,
    onSelectSession,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onEditingTitleChange,
    onDeleteSession,
    onClearAll,
}: ChatSidebarProps) {
    const { t } = useTranslation()

    const getDisplaySessionTitle = (title: string) => {
        if (isDefaultNewChatTitle(title)) return t('chat.session.newChat')
        if (title === LEGACY_MIGRATED_CHAT_TITLE) return t('chat.session.migratedChat')
        return title
    }

    const formatSessionTimestamp = (timestamp: number) => {
        const date = new Date(timestamp)
        const now = new Date()
        const sameDay = date.toDateString() === now.toDateString()
        const yesterday = new Date(now)
        yesterday.setDate(now.getDate() - 1)
        const isYesterday = date.toDateString() === yesterday.toDateString()

        if (sameDay) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
        if (isYesterday) {
            return t('chat.sidebar.yesterday')
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }

    const getSessionPreview = (session: ChatSession) => {
        const lastMessage = [...session.messages].reverse().find(message => {
            if (message.content?.trim()) return true
            return Boolean(message.attachments && message.attachments.length > 0)
        })
        if (!lastMessage) return t('chat.sidebar.emptySession')
        if (lastMessage.content?.trim()) return lastMessage.content.trim()
        if (lastMessage.attachments && lastMessage.attachments.length > 0) {
            return t('chat.sidebar.imageMessage', { count: lastMessage.attachments.length })
        }
        return t('chat.sidebar.emptySession')
    }

    return (
        <>
            {/* Global Sidebar Overlay (Mobile only) */}
            {isOpen && (
                <div
                    className="absolute inset-0 z-40 bg-slate-900/15 dark:bg-slate-900/40 backdrop-blur-[1px] lg:bg-transparent lg:backdrop-blur-none transition-opacity duration-300 opacity-100 pointer-events-auto cursor-pointer"
                    onClick={onClose}
                />
            )}

            {/* Sidebar Drawer */}
            <div className={`
                absolute lg:relative inset-y-0 left-0 z-50
                bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl flex flex-col shadow-2xl lg:shadow-none transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden
                ${isOpen
                    ? 'translate-x-0 w-72 lg:w-72 opacity-100 lg:opacity-100 border-r border-white/20 dark:border-slate-800/20 lg:border-r lg:border-white/20 lg:dark:border-slate-800/20'
                    : '-translate-x-full lg:translate-x-0 lg:w-0 lg:opacity-0 lg:border-none'
                }
            `}>
                <div className="flex-none px-6 pt-8 pb-4">
                    <div className="flex items-center justify-between gap-3 mb-6">
                        <p className="text-[10px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-[0.2em]">
                            {t('chat.sidebar.title')}
                        </p>
                        <button
                            onClick={onNewSession}
                            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-lg shadow-slate-900/10 dark:shadow-black/20 hover:scale-110 active:scale-95 transition-all"
                            title={t('chat.actions.newChatTitle')}
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative group">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder={t('chat.sidebar.searchPlaceholder', 'Search history...')}
                            className="w-full bg-white/40 dark:bg-slate-800/40 border border-white/60 dark:border-slate-700/60 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6 custom-scrollbar">
                    {(Object.entries(groupedSessions) as [string, ChatSession[]][]).map(([key, groupSessions]) => {
                        if (groupSessions.length === 0) return null;
                        return (
                            <div key={key} className="space-y-2">
                                <h3 className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="h-px flex-1 bg-slate-200/50 dark:bg-slate-700/50" />
                                    {t(`chat.sidebar.groups.${key}`)}
                                    <span className="h-px flex-1 bg-slate-200/50 dark:bg-slate-700/50" />
                                </h3>
                                <div className="space-y-1">
                                    {groupSessions.map(session => (
                                        <div
                                            key={session.id}
                                            onClick={() => {
                                                onSelectSession(session.id);
                                                if (window.innerWidth < 1024) onClose();
                                            }}
                                            className={`
                                                group relative rounded-2xl border p-3 cursor-pointer transition-all duration-300
                                                ${activeSessionId === session.id
                                                    ? 'border-amber-500/30 bg-amber-500/10 dark:bg-amber-400/10 shadow-sm'
                                                    : 'border-transparent hover:bg-white/40 dark:hover:bg-slate-800/40'
                                                }
                                            `}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all ${activeSessionId === session.id ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 scale-110' : 'bg-white/50 dark:bg-slate-800/50 text-slate-400 border border-slate-200/50 dark:border-slate-700/50'}`}>
                                                    <MessageSquare size={14} />
                                                </div>
                                                {editingSessionId === session.id ? (
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        value={editingTitle}
                                                        onChange={(e) => onEditingTitleChange(e.target.value)}
                                                        onBlur={() => onCommitRename(session.id)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') onCommitRename(session.id);
                                                            else if (e.key === 'Escape') onCancelRename();
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-full bg-white dark:bg-slate-900 border border-amber-500 rounded-xl px-2 py-1 text-xs text-slate-800 dark:text-white outline-none font-bold"
                                                    />
                                                ) : (
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className={`block truncate text-xs font-bold ${activeSessionId === session.id ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                                                {getDisplaySessionTitle(session.title)}
                                                            </span>
                                                            <span className="text-[9px] font-bold text-slate-400/80 dark:text-slate-500 shrink-0">
                                                                {formatSessionTimestamp(session.updatedAt)}
                                                            </span>
                                                        </div>
                                                        <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                                            {getSessionPreview(session)}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {editingSessionId !== session.id && (
                                                <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => onStartRename(e, session)}
                                                        className="p-1.5 text-slate-400 hover:text-amber-500 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-all"
                                                        title={t('chat.actions.rename')}
                                                    >
                                                        <Edit2 size={11} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => onDeleteSession(e, session.id)}
                                                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-all"
                                                        title={t('chat.actions.delete')}
                                                    >
                                                        <Trash2 size={11} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="flex-none p-4">
                    <button
                        onClick={onClearAll}
                        disabled={sessions.length === 0}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-red-200/50 bg-red-500/5 px-4 py-3 text-[10px] font-black text-red-500 transition-all hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-20 uppercase tracking-[0.2em]"
                    >
                        <Trash2 size={14} />
                        {t('chat.actions.deleteAllSessions')}
                    </button>
                </div>
            </div>
        </>
    )
}
