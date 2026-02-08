import { useState, useEffect, useCallback } from 'react'
import { Languages, ArrowRightLeft, Copy, Check, Trash2, Clock, Loader2, Play, PanelRight } from 'lucide-react'
import { api, API_PATHS } from '../utils/api'

interface TranslationRecord {
    id: number
    source_text: string
    target_text: string
    source_lang: string
    target_lang: string
    created_at: string
}

const LANGUAGES = [
    { code: 'Auto', name: '自动检测' },
    { code: 'English', name: '英语' },
    { code: 'Chinese', name: '中文' },
    { code: 'Japanese', name: '日语' },
    { code: 'Korean', name: '韩语' },
    { code: 'French', name: '法语' },
    { code: 'Spanish', name: '西班牙语' },
    { code: 'German', name: '德语' },
    { code: 'Russian', name: '俄语' },
]

export default function TranslationPage() {
    const [sourceText, setSourceText] = useState('')
    const [targetText, setTargetText] = useState('')
    const [sourceLang, setSourceLang] = useState('Auto')
    const [targetLang, setTargetLang] = useState('Chinese')
    const [loading, setLoading] = useState(false)
    const [history, setHistory] = useState<TranslationRecord[]>([])
    const [showHistory, setShowHistory] = useState(false)
    const [copied, setCopied] = useState(false)
    const [playing, setPlaying] = useState(false)

    // Load AI settings from local storage
    const [aiSettings, setAiSettings] = useState({
        provider: 'openai',
        apiKey: '',
        model: 'gpt-4o-mini'
    })

    useEffect(() => {
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

        setAiSettings({
            provider,
            apiKey,
            model
        })
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

    const handleTranslate = async () => {
        if (!sourceText.trim()) return

        setLoading(true)
        try {
            const result = await api.post(API_PATHS.AI_TRANSLATE, {
                text: sourceText,
                source_lang: sourceLang,
                target_lang: targetLang
            }, {
                headers: {
                    'X-AI-Provider': aiSettings.provider,
                    'X-AI-Key': aiSettings.apiKey,
                    'X-AI-Model': aiSettings.model
                }
            })
            setTargetText(result.translation)
            fetchHistory() // Refresh history
        } catch (error) {
            console.error('Translation failed:', error)
            setTargetText('翻译失败，请检查网络或 AI 设置。')
        } finally {
            setLoading(false)
        }
    }

    const handleCopy = async () => {
        if (!targetText) return
        await navigator.clipboard.writeText(targetText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleDelete = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm('确定删除这条记录吗？')) return

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

    const handleTTS = (text: string) => {
        if (!text) return
        setPlaying(true)
        const accent = (localStorage.getItem('preferred_accent') || 'us') === 'uk' ? '1' : '2'
        const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${accent}`)
        audio.onended = () => setPlaying(false)
        audio.onerror = () => setPlaying(false)
        audio.play().catch(e => {
            console.error(e)
            setPlaying(false)
        })
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] gap-0 md:gap-6 animate-fade-in relative overflow-hidden">
            {/* Left: Translation Area */}
            <div className={`flex-1 flex flex-col gap-4 transition-all duration-300 ${showHistory ? 'mr-0 md:mr-80' : ''} h-full`}>
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                        <Languages className="text-primary-500" />
                        翻译助手
                    </h2>
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                                  ${showHistory 
                                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
                                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
                    >
                        <Clock size={16} />
                        <span>{showHistory ? '隐藏历史' : '历史记录'}</span>
                    </button>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col flex-1">
                    {/* Controls */}
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50">
                        <select
                            value={sourceLang}
                            onChange={(e) => setSourceLang(e.target.value)}
                            className="input-field w-32 py-1.5 text-sm"
                        >
                            {LANGUAGES.map(l => (
                                <option key={l.code} value={l.code}>{l.name}</option>
                            ))}
                        </select>

                        <button
                            onClick={handleSwapLanguages}
                            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500"
                            title="交换语言"
                        >
                            <ArrowRightLeft size={16} />
                        </button>

                        <select
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value)}
                            className="input-field w-32 py-1.5 text-sm"
                        >
                            {LANGUAGES.filter(l => l.code !== 'Auto').map(l => (
                                <option key={l.code} value={l.code}>{l.name}</option>
                            ))}
                        </select>

                        <button
                            onClick={handleTranslate}
                            disabled={loading || !sourceText.trim()}
                            className="ml-auto px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg 
                                       disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin" size={18} /> : '翻译'}
                        </button>
                    </div>

                    {/* Input/Output Area */}
                    <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-700 overflow-hidden">
                        {/* Source */}
                        <div className="flex-1 flex flex-col p-4 relative group">
                            <textarea
                                value={sourceText}
                                onChange={(e) => setSourceText(e.target.value)}
                                placeholder="输入要翻译的文本..."
                                className="w-full h-full bg-transparent resize-none outline-none text-slate-700 dark:text-slate-200 text-lg leading-relaxed placeholder-slate-400"
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && e.ctrlKey) {
                                        handleTranslate()
                                    }
                                }}
                            />
                            {sourceText && (
                                <button
                                    onClick={() => handleTTS(sourceText)}
                                    className={`absolute bottom-4 right-4 p-2 rounded-lg 
                                               transition-all duration-300
                                               ${playing ? 'text-primary-500 scale-110' : 'text-slate-500 hover:text-primary-500 opacity-0 group-hover:opacity-100'}`}
                                >
                                    <Play size={16} className={playing ? 'animate-pulse' : ''} />
                                </button>
                            )}
                        </div>

                        {/* Target */}
                        <div className="flex-1 flex flex-col bg-slate-50/50 dark:bg-slate-900/30 relative group overflow-hidden">
                            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                                <div className="p-4 flex-1">
                                    {loading ? (
                                    <div className="h-full flex items-center justify-center text-slate-400 gap-2">
                                        <Loader2 className="animate-spin" />
                                        <span>AI 思考中...</span>
                                    </div>
                                    ) : (
                                    <div className="w-full h-full text-slate-800 dark:text-slate-100 text-lg leading-relaxed whitespace-pre-wrap min-h-[100px]">
                                        {targetText || <span className="text-slate-400 italic">翻译结果将显示在这里</span>}
                                    </div>
                                    )}
                                </div>
                            </div>

                            {targetText && !loading && (
                                <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleTTS(targetText)}
                                        className="p-2 rounded-lg bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600
                                                   text-slate-500 hover:text-primary-500"
                                        title="朗读"
                                    >
                                        <Play size={16} />
                                    </button>
                                    <button
                                        onClick={handleCopy}
                                        className="p-2 rounded-lg bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600
                                                   text-slate-500 hover:text-green-500 transition-colors"
                                        title="复制译文"
                                    >
                                        {copied ? <Check size={16} /> : <Copy size={16} />}
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
                    <span className="text-sm font-medium">历史记录</span>
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
                            暂无历史记录
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
                                        {item.source_lang} → {item.target_lang}
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(item.id, e)}
                                        className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
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
