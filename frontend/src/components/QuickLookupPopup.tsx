import { useState, useEffect, useRef, useCallback } from 'react'
import { X, BookOpen, Languages, Check, Loader2, ExternalLink, Copy, Sprout, RefreshCw } from 'lucide-react'
import AudioButton from './AudioButton'
import { api, ApiError, API_PATHS } from '../utils/api'

interface QuickLookupProps {
    text: string
    type: 'word' | 'translate'
    position: { x: number; y: number }
    onClose: () => void
    onNavigateToAddWord?: (word: string) => void
}

/** Resolve AI settings from localStorage, matching TranslationPage logic */
function getAiSettings() {
    const provider = localStorage.getItem('ai_provider') || 'dashscope'

    // Try provider-specific key map first, fallback to legacy
    let apiKey = ''
    try {
        const keysMap = JSON.parse(localStorage.getItem('ai_api_keys_map') || '{}')
        apiKey = keysMap[provider] || ''
    } catch { /* ignore */ }
    if (!apiKey) apiKey = localStorage.getItem('ai_api_key') || ''

    // Try provider-specific model map first, fallback to legacy
    let model = ''
    try {
        const modelsMap = JSON.parse(localStorage.getItem('ai_models_map') || '{}')
        model = modelsMap[provider] || ''
    } catch { /* ignore */ }
    if (!model) model = localStorage.getItem('ai_model') || 'qwen-plus'

    return { provider, apiKey, model }
}

const DICT_LABELS: Record<string, string> = {
    youdao: '有道',
    cambridge: '剑桥',
    bing: 'Bing',
    freedict: 'Free',
}

export default function QuickLookupPopup({ text, type, position, onClose, onNavigateToAddWord }: QuickLookupProps) {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [wordData, setWordData] = useState<any>(null)
    const [translation, setTranslation] = useState<string | null>(null)
    const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'exists' | 'error'>('idle')
    const [copied, setCopied] = useState(false)
    const [translationSaved, setTranslationSaved] = useState(false)
    const popupRef = useRef<HTMLDivElement>(null)
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({})

    useEffect(() => {
        const POPUP_WIDTH = 400
        const POPUP_HEIGHT = 420
        const MARGIN = 12

        let x = position.x
        let y = position.y + 8

        const vw = window.innerWidth
        const vh = window.innerHeight

        if (x + POPUP_WIDTH > vw - MARGIN) x = vw - POPUP_WIDTH - MARGIN
        if (x < MARGIN) x = MARGIN
        if (y + POPUP_HEIGHT > vh - MARGIN) y = position.y - POPUP_HEIGHT - 8
        if (y < MARGIN) y = MARGIN

        setPopupStyle({
            position: 'fixed',
            left: `${x}px`,
            top: `${y}px`,
            width: `${POPUP_WIDTH}px`,
            zIndex: 10000,
        })
    }, [position])

    // Close on Escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [onClose])

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
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

    // Auto-save word to vocab book
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

    // Fetch data based on type
    useEffect(() => {
        let cancelled = false

        const fetchData = async () => {
            setLoading(true)
            setError(null)

            try {
                if (type === 'word') {
                    const enabledDicts = ['youdao'];
                    ['cambridge', 'bing', 'freedict'].forEach(id => {
                        if (localStorage.getItem(`dict_${id}`) !== 'false') {
                            enabledDicts.push(id);
                        }
                    });
                    const sourcesParam = enabledDicts.join(',')
                    const data = await api.get(API_PATHS.DICT_SEARCH(text, sourcesParam))
                    if (cancelled) return
                    setWordData(data)
                    autoSaveWord(data)
                } else {
                    // Translation — use proper AI settings matching TranslationPage
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
                        }
                    })
                    if (cancelled) return
                    setTranslation(data.translation || data.translated_text || data.target_text || '')
                    // Backend auto-saves translation to history
                    setTranslationSaved(true)
                }
            } catch (err) {
                if (cancelled) return
                if (err instanceof ApiError && err.status === 404) {
                    setError('未找到该单词')
                } else {
                    setError(type === 'translate' ? '翻译失败，请检查 AI 设置' : '查询失败，请检查后端服务')
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        fetchData()
        return () => { cancelled = true }
    }, [text, type, autoSaveWord])

    const handleCopy = async (content: string) => {
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    // Navigate to full add word page
    const handleOpenDetail = () => {
        if (onNavigateToAddWord && wordData?.word) {
            onNavigateToAddWord(wordData.word)
            onClose()
        }
    }

    return (
        <div ref={popupRef} style={popupStyle} className="animate-scale-in">
            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-2xl border border-white/30 dark:border-slate-600/50 rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/50 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 bg-gradient-to-r from-primary-500/10 to-accent-500/10 dark:from-primary-900/30 dark:to-accent-900/30">
                    <div className="flex items-center gap-2">
                        {type === 'word' ? (
                            <BookOpen size={16} className="text-primary-500" />
                        ) : (
                            <Languages size={16} className="text-accent-500" />
                        )}
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {type === 'word' ? '快速查词' : '快速翻译'}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                        <X size={16} className="text-slate-400" />
                    </button>
                </div>

                <div className="p-4 max-h-[340px] overflow-y-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                            <Loader2 size={24} className="animate-spin text-primary-500" />
                            <span className="text-sm text-slate-400">
                                {type === 'word' ? '正在查词...' : '正在翻译...'}
                            </span>
                        </div>
                    ) : error ? (
                        <div className="text-center py-6">
                            <span className="text-3xl">😕</span>
                            <p className="mt-2 text-sm text-slate-500">{error}</p>
                        </div>
                    ) : type === 'word' && wordData ? (
                        <div className="space-y-2.5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800 dark:text-white leading-tight">
                                        {wordData.word}
                                    </h3>
                                    {wordData.phonetic && (
                                        <p className="text-sm text-slate-400 mt-0.5 font-serif">{wordData.phonetic}</p>
                                    )}
                                </div>
                                <AudioButton
                                    word={wordData.word}
                                    audioSrc={wordData.audio}
                                    size={18}
                                    className="bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50"
                                />
                            </div>

                            {wordData.tags && (
                                <div className="flex gap-1 flex-wrap">
                                    {wordData.tags.split(',').map((tag: string) => (
                                        <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-medium">
                                            {tag.trim()}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-2.5 border border-slate-100 dark:border-slate-600/30">
                                <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed break-words">
                                    {wordData.meaning || '暂无释义'}
                                </p>
                            </div>

                            {(wordData.roots || wordData.synonyms) && (
                                <div className="flex flex-col gap-1">
                                    {wordData.roots && (
                                        <p className="text-xs text-orange-600 dark:text-orange-400 leading-snug">
                                            <Sprout size={12} className="inline mr-1 -mt-0.5" />
                                            {wordData.roots}
                                        </p>
                                    )}
                                    {wordData.synonyms && (
                                        <p className="text-xs text-indigo-600 dark:text-indigo-400 leading-snug">
                                            <RefreshCw size={12} className="inline mr-1 -mt-0.5" />
                                            {wordData.synonyms}
                                        </p>
                                    )}
                                </div>
                            )}

                            {wordData.example && (
                                <div>
                                    <p className="text-xs font-medium text-emerald-500 mb-1">例句</p>
                                    {wordData.example.split(/\n(?=[•\-\*])|\n{2,}/).filter((s: string) => s.trim().length > 5).slice(0, 2).map((ex: string, idx: number) => {
                                        const lines = ex.trim().replace(/^[•\-\*]\s*/, '').split('\n')
                                        return (
                                            <div key={idx} className="mb-1.5 pl-2 border-l-2 border-emerald-200 dark:border-emerald-800">
                                                {lines.map((line: string, li: number) => (
                                                    <p key={li} className={`text-xs leading-relaxed ${/[\u4e00-\u9fff]/.test(line) ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>
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
                        /* Translation result */
                        <div className="space-y-3">
                            <div>
                                <p className="text-xs font-medium text-slate-400 mb-1">原文</p>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-4">
                                    {text}
                                </p>
                            </div>

                            <div className="border-t border-slate-100 dark:border-slate-700/50" />

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs font-medium text-accent-500">翻译</p>
                                    <button
                                        onClick={() => handleCopy(translation)}
                                        className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                        title="复制译文"
                                    >
                                        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                    </button>
                                </div>
                                <p className="text-sm text-slate-800 dark:text-white leading-relaxed">
                                    {translation}
                                </p>
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Footer */}
                {!loading && !error && (
                    <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs">
                            {type === 'word' && (
                                <>
                                    {saved === 'idle' && wordData?.sources_data && (
                                        <div className="flex gap-1">
                                            {Object.keys(wordData.sources_data).map((s: string) => (
                                                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                                    {DICT_LABELS[s] || s}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {saved === 'saving' && (
                                        <>
                                            <Loader2 size={12} className="animate-spin text-slate-400" />
                                            <span className="text-slate-400">保存中...</span>
                                        </>
                                    )}
                                    {saved === 'saved' && (
                                        <>
                                            <Check size={12} className="text-emerald-500" />
                                            <span className="text-emerald-500 font-medium">已保存到生词本</span>
                                        </>
                                    )}
                                    {saved === 'exists' && (
                                        <>
                                            <Check size={12} className="text-amber-500" />
                                            <span className="text-amber-500">已在生词本中</span>
                                        </>
                                    )}
                                    {saved === 'error' && (
                                        <span className="text-red-400">保存失败</span>
                                    )}
                                </>
                            )}
                            {type === 'translate' && translationSaved && (
                                <>
                                    <Check size={12} className="text-emerald-500" />
                                    <span className="text-emerald-500 font-medium">已保存到翻译历史</span>
                                </>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            {type === 'word' && onNavigateToAddWord && (
                                <button
                                    onClick={handleOpenDetail}
                                    className="flex items-center gap-1 text-xs text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 transition-colors px-2 py-1 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/30"
                                >
                                    <ExternalLink size={12} />
                                    <span>详情</span>
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50"
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
