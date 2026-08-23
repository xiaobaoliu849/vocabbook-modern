import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Paperclip, Send, X } from 'lucide-react'
import type { Attachment } from './types'

interface ComposerProps {
    input: string
    pendingAttachments: Attachment[]
    loading: boolean
    activeSessionId: string | null
    isInitialized: boolean
    inputRef: React.RefObject<HTMLTextAreaElement | null>
    onInputChange: (value: string) => void
    onSend: () => void
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
    onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void
    onRemoveAttachment: (attachmentId: string) => void
}

export function Composer({
    input,
    pendingAttachments,
    loading,
    activeSessionId,
    isInitialized,
    inputRef,
    onInputChange,
    onSend,
    onFileSelect,
    onPaste,
    onDrop,
    onRemoveAttachment,
}: ComposerProps) {
    const { t } = useTranslation()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isDragOverComposer, setIsDragOverComposer] = useState(false)

    const canSend = (!input.trim() && pendingAttachments.length === 0) || loading || !activeSessionId || !isInitialized

    return (
        <div className="flex-none px-6 pb-8 pt-4 bg-transparent relative z-20">
            <div className="absolute inset-0 bg-gradient-to-t from-warm-50/50 dark:from-warm-950/50 to-transparent pointer-events-none" />
            <div className="relative max-w-4xl mx-auto">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    onChange={onFileSelect}
                />
                <div
                    className={`bg-white/60 dark:bg-warm-800/60 backdrop-blur-xl rounded-[28px] shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/60 dark:border-warm-700/60 p-2 flex flex-col relative focus-within:ring-2 focus-within:ring-amber-500/30 transition-all cursor-text group ${isDragOverComposer ? 'ring-2 ring-amber-500/40 bg-amber-50/30 dark:bg-amber-900/20' : ''}`}
                    onClick={() => inputRef.current?.focus()}
                    onDragOver={(event) => {
                        event.preventDefault()
                        setIsDragOverComposer(true)
                    }}
                    onDragEnter={(event) => {
                        event.preventDefault()
                        setIsDragOverComposer(true)
                    }}
                    onDragLeave={(event) => {
                        if (event.currentTarget.contains(event.relatedTarget as Node)) return
                        setIsDragOverComposer(false)
                    }}
                    onDrop={(event) => {
                        setIsDragOverComposer(false)
                        onDrop(event)
                    }}
                >
                    {pendingAttachments.length > 0 && (
                        <div className="px-3 pt-2 pb-1">
                            <div className="flex flex-wrap gap-2">
                                {pendingAttachments.map(attachment => (
                                    <div
                                        key={attachment.id}
                                        className="group relative w-16 h-16 overflow-hidden rounded-2xl border border-white/60 dark:border-warm-700/60 bg-white/40 shadow-sm"
                                    >
                                        {attachment.fileType === 'image' ? (
                                            <img
                                                src={attachment.dataUrl}
                                                alt={attachment.name}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full flex-col items-center justify-center bg-amber-50 dark:bg-amber-900/30 p-1">
                                                <FileText className="h-5 w-5 text-amber-600" />
                                                <span className="mt-0.5 truncate text-[8px] text-amber-700 dark:text-amber-400 max-w-full">{attachment.ext?.toUpperCase()}</span>
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onRemoveAttachment(attachment.id)
                                            }}
                                            className="absolute top-1 right-1 rounded-full bg-warm-900/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                            title={t('chat.attachments.removeImage')}
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="flex items-end gap-2 w-full">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                fileInputRef.current?.click()
                            }}
                            className="mb-1 flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-2xl text-warm-400 transition-all hover:bg-white/50 dark:hover:bg-warm-700/50 hover:text-amber-600 dark:hover:text-amber-400 border border-transparent hover:border-white/60 dark:hover:border-warm-700/60"
                            title={t('chat.attachments.attachFile')}
                        >
                            <Paperclip size={20} />
                        </button>
                        <textarea
                            ref={inputRef}
                            autoFocus
                            value={input}
                            onChange={(e) => onInputChange(e.target.value)}
                            onPaste={onPaste}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    onSend()
                                }
                            }}
                            placeholder={t('chat.input.placeholder')}
                            className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 px-2 py-3 max-h-48 min-h-[44px] resize-none text-[15px] text-warm-800 dark:text-white placeholder-warm-400 font-medium custom-scrollbar"
                            rows={1}
                        />
                        <button
                            onClick={onSend}
                            disabled={canSend}
                            className="mb-1 flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-2xl bg-warm-900 dark:bg-warm-100 disabled:bg-warm-200 dark:disabled:bg-warm-800 disabled:text-warm-400 dark:disabled:text-warm-600 text-white dark:text-warm-900 transition-all shadow-lg hover:scale-[1.05] active:scale-[0.95] disabled:hover:scale-100 disabled:shadow-none"
                        >
                            {loading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-50" /> : <Send size={18} className="translate-x-[1px]" />}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    )
}
