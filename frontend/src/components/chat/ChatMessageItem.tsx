import React, { useMemo } from 'react'
import { Brain, Bot, ChevronRight, FileText, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AudioButton from '../AudioButton'
import { createMarkdownComponents } from './markdownComponents'
import type { Message } from './types'

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
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md text-amber-600 dark:text-amber-400 shadow-lg shadow-slate-200/10 dark:shadow-black/20 border border-white/50 dark:border-slate-700/50 self-start mt-1">
                    {hasReasoning ? (
                        <Brain className={`w-5 h-5 ${isStreaming && !displayContent ? 'animate-pulse' : ''}`} />
                    ) : (
                        <Bot className="w-5 h-5" />
                    )}
                </div>
            )}

            <div className="flex flex-col gap-2 max-w-[85%] md:max-w-[80%]">
                <div className={`px-5 py-3.5 text-[15px] leading-[1.6] relative transition-all
                    ${msg.role === 'user'
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-[22px] rounded-tr-[4px] shadow-xl shadow-slate-900/10 dark:shadow-black/20 border border-slate-800 dark:border-white whitespace-pre-wrap'
                        : 'bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl text-slate-800 dark:text-slate-200 rounded-[22px] rounded-tl-[4px] border border-white/60 dark:border-slate-700/60 shadow-sm'
                    }`}
                >
                    {msg.attachments && msg.attachments.length > 0 && (
                        <div className={`mb-3 grid gap-2 ${msg.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {msg.attachments.map(attachment => (
                                <div
                                    key={attachment.id}
                                    className={`overflow-hidden rounded-xl border ${msg.role === 'user'
                                        ? 'border-white/20 bg-white/10'
                                        : 'border-slate-200/50 bg-white dark:border-slate-700/50 dark:bg-slate-900/60'
                                        }`}
                                >
                                    {attachment.fileType === 'document' ? (
                                        <div className="flex items-center gap-3 p-3">
                                            <FileText className="h-8 w-8 flex-shrink-0 text-amber-600" />
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
                                <div className="rounded-xl border border-amber-200/40 dark:border-amber-700/30 bg-amber-50/40 dark:bg-amber-900/10 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => onToggleReasoning(msg.id)}
                                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-amber-100/40 dark:hover:bg-amber-800/20 transition-colors"
                                    >
                                        <span className="flex items-center gap-2 min-w-0 text-amber-700 dark:text-amber-300 text-[13px] font-bold">
                                            <ChevronRight
                                                size={14}
                                                className={`shrink-0 transition-transform duration-200 ${isReasoningExpanded ? 'rotate-90' : ''}`}
                                            />
                                            <span className="truncate">{reasoningTitle}</span>
                                        </span>
                                        <span className="shrink-0 text-[10px] font-bold text-amber-400 dark:text-amber-500 uppercase tracking-wider">
                                            {isReasoningExpanded ? reasoningCollapse : reasoningExpand}
                                        </span>
                                    </button>
                                    <div
                                        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${isReasoningExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                                    >
                                        <div className="overflow-hidden">
                                            {isReasoningExpanded && (
                                                <div className="border-t border-amber-200/40 dark:border-amber-700/30 px-3 py-2 text-[13px] leading-relaxed text-amber-700/80 dark:text-amber-200/80 max-h-[20rem] overflow-y-auto custom-scrollbar italic">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                                                        {(displayReasoning || '') + (isStreaming && !displayContent ? '▋' : '')}
                                                    </ReactMarkdown>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {displayContent && (
                                <div className="tracking-normal">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                                        {displayContent + (isStreaming ? '▋' : '')}
                                    </ReactMarkdown>
                                </div>
                            )}
                            {msg.role === 'assistant' && displayContent && !isStreaming && (
                                <div className="mt-3 flex items-center justify-end border-t border-slate-200/30 dark:border-slate-700/30 pt-2">
                                    <AudioButton
                                        text={displayContent}
                                        useTTS={true}
                                        size={14}
                                        className="!p-2 hover:bg-white dark:hover:bg-slate-700 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 rounded-lg text-slate-400 hover:text-primary-600 dark:text-slate-500 dark:hover:text-primary-400 transition-all"
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        msg.role === 'assistant' && showLoading && (
                            <div className="flex gap-2 items-center h-6">
                                <div className="flex gap-1">
                                    <div className="w-1.5 h-1.5 bg-amber-400 dark:bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 bg-amber-400 dark:bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-amber-400 dark:bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                <span className="text-xs font-bold text-amber-500/80 dark:text-amber-400/80 uppercase tracking-widest animate-pulse">
                                    {thinkingLabel}
                                </span>
                            </div>
                        )
                    )}
                </div>

                <div className={`flex items-center gap-3 px-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'user' && msg.memorySaved && (
                        <span className="text-[10px] text-amber-500/80 dark:text-amber-400/80 flex items-center gap-1 font-bold uppercase tracking-wider">
                            <div className="h-1 w-1 rounded-full bg-amber-500 animate-pulse" /> {memorySavedLabel}
                        </span>
                    )}
                    {msg.role === 'assistant' && (msg.memoriesUsed || 0) > 0 && (
                        <span className="text-[10px] text-amber-500/80 dark:text-amber-400/80 flex items-center gap-1 font-bold uppercase tracking-wider">
                            <Sparkles size={10} /> {memoryRetrievedLabel}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
})
