import { useState, useEffect, useCallback, useMemo } from 'react'
import { Languages, ArrowRightLeft, Copy, Check, Trash2, Clock, Loader2, PanelRight, Eraser } from 'lucide-react'
import { api, API_PATHS } from '../utils/api'
import AudioButton from '../components/AudioButton'
import { useTranslation } from 'react-i18next'

interface TranslationRecord {
    id: number
    source_text: string
    target_text: string
    source_lang: string
    target_lang: string
    created_at: string
}

interface AISettings {
    provider: string
    apiKey: string
    model: string
    apiBase: string
}

const LANGUAGES = ['Auto', 'English', 'Chinese', 'Japanese', 'Korean', 'French', 'Spanish', 'German', 'Russian'] as const

export default function TranslationPage() {
    const { t } = useTranslation()
    const [sourceText, setSourceText] = useState('')
    const [targetText, setTargetText] = useState('')
    const [sourceLang, setSourceLang] = useState('Auto')
    const [targetLang, setTargetLang] = useState('Chinese')
    const [loading, setLoading] = useState(false)
    const [history, setHistory] = useState<TranslationRecord[]>([])
    const [showHistory, setShowHistory] = useState(false)
    const [sourceCopied, setSourceCopied] = useState(false)
    const [copied, setCopied] = useState(false)

    const getLanguageLabel = useCallback((code: string) => (
        t(`translation.languages.${code}`, { defaultValue: code })
    ), [t])

    const loadAiSettings = useCallback((): AISettings => {
        const provider = localStorage.getItem('ai_provider') || 'openai'
        
        // Try to get API key from map
        let apiKey = ''
        const savedKeysStr = localStorage.getItem('ai_api_keys_map')
        if (savedKeysStr) {
            try {
                const keysMap = JSON.parse(savedKeysStr)
                apiKey = keysMap[provider] || ''
            } catch (e) {
                console.error('Failed to parse api keys map', e)
            }
        }
        
        // Fallback to legacy key
        if (!apiKey) {
            apiKey = localStorage.getItem('ai_api_key') || ''
        }

        // Try to get model from map
        let model = ''
        const savedModelsStr = localStorage.getItem('ai_models_map')
        if (savedModelsStr) {
            try {
                const modelsMap = JSON.parse(savedModelsStr)
                model = modelsMap[provider] || ''
            } catch (e) {
                 console.error('Failed to parse ai models map', e)
            }
        }
        
        // Fallback to legacy model
        if (!model) {
             model = localStorage.getItem('ai_model') || 'gpt-4o-mini'
        }

        // Try to get base url from map
        let apiBase = ''
        const savedBasesStr = localStorage.getItem('ai_bases_map')
        if (savedBasesStr) {
            try {
                const basesMap = JSON.parse(savedBasesStr)
                apiBase = basesMap[provider] || ''
            } catch (e) {
                console.error('Failed to parse ai bases map', e)
            }
        }

        return {
            provider,
            apiKey,
            model,
            apiBase
        }
    }, [])

    const fetchHistory = useCallback(async () => {
        try {
            const data = await api.get(API_PATHS.AI_TRANSLATIONS)
            setHistory(data)
        } catch (error) {
            console.error('Failed to fetch history:', error)
        }
    }, [])

    useEffect(() => {
        fetchHistory()
    }, [fetchHistory])

    const detectLanguage = useCallback((text: string): string => {
        const input = text.trim()
        if (!input) return 'Auto'

        const chineseCount = (input.match(/[\u4e00-\u9fff]/g) || []).length
        const japaneseKanaCount = (input.match(/[\u3040-\u30ff]/g) || []).length
        const koreanCount = (input.match(/[\uac00-\ud7af]/g) || []).length
        const russianCount = (input.match(/[\u0400-\u04ff]/g) || []).length
        const latinCount = (input.match(/[A-Za-z]/g) || []).length
        const letterLikeCount = chineseCount + japaneseKanaCount + koreanCount + russianCount + latinCount
        const zhLatinTotal = chineseCount + latinCount

        if (japaneseKanaCount > 0) return 'Japanese'
        if (koreanCount > 0) return 'Korean'
        if (russianCount > 0 && russianCount >= latinCount) return 'Russian'
        if (chineseCount > 0) {
            if (latinCount === 0) return 'Chinese'
            if (zhLatinTotal > 0 && (chineseCount / zhLatinTotal) >= 0.2) return 'Chinese'
            if (chineseCount >= 2 && chineseCount * 3 >= latinCount) return 'Chinese'
        }
        if (latinCount > 0) return 'English'
        if (letterLikeCount > 0) return 'English'

        return 'Auto'
    }, [])

    const inferredSourceLang = useMemo(() => {
        if (sourceLang !== 'Auto') return sourceLang
        return detectLanguage(sourceText)
    }, [sourceLang, sourceText, detectLanguage])

    const resolveAutoTargetLang = useCallback((detectedSourceLang: string, currentTargetLang: string): string => {
        if (currentTargetLang !== detectedSourceLang) return currentTargetLang
        if (detectedSourceLang === 'Chinese') return 'English'
        if (detectedSourceLang === 'English') return 'Chinese'
        return 'English'
    }, [])

    useEffect(() => {
        if (sourceLang !== 'Auto') return
        if (!sourceText.trim()) return

        const nextTargetLang = resolveAutoTargetLang(inferredSourceLang, targetLang)
        if (nextTargetLang !== targetLang) {
            setTargetLang(nextTargetLang)
        }
    }, [sourceLang, sourceText, inferredSourceLang, targetLang, resolveAutoTargetLang])

    const handleTranslate = async () => {
        const input = sourceText.trim()
        if (!input) return

        setLoading(true)
        try {
            const effectiveSourceLang = sourceLang === 'Auto' ? inferredSourceLang : sourceLang
            const effectiveTargetLang = sourceLang === 'Auto'
                ? resolveAutoTargetLang(effectiveSourceLang, targetLang)
                : targetLang

            const latestAiSettings = loadAiSettings()
            const result = await api.post(API_PATHS.AI_TRANSLATE, {
                text: input,
                source_lang: effectiveSourceLang,
                target_lang: effectiveTargetLang
            }, {
                headers: {
                    'X-AI-Provider': latestAiSettings.provider,
                    'X-AI-Key': latestAiSettings.apiKey,
                    'X-AI-Model': latestAiSettings.model,
                    ...(latestAiSettings.apiBase ? { 'X-AI-Base': latestAiSettings.apiBase } : {})
                }
            })
            setTargetText(result.translation)
            fetchHistory() // Refresh history
        } catch (error) {
            console.error('Translation failed:', error)
            setTargetText(t('translation.errors.failed'))
        } finally {
            setLoading(false)
        }
    }

    const handleCopySource = async () => {
        if (!sourceText) return
        await navigator.clipboard.writeText(sourceText)
        setSourceCopied(true)
        setTimeout(() => setSourceCopied(false), 2000)
    }

    const handleCopy = async () => {
        if (!targetText) return
        await navigator.clipboard.writeText(targetText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleDelete = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm(t('translation.confirmDelete'))) return

        try {
            await api.delete(API_PATHS.AI_TRANSLATION_DELETE(id))
            setHistory(prev => prev.filter(item => item.id !== id))
        } catch (error) {
            console.error('Delete failed:', error)
        }
    }

    const handleSwapLanguages = () => {
        if (sourceLang === 'Auto') return
        setSourceLang(targetLang)
        setTargetLang(sourceLang)
        setSourceText(targetText)
        setTargetText(sourceText)
    }

    const handleClearSource = () => {
        setSourceText('')
        setSourceCopied(false)
    }

    const handleClearTarget = () => {
        setTargetText('')
        setCopied(false)
    }

    const handleClearAll = () => {
        setSourceText('')
        setTargetText('')
        setSourceCopied(false)
        setCopied(false)
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] gap-0 md:gap-6 animate-fade-in relative overflow-hidden">
            {/* Left: Translation Area */}
            <div className={`flex-1 flex flex-col gap-4 transition-all duration-300 ${showHistory ? 'mr-0 md:mr-80' : ''} h-full`}>
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                        <Languages className="text-primary-500" />
                        {t('translation.title')}
                    </h2>
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                                  ${showHistory 
                                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
                                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
                    >
                        <Clock size={16} />
                        <span>{showHistory ? t('translation.hideHistory') : t('translation.history')}</span>
                    </button>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col flex-1">
                    {/* Controls */}
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-2">
                            <select
                                value={sourceLang}
                                onChange={(e) => setSourceLang(e.target.value)}
                                className="input-field w-32 py-1.5 text-sm"
                            >
                                {LANGUAGES.map(code => (
                                    <option key={code} value={code}>{getLanguageLabel(code)}</option>
                                ))}
                            </select>
                            {sourceLang === 'Auto' && sourceText.trim() && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 text-[11px] text-primary-700 dark:text-primary-300 whitespace-nowrap">
                                    {t('translation.detected', { language: getLanguageLabel(inferredSourceLang) })}
                                </span>
                            )}
                        </div>

                        <button
                            onClick={handleSwapLanguages}
                            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500"
                            title={t('translation.actions.swapLanguages')}
                        >
                            <ArrowRightLeft size={16} />
                        </button>

                        <select
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value)}
                            className="input-field w-32 py-1.5 text-sm"
                        >
                            {LANGUAGES.filter(code => code !== 'Auto').map(code => (
                                <option key={code} value={code}>{getLanguageLabel(code)}</option>
                            ))}
                        </select>

                        <button
                            onClick={handleTranslate}
                            disabled={loading || !sourceText.trim()}
                            className="ml-auto px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg 
                                       disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin" size={18} /> : t('translation.actions.translate')}
                        </button>
                        <button
                            onClick={handleClearAll}
                            disabled={!sourceText && !targetText}
                            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300
                                       hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed
                                       transition-all font-medium flex items-center gap-2"
                            title={t('translation.actions.clearAll')}
                        >
                            <Eraser size={16} />
                            {t('translation.actions.clear')}
                        </button>
                    </div>

                    {/* Input/Output Area */}
                    <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-700 overflow-hidden">
                        {/* Source */}
                        <div className="flex-1 flex flex-col p-4 relative group">
                            <textarea
                                value={sourceText}
                                onChange={(e) => {
                                    setSourceText(e.target.value)
                                    setSourceCopied(false)
                                }}
                                placeholder={t('translation.placeholders.sourceText')}
                                className="w-full h-full bg-transparent resize-none outline-none text-slate-700 dark:text-slate-200 text-lg leading-relaxed placeholder-slate-400"
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && e.ctrlKey) {
                                        handleTranslate()
                                    }
                                }}
                            />
                            {sourceText && (
                                <div className="absolute bottom-4 right-4 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <AudioButton
                                        text={sourceText}
                                        useTTS={true}
                                        size={16}
                                        className="bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600"
                                    />
                                    <button
                                        onClick={handleCopySource}
                                        className="p-2 rounded-lg bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600
                                                   text-slate-500 hover:text-green-500 transition-colors"
                                        title={t('translation.actions.copySource')}
                                    >
                                        {sourceCopied ? <Check size={16} /> : <Copy size={16} />}
                                    </button>
                                    <button
                                        onClick={handleClearSource}
                                        className="p-2 rounded-lg bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600
                                                   text-slate-500 hover:text-amber-500 transition-colors"
                                        title={t('translation.actions.clearSource')}
                                    >
                                        <Eraser size={16} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Target */}
                        <div className="flex-1 flex flex-col bg-slate-50/50 dark:bg-slate-900/30 relative group overflow-hidden">
                            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                                <div className="p-4 flex-1">
                                    {loading ? (
                                    <div className="h-full flex items-center justify-center text-slate-400 gap-2">
                                        <Loader2 className="animate-spin" />
                                        <span>{t('translation.loading.thinking')}</span>
                                    </div>
                                    ) : (
                                    <div className="w-full h-full text-slate-800 dark:text-slate-100 text-lg leading-relaxed whitespace-pre-wrap min-h-[100px]">
                                        {targetText || <span className="text-slate-400 italic">{t('translation.placeholders.result')}</span>}
                                    </div>
                                    )}
                                </div>
                            </div>

                            {targetText && !loading && (
                                <div className="absolute bottom-4 right-4 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <AudioButton
                                        text={targetText}
                                        useTTS={true}
                                        size={16}
                                        className="bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600"
                                    />
                                    <button
                                        onClick={handleCopy}
                                        className="p-2 rounded-lg bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600
                                                   text-slate-500 hover:text-green-500 transition-colors"
                                        title={t('translation.actions.copyTarget')}
                                    >
                                        {copied ? <Check size={16} /> : <Copy size={16} />}
                                    </button>
                                    <button
                                        onClick={handleClearTarget}
                                        className="p-2 rounded-lg bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600
                                                   text-slate-500 hover:text-amber-500 transition-colors"
                                        title={t('translation.actions.clearTarget')}
                                    >
                                        <Eraser size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right: History Sidebar */}
            <div className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-slate-900 shadow-2xl transform transition-transform duration-300 z-20 border-l border-slate-200 dark:border-slate-700 flex flex-col
                            ${showHistory ? 'translate-x-0' : 'translate-x-full'} pt-20 pb-4 px-4`}>
                <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 px-1">
                    <Clock size={16} />
                    <span className="text-sm font-medium">{t('translation.history')}</span>
                </div>
                    <button 
                        onClick={() => setShowHistory(false)}
                        className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                    >
                        <PanelRight size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                    {history.length === 0 ? (
                        <div className="text-center text-slate-400 py-8 text-sm">
                            {t('translation.emptyHistory')}
                        </div>
                    ) : (
                        history.map(item => (
                            <div
                                key={item.id}
                                onClick={() => {
                                    setSourceText(item.source_text)
                                    setTargetText(item.target_text)
                                    setSourceLang(item.source_lang)
                                    setTargetLang(item.target_lang)
                                }}
                                className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 
                                           hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800 
                                           cursor-pointer group transition-all"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                                        {getLanguageLabel(item.source_lang)} → {getLanguageLabel(item.target_lang)}
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(item.id, e)}
                                        className="text-slate-400 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                        title={t('translation.actions.deleteRecord')}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                <div className="text-sm text-slate-800 dark:text-slate-200 line-clamp-2 mb-1">
                                    {item.source_text}
                                </div>
                                <div className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                                    {item.target_text}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
