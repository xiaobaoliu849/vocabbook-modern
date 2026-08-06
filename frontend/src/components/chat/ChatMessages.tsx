import React from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquare, Languages, BookOpen, Sparkles } from 'lucide-react'
import { ChatMessageItem } from './ChatMessageItem'
import type { MemoryOverview, Message } from './types'

interface ChatMessagesProps {
    messages: Message[]
    streamingMsgId: string | null
    streamingContent: string
    streamingReasoning: string
    expandedReasoning: Record<string, boolean>
    loading: boolean
    evermemEnabled: boolean
    memoryOverview: MemoryOverview | null
    containerRef: React.RefObject<HTMLDivElement | null>
    endRef: React.RefObject<HTMLDivElement | null>
    onScroll: () => void
    onToggleReasoning: (messageId: string) => void
    onPickStarter: (prompt: string) => void
}

export function ChatMessages({
    messages,
    streamingMsgId,
    streamingContent,
    streamingReasoning,
    expandedReasoning,
    loading,
    evermemEnabled,
    memoryOverview,
    containerRef,
    endRef,
    onScroll,
    onToggleReasoning,
    onPickStarter,
}: ChatMessagesProps) {
    const { t } = useTranslation()

    return (
        <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-8 custom-scrollbar scroll-smooth relative z-10">
            {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center animate-fade-in select-none px-4">
                    <div className="max-w-lg w-full flex flex-col items-center">
                        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight text-center">
                            {t('chat.empty.title')}
                        </h1>
                        <p className="mt-2 text-[15px] text-slate-400 dark:text-slate-500 font-medium text-center">
                            {t('chat.empty.subtitle')}
                        </p>

                        <div className="mt-8 grid grid-cols-1 gap-3 w-full sm:grid-cols-2">
                            {[
                                { icon: MessageSquare, titleKey: 'chat.empty.starters.dailyTitle', descKey: 'chat.empty.starters.dailyDesc', prompt: 'Let\'s have a casual conversation in English. Ask me about my day.' },
                                { icon: Languages, titleKey: 'chat.empty.starters.scenarioTitle', descKey: 'chat.empty.starters.scenarioDesc', prompt: 'Let\'s do a role play. You be a barista and I\'ll order coffee.' },
                                { icon: BookOpen, titleKey: 'chat.empty.starters.grammarTitle', descKey: 'chat.empty.starters.grammarDesc', prompt: 'Check my grammar: "I went to supermarket yesterday and buyed some food."' },
                                { icon: Sparkles, titleKey: 'chat.empty.starters.vocabTitle', descKey: 'chat.empty.starters.vocabDesc', prompt: 'Teach me 3 ways to use the word "elaborate" in different contexts.' },
                            ].map((starter) => (
                                <button
                                    key={starter.titleKey}
                                    onClick={() => onPickStarter(starter.prompt)}
                                    className="group text-left rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white/50 dark:bg-slate-800/30 backdrop-blur-xl p-4 transition-all duration-300 hover:border-amber-400/40 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 hover:shadow-lg hover:shadow-amber-500/5 active:scale-[0.98] sm:p-5"
                                >
                                    <starter.icon size={20} className="text-slate-400 dark:text-slate-500 group-hover:text-amber-500 transition-colors" />
                                    <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                                        {t(starter.titleKey)}
                                    </p>
                                    <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                        {t(starter.descKey)}
                                    </p>
                                </button>
                            ))}
                        </div>

                        {evermemEnabled && memoryOverview?.review_focus && (
                            <div className="mt-6 flex items-center gap-2 text-xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <span className="text-amber-800 dark:text-amber-300 font-bold">
                                    {memoryOverview.review_focus.due_count} {t('chat.memory.dueToday', 'due words today')}
                                </span>
                                {memoryOverview.review_focus.difficult_count > 0 && (
                                    <>
                                        <span className="text-slate-300 dark:text-slate-600">·</span>
                                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                                            {memoryOverview.review_focus.difficult_count} {t('chat.memory.difficultWords', 'difficult words')}
                                        </span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {messages.map((msg) => {
                const isStreamingThis = msg.id === streamingMsgId
                const displayContent = isStreamingThis ? streamingContent : msg.content
                const displayReasoning = isStreamingThis ? streamingReasoning : msg.reasoningContent

                return (
                    <ChatMessageItem
                        key={msg.id}
                        msg={msg}
                        isStreaming={isStreamingThis}
                        displayContent={displayContent}
                        displayReasoning={displayReasoning}
                        isReasoningExpanded={Boolean(expandedReasoning[msg.id])}
                        showLoading={isStreamingThis && loading}
                        reasoningTitle={t('chat.reasoning.title')}
                        reasoningCollapse={t('chat.reasoning.collapse')}
                        reasoningExpand={t('chat.reasoning.expand')}
                        thinkingLabel={t('chat.loading.thinking')}
                        memorySavedLabel={t('chat.memory.savedIndicator')}
                        memoryRetrievedLabel={t('chat.memory.retrievedIndicator', { count: msg.memoriesUsed || 0 })}
                        onToggleReasoning={onToggleReasoning}
                    />
                )
            })}

            <div ref={endRef} className="h-4" />
        </div>
    )
}
