import React, { useMemo, lazy, Suspense } from 'react'
import { Brain, Bot, ChevronRight, FileText, Sparkles } from 'lucide-react'
import AudioButton from '../AudioButton'
import { createMarkdownComponents } from './markdownComponents'
import type { Message } from './types'

// 懒加载：react-markdown + remark-gfm 独立成 chunk，AIChat 页面首次渲染不阻塞
const Markdown = lazy(() => import('../Markdown'))

interface ChatMessageItemProps {
    msg: Message
    isStreaming: boolean
    displayContent: string
    displayReasoning?: string
    isReasoningExpanded: boolean
    showLoading: boolean
    reasoningTitle: string
    reasoningCollapse: string
    reasoningExpand: string
    thinkingLabel: string
    memorySavedLabel: string
    memoryRetrievedLabel: string
    onToggleReasoning: (messageId: string) => void
}

export const ChatMessageItem = React.memo(function ChatMessageItem({
    msg,
    isStreaming,
    displayContent,
    displayReasoning,
    isReasoningExpanded,
    showLoading,
    reasoningTitle,
    reasoningCollapse,
    reasoningExpand,
    thinkingLabel,
    memorySavedLabel,
    memoryRetrievedLabel,
    onToggleReasoning,
}: ChatMessageItemProps) {
    const mdComponents = useMemo(
        () => createMarkdownComponents(isStreaming, msg.role === 'user'),
        [isStreaming, msg.role]
    )

    const hasReasoning = Boolean(displayReasoning && displayReasoning.trim())

    return (
        <div className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {msg.role === 'assistant' && (
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-warm-100/90 dark:bg-warm-800/90 text-warm-600 dark:text-warm-300 shadow-sm border border-warm-200/60 dark:border-warm-700/60 self-start mt-1">
                    {hasReasoning ? (
                        <Brain className={`w-5 h-5 ${isStreaming && !displayContent ? 'animate-pulse text-primary-500 dark:text-primary-400' : ''}`} />
                    ) : (
                        <Bot className="w-5 h-5" />
                    )}
                </div>
            )}

            <div className="flex flex-col gap-2 max-w-[85%] md:max-w-[80%]">
                <div className={`px-5 py-3.5 text-[15px] leading-[1.6] relative transition-all
                    ${msg.role === 'user'
                        ? 'bg-warm-900 dark:bg-warm-100 text-white dark:text-warm-900 rounded-[22px] rounded-tr-[4px] shadow-xl shadow-warm-900/10 dark:shadow-black/20 border border-warm-800 dark:border-white whitespace-pre-wrap'
                        : 'bg-white/60 dark:bg-warm-800/60 backdrop-blur-2xl text-warm-800 dark:text-warm-200 rounded-[22px] rounded-tl-[4px] border border-white/60 dark:border-warm-700/60 shadow-sm'
                    }`}
                >
                    {msg.attachments && msg.attachments.length > 0 && (
                        <div className={`mb-3 grid gap-2 ${msg.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {msg.attachments.map(attachment => (
                                <div
                                    key={attachment.id}
                                    className={`overflow-hidden rounded-xl border ${msg.role === 'user'
                                        ? 'border-white/20 bg-white/10'
                                        : 'border-warm-200/50 bg-white dark:border-warm-700/50 dark:bg-warm-900/60'
                                        }`}
                                >
                                    {attachment.fileType === 'document' ? (
                                        <div className="flex items-center gap-3 p-3">
                                            <FileText className="h-8 w-8 flex-shrink-0 text-warm-500 dark:text-warm-400" />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium">{attachment.name}</div>
                                                <div className="text-xs opacity-60">{attachment.size ? `${(attachment.size / 1024).toFixed(0)} KB` : ''} · PDF</div>
                                            </div>
                                        </div>
                                    ) : (
                                        <img
                                            src={attachment.dataUrl}
                                            alt={attachment.name}
                                            className="block max-h-64 w-full object-cover"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {displayContent || hasReasoning ? (
                        <div className="space-y-3">
                            {msg.role === 'assistant' && hasReasoning && (
                                <div className="rounded-xl border border-warm-200/70 dark:border-warm-700/60 bg-warm-50/70 dark:bg-warm-900/40 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => onToggleReasoning(msg.id)}
                                        className="w-full flex items-center justify-between gap-2 px-3.5 py-2 text-left hover:bg-warm-100/70 dark:hover:bg-warm-800/40 transition-colors"
                                    >
                                        <span className="flex items-center gap-2 min-w-0 text-warm-700 dark:text-warm-300 text-[13px] font-semibold">
                                            <ChevronRight
                                                size={14}
                                                className={`shrink-0 text-warm-400 dark:text-warm-500 transition-transform duration-200 ${isReasoningExpanded ? 'rotate-90' : ''}`}
                                            />
                                            <span className="truncate">{reasoningTitle}</span>
                                        </span>
                                        <span className="shrink-0 text-[11px] font-semibold text-warm-400 dark:text-warm-500 uppercase tracking-wider hover:text-warm-600 dark:hover:text-warm-300">
                                            {isReasoningExpanded ? reasoningCollapse : reasoningExpand}
                                        </span>
                                    </button>
                                    <div
                                        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${isReasoningExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                                    >
                                        <div className="overflow-hidden">
                                            {isReasoningExpanded && (
                                                <div className="border-t border-warm-200/60 dark:border-warm-700/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-warm-600 dark:text-warm-300 max-h-[20rem] overflow-y-auto custom-scrollbar italic bg-white/40 dark:bg-warm-950/20">
                                                    <Suspense fallback={null}>
                                                        <Markdown gfm components={mdComponents}>
                                                            {(displayReasoning || '') + (isStreaming && !displayContent ? '▋' : '')}
                                                        </Markdown>
                                                    </Suspense>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {displayContent && (
                                <div className="tracking-normal">
                                    <Suspense fallback={null}>
                                        <Markdown gfm components={mdComponents}>
                                            {displayContent + (isStreaming ? '▋' : '')}
                                        </Markdown>
                                    </Suspense>
                                </div>
                            )}
                            {msg.role === 'assistant' && displayContent && !isStreaming && (
                                <div className="mt-3 flex items-center justify-end border-t border-warm-200/30 dark:border-warm-700/30 pt-2">
                                    <AudioButton
                                        text={displayContent}
                                        useTTS={true}
                                        size={14}
                                        className="!p-2 hover:bg-white dark:hover:bg-warm-700 border border-transparent hover:border-warm-200 dark:hover:border-warm-600 rounded-lg text-warm-400 hover:text-primary-600 dark:text-warm-500 dark:hover:text-primary-400 transition-all"
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        msg.role === 'assistant' && showLoading && (
                            <div className="flex gap-2 items-center h-6">
                                <div className="flex gap-1">
                                    <div className="w-1.5 h-1.5 bg-warm-400 dark:bg-warm-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 bg-warm-400 dark:bg-warm-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-warm-400 dark:bg-warm-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                <span className="text-xs font-semibold text-warm-500 dark:text-warm-400 uppercase tracking-widest animate-pulse">
                                    {thinkingLabel}
                                </span>
                            </div>
                        )
                    )}
                </div>

                <div className={`flex items-center gap-3 px-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'user' && msg.memorySaved && (
                        <span className="text-[10px] text-amber-700/80 dark:text-amber-300/80 flex items-center gap-1 font-semibold uppercase tracking-wider">
                            <div className="h-1 w-1 rounded-full bg-amber-500 animate-pulse" /> {memorySavedLabel}
                        </span>
                    )}
                    {msg.role === 'assistant' && (msg.memoriesUsed || 0) > 0 && (
                        <span className="text-[10px] text-amber-700/80 dark:text-amber-300/80 flex items-center gap-1 font-semibold uppercase tracking-wider">
                            <Sparkles size={10} className="text-amber-500" /> {memoryRetrievedLabel}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
})
