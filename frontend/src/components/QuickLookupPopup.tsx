import { useState, useEffect, useRef, useCallback, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { X, BookOpen, Languages, Check, Loader2, ExternalLink, Copy, Sprout, RefreshCw, Sparkles } from 'lucide-react'
import AudioButton from './AudioButton'
import { api, ApiError, API_PATHS, getClientId } from '../utils/api'
import { useShortcuts } from '../context/ShortcutContext'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

type QuickLookupType = 'word' | 'translate' | 'explain'

interface QuickLookupProps {
    text: string
    type: QuickLookupType
    position: { x: number; y: number }
    onClose: () => void
    onNavigateToAddWord?: (word: string) => void
}

function getAiSettings() {
    const provider = localStorage.getItem('ai_provider') || 'dashscope'

    let apiKey = ''
    try {
        const keysMap = JSON.parse(localStorage.getItem('ai_api_keys_map') || '{}')
        apiKey = keysMap[provider] || ''
    } catch {
        // ignore malformed config
    }
    if (!apiKey) apiKey = localStorage.getItem('ai_api_key') || ''

    let model = ''
    try {
        const modelsMap = JSON.parse(localStorage.getItem('ai_models_map') || '{}')
        model = modelsMap[provider] || ''
    } catch {
        // ignore malformed config
    }
    if (!model) model = localStorage.getItem('ai_model') || 'qwen3.5-flash'

    let apiBase = ''
    try {
        const basesMap = JSON.parse(localStorage.getItem('ai_bases_map') || '{}')
        apiBase = basesMap[provider] || ''
    } catch {
        // ignore malformed config
    }

    return { provider, apiKey, model, apiBase }
}

const isSingleWordLookup = (text: string) => /^[A-Za-z][A-Za-z'-]{0,47}$/.test(text)

export default function QuickLookupPopup({ text, type, position, onClose, onNavigateToAddWord }: QuickLookupProps) {
    const { t } = useTranslation()
    const { matches } = useShortcuts()
    const { token } = useAuth()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [wordData, setWordData] = useState<any>(null)
    const [translation, setTranslation] = useState<string | null>(null)
    const [explanation, setExplanation] = useState<string | null>(null)
    const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'exists' | 'error'>('idle')
    const [copied, setCopied] = useState(false)
    const [translationSaved, setTranslationSaved] = useState(false)
    const [streaming, setStreaming] = useState(false)
    const popupRef = useRef<HTMLDivElement>(null)
    const [popupStyle, setPopupStyle] = useState<CSSProperties>({})
    const dragOffsetRef = useRef<{ x: number; y: number } | null>(null)

    const getPopupMetrics = useCallback(() => {
        const width = 420
        const height = type === 'explain' ? 480 : 420
        const margin = 12
        return { width, height, margin }
    }, [type])

    const clampPopupPosition = useCallback((x: number, y: number) => {
        const { width, height, margin } = getPopupMetrics()
        const maxX = window.innerWidth - width - margin
        const maxY = window.innerHeight - height - margin

        return {
            x: Math.min(Math.max(x, margin), Math.max(margin, maxX)),
            y: Math.min(Math.max(y, margin), Math.max(margin, maxY)),
        }
    }, [getPopupMetrics])

    useEffect(() => {
        const x = position.x
        let y = position.y + 8
        const { height } = getPopupMetrics()
        if (y + height > window.innerHeight - 12) {
            y = position.y - height - 8
        }
        const clamped = clampPopupPosition(x, y)

        setPopupStyle({
            position: 'fixed',
            left: `${clamped.x}px`,
            top: `${clamped.y}px`,
            width: `${getPopupMetrics().width}px`,
            zIndex: 10000,
        })
    }, [position, type, clampPopupPosition, getPopupMetrics])

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!dragOffsetRef.current) return

            const next = clampPopupPosition(
                event.clientX - dragOffsetRef.current.x,
                event.clientY - dragOffsetRef.current.y
            )

            setPopupStyle(prev => ({
                ...prev,
                left: `${next.x}px`,
                top: `${next.y}px`,
            }))
        }

        const handlePointerUp = () => {
            dragOffsetRef.current = null
        }

        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', handlePointerUp)
        window.addEventListener('pointercancel', handlePointerUp)

        return () => {
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', handlePointerUp)
            window.removeEventListener('pointercancel', handlePointerUp)
        }
    }, [clampPopupPosition])

    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (matches(event, 'common.closeDialog')) onClose()
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [matches, onClose])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                onClose()
            }
        }
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside)
        }, 100)
        return () => {
            clearTimeout(timer)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [onClose])

    const autoSaveWord = useCallback(async (data: any) => {
        setSaved('saving')
        try {
            await api.post(API_PATHS.WORDS, data)
            setSaved('saved')
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setSaved('exists')
            } else {
                setSaved('error')
            }
        }
    }, [])

    const requestExplanationStream = useCallback(async (selectedText: string, meaningHint?: string, signal?: AbortSignal) => {
        const ai = getAiSettings()
        const prompt = meaningHint
            ? `请用中文为英语学习者解释单词“${selectedText}”。参考释义：${meaningHint}。请输出：1. 核心意思 2. 常见语境或语气 3. 常见搭配或易错点 4. 一个自然例句。保持简洁清晰。`
            : `请用中文解释这段英文内容：“${selectedText}”。请说明整体意思、适用语境、关键表达，并给出一个自然译文。保持简洁清晰。`

        const response = await api.raw(API_PATHS.AI_CHAT_STREAM, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Client-Id': getClientId(),
                'X-AI-Provider': ai.provider,
                'X-AI-Key': ai.apiKey,
                'X-AI-Model': ai.model,
                'X-AI-Disable-Thinking': 'true',
                'X-EverMem-Enabled': 'false',
                ...(ai.apiBase ? { 'X-AI-Base': ai.apiBase } : {}),
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: prompt }],
                context_word: isSingleWordLookup(selectedText) ? selectedText : undefined,
            }),
            signal,
        })

        if (!response.ok) {
            throw new ApiError(response.status, await response.text())
        }
        if (!response.body) {
            throw new Error('No response body')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let sseBuffer = ''
        let started = false

        setExplanation('')
        setStreaming(true)

        while (true) {
            const { value, done } = await reader.read()
            if (done) break

            sseBuffer += decoder.decode(value, { stream: true })
            const events = sseBuffer.split('\n\n')
            sseBuffer = events.pop() || ''

            for (const eventChunk of events) {
                const dataLines = eventChunk
                    .split('\n')
                    .filter(line => line.startsWith('data: '))
                    .map(line => line.slice(6))

                for (const dataLine of dataLines) {
                    if (!dataLine || dataLine === '[DONE]') continue
                    const parsed = JSON.parse(dataLine)
                    if (parsed?.type === 'token' && typeof parsed.content === 'string') {
                        if (!started) {
                            started = true
                            setLoading(false)
                        }
                        setExplanation(prev => `${prev || ''}${parsed.content}`)
                    }
                    if (parsed?.type === 'done') {
                        setStreaming(false)
                    }
                }
            }
        }

        if (!started) {
            setLoading(false)
        }
        setStreaming(false)
    }, [token])

    useEffect(() => {
        let cancelled = false
        const abortController = new AbortController()

        const fetchWordData = async (options?: { autoSave?: boolean }) => {
            const enabledDicts = ['youdao']
            ;['cambridge', 'bing', 'freedict'].forEach(id => {
                if (localStorage.getItem(`dict_${id}`) !== 'false') {
                    enabledDicts.push(id)
                }
            })
            const sourcesParam = enabledDicts.join(',')
            const data = await api.get(API_PATHS.DICT_SEARCH(text, sourcesParam))
            if (cancelled) return null
            setWordData(data)
            if (options?.autoSave !== false) {
                void autoSaveWord(data)
            }
            return data
        }

        const fetchData = async () => {
            setLoading(true)
            setError(null)
            setWordData(null)
            setTranslation(null)
            setExplanation(null)
            setTranslationSaved(false)
            setSaved('idle')
            setStreaming(false)

            try {
                if (type === 'word') {
                    await fetchWordData({ autoSave: true })
                } else if (type === 'translate') {
                    const ai = getAiSettings()
                    const data = await api.post(API_PATHS.AI_TRANSLATE, {
                        text,
                        source_lang: 'Auto',
                        target_lang: 'Chinese'
                    }, {
                        headers: {
                            'X-AI-Provider': ai.provider,
                            'X-AI-Key': ai.apiKey,
                            'X-AI-Model': ai.model,
                            ...(ai.apiBase ? { 'X-AI-Base': ai.apiBase } : {})
                        }
                    })
                    if (cancelled) return
                    setTranslation(data.translation || data.translated_text || data.target_text || '')
                    setTranslationSaved(true)
                } else {
                    let meaningHint = ''
                    if (isSingleWordLookup(text)) {
                        try {
                            const data = await fetchWordData({ autoSave: false })
                            meaningHint = data?.meaning || data?.sources_data?.youdao?.meaning || ''
                        } catch (err) {
                            if (!(err instanceof ApiError && err.status === 404)) {
                                throw err
                            }
                        }
                    }
                    await requestExplanationStream(text, meaningHint, abortController.signal)
                    if (cancelled) return
                }
            } catch (err) {
                if (cancelled) return
                if (err instanceof DOMException && err.name === 'AbortError') {
                    return
                }
                if (err instanceof ApiError && err.status === 404) {
                    setError(t('addWord.errors.notFound', 'Word not found'))
                } else {
                    setError(
                        type === 'translate'
                            ? t('quickLookup.errors.translateFailed', 'Translation failed. Please check your AI settings.')
                            : type === 'explain'
                                ? t('quickLookup.errors.explainFailed', 'Explanation failed. Please check your AI settings.')
                                : t('addWord.errors.searchFailed', 'Lookup failed. Please check the backend service.')
                    )
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        void fetchData()
        return () => {
            cancelled = true
            abortController.abort()
        }
    }, [text, type, autoSaveWord, requestExplanationStream, t])

    const handleCopy = async (content: string) => {
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleOpenDetail = () => {
        if (onNavigateToAddWord && wordData?.word) {
            onNavigateToAddWord(wordData.word)
            onClose()
        }
    }

    const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!popupRef.current) return
        const rect = popupRef.current.getBoundingClientRect()
        dragOffsetRef.current = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
    }

    const displayData = wordData?.sources_data?.youdao || wordData
    const showSavedBadge = type !== 'translate' && Boolean(wordData)

    return (
        <div ref={popupRef} style={popupStyle} data-selection-overlay="true" className="animate-scale-in">
            <div className="overflow-hidden rounded-2xl border border-white/30 bg-white/95 shadow-2xl shadow-black/20 backdrop-blur-2xl dark:border-slate-600/50 dark:bg-slate-800/95 dark:shadow-black/50">
                <div
                    className="flex cursor-move select-none items-center justify-between border-b border-slate-100 bg-gradient-to-r from-primary-500/10 to-accent-500/10 px-4 py-3 dark:border-slate-700/50 dark:from-primary-900/30 dark:to-accent-900/30"
                    onPointerDown={handleDragStart}
                >
                    <div className="flex items-center gap-2">
                        {type === 'word' ? (
                            <BookOpen size={16} className="text-primary-500" />
                        ) : type === 'translate' ? (
                            <Languages size={16} className="text-accent-500" />
                        ) : (
                            <Sparkles size={16} className="text-amber-500" />
                        )}
                        <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {type === 'word'
                                ? t('quickLookup.wordTitle', 'Quick lookup')
                                : type === 'translate'
                                    ? t('quickLookup.translateTitle', 'Quick translation')
                                    : t('quickLookup.explainTitle', 'AI explanation')}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="rounded-lg p-1 transition-colors hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                    >
                        <X size={16} className="text-slate-400" />
                    </button>
                </div>

                <div className="max-h-[360px] overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-8">
                            <Loader2 size={24} className="animate-spin text-primary-500" />
                            <span className="text-sm text-slate-400">
                                {type === 'word'
                                    ? t('quickLookup.loadingWord', 'Looking up word...')
                                    : type === 'translate'
                                        ? t('quickLookup.loadingTranslation', 'Translating...')
                                        : t('quickLookup.loadingExplanation', 'Generating explanation...')}
                            </span>
                        </div>
                    ) : error ? (
                        <div className="py-6 text-center">
                            <span className="text-3xl">😕</span>
                            <p className="mt-2 text-sm text-slate-500">{error}</p>
                        </div>
                    ) : type === 'word' && wordData ? (
                        <div className="space-y-2.5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-xl font-bold leading-tight text-slate-800 dark:text-white">
                                        {wordData.word}
                                    </h3>
                                    {displayData?.phonetic && (
                                        <p className="mt-0.5 font-serif text-sm text-slate-400">{displayData.phonetic}</p>
                                    )}
                                </div>
                                <AudioButton
                                    word={wordData.word}
                                    audioSrc={displayData?.audio}
                                    size={18}
                                    className="bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/30 dark:hover:bg-primary-900/50"
                                />
                            </div>

                            {wordData.tags && (
                                <div className="flex flex-wrap gap-1">
                                    {wordData.tags.split(',').map((tag: string) => (
                                        <span key={tag} className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                                            {tag.trim()}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-600/30 dark:bg-slate-700/50">
                                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                                    {displayData?.meaning || t('addWord.noMeaning', 'No meaning available')}
                                </p>
                            </div>

                            {(wordData.roots || wordData.synonyms) && (
                                <div className="flex flex-col gap-1">
                                    {wordData.roots && (
                                        <p className="text-xs leading-snug text-orange-600 dark:text-orange-400">
                                            <Sprout size={12} className="mr-1 inline -mt-0.5" />
                                            {wordData.roots}
                                        </p>
                                    )}
                                    {wordData.synonyms && (
                                        <p className="text-xs leading-snug text-indigo-600 dark:text-indigo-400">
                                            <RefreshCw size={12} className="mr-1 inline -mt-0.5" />
                                            {wordData.synonyms}
                                        </p>
                                    )}
                                </div>
                            )}

                            {wordData.example && (
                                <div>
                                    <p className="mb-1 text-xs font-medium text-emerald-500">{t('quickLookup.example', 'Example')}</p>
                                    {wordData.example.split(/\n(?=[•*-])|\n{2,}/).filter((item: string) => item.trim().length > 5).slice(0, 2).map((example: string, index: number) => {
                                        const lines = example.trim().replace(/^[•*-]\s*/, '').split('\n')
                                        return (
                                            <div key={index} className="mb-1.5 border-l-2 border-emerald-200 pl-2 dark:border-emerald-800">
                                                {lines.map((line: string, lineIndex: number) => (
                                                    <p
                                                        key={lineIndex}
                                                        className={`text-xs leading-relaxed ${/[\u4e00-\u9fff]/.test(line) ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}
                                                    >
                                                        {line.trim()}
                                                    </p>
                                                ))}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    ) : type === 'translate' && translation ? (
                        <div className="space-y-3">
                            <div>
                                <p className="mb-1 text-xs font-medium text-slate-400">{t('quickLookup.sourceText', 'Source')}</p>
                                <p className="line-clamp-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                                    {text}
                                </p>
                            </div>

                            <div className="border-t border-slate-100 dark:border-slate-700/50" />

                            <div>
                                <div className="mb-1 flex items-center justify-between">
                                    <p className="text-xs font-medium text-accent-500">{t('quickLookup.translation', 'Translation')}</p>
                                    <button
                                        onClick={() => handleCopy(translation)}
                                        className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700/50 dark:hover:text-slate-300"
                                        title={t('quickLookup.copyTranslation', 'Copy translation')}
                                    >
                                        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                    </button>
                                </div>
                                <p className="text-sm leading-relaxed text-slate-800 dark:text-white">
                                    {translation}
                                </p>
                            </div>
                        </div>
                    ) : type === 'explain' && explanation !== null ? (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 dark:border-slate-700/70 dark:bg-slate-900/40">
                                <div className="mb-2 flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                            {wordData?.word ? t('quickLookup.wordTitle', 'Quick lookup') : t('quickLookup.sourceText', 'Source')}
                                        </p>
                                        <p className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">
                                            {wordData?.word || text}
                                        </p>
                                        {displayData?.phonetic && (
                                            <p className="mt-1 font-serif text-sm text-slate-400">{displayData.phonetic}</p>
                                        )}
                                    </div>
                                    {wordData?.word && (
                                        <AudioButton
                                            word={wordData.word}
                                            audioSrc={displayData?.audio}
                                            size={18}
                                            className="bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/30 dark:hover:bg-primary-900/50"
                                        />
                                    )}
                                </div>
                                {displayData?.meaning && (
                                    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                                        {displayData.meaning}
                                    </p>
                                )}
                            </div>

                            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-800/60 dark:bg-amber-900/15">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                                            {t('quickLookup.explanation', 'Explanation')}
                                        </p>
                                        {streaming && (
                                            <Loader2 size={12} className="animate-spin text-amber-500" />
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleCopy(explanation)}
                                        className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600 dark:hover:bg-slate-800/50 dark:hover:text-slate-300"
                                        title={t('quickLookup.copyExplanation', 'Copy explanation')}
                                    >
                                        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                    </button>
                                </div>
                                <p className="whitespace-pre-line text-sm leading-7 text-slate-700 dark:text-slate-100">
                                    {explanation || (streaming ? '...' : '')}
                                </p>
                            </div>

                            {(wordData?.roots || wordData?.synonyms) && (
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {wordData?.roots && (
                                        <div className="rounded-xl border border-orange-200/70 bg-orange-50/80 p-3 text-xs leading-relaxed text-orange-700 dark:border-orange-900/40 dark:bg-orange-900/20 dark:text-orange-300">
                                            <Sprout size={12} className="mr-1 inline -mt-0.5" />
                                            {wordData.roots}
                                        </div>
                                    )}
                                    {wordData?.synonyms && (
                                        <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/80 p-3 text-xs leading-relaxed text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-900/20 dark:text-indigo-300">
                                            <RefreshCw size={12} className="mr-1 inline -mt-0.5" />
                                            {wordData.synonyms}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                {!loading && !error && (
                    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 dark:border-slate-700/50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-2 text-xs">
                            {showSavedBadge && (
                                <>
                                    {saved === 'idle' && wordData?.sources_data && (
                                        <div className="flex gap-1">
                                            {Object.keys(wordData.sources_data).map((source: string) => (
                                                <span key={source} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                                                    {t(`addWord.dictionarySources.${source}`, source)}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {saved === 'saving' && (
                                        <>
                                            <Loader2 size={12} className="animate-spin text-slate-400" />
                                            <span className="text-slate-400">{t('quickLookup.saving', 'Saving...')}</span>
                                        </>
                                    )}
                                    {saved === 'saved' && (
                                        <>
                                            <Check size={12} className="text-emerald-500" />
                                            <span className="font-medium text-emerald-500">{t('quickLookup.savedToBook', 'Saved to VocabBook')}</span>
                                        </>
                                    )}
                                    {saved === 'exists' && (
                                        <>
                                            <Check size={12} className="text-amber-500" />
                                            <span className="text-amber-500">{t('quickLookup.alreadyInBook', 'Already in VocabBook')}</span>
                                        </>
                                    )}
                                    {saved === 'error' && (
                                        <span className="text-red-400">{t('quickLookup.saveFailed', 'Save failed')}</span>
                                    )}
                                </>
                            )}
                            {type === 'translate' && translationSaved && (
                                <>
                                    <Check size={12} className="text-emerald-500" />
                                    <span className="font-medium text-emerald-500">{t('quickLookup.savedToHistory', 'Saved to translation history')}</span>
                                </>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {showSavedBadge && onNavigateToAddWord && (
                                <button
                                    onClick={handleOpenDetail}
                                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary-500 transition-colors hover:bg-primary-50 hover:text-primary-600 dark:text-primary-400 dark:hover:bg-primary-900/30 dark:hover:text-primary-300"
                                >
                                    <ExternalLink size={12} />
                                    <span>{t('quickLookup.details', 'Details')}</span>
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="rounded-lg px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700/50 dark:hover:text-slate-300"
                            >
                                {t('quickLookup.close', 'Close')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
