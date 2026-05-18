import { useState, useEffect, useCallback } from 'react'
import AudioButton from '../components/AudioButton'
import { Search, Sparkles, Keyboard, Plus, RotateCw, Zap, Loader2, Upload } from 'lucide-react'
import { api, ApiError, API_PATHS } from '../utils/api'
import { getDictionarySearchErrorMessage } from '../utils/dictionaryErrors'
import { useGlobalState } from '../context/GlobalStateContext'
import { useShortcuts } from '../context/ShortcutContext'
import { useTranslation } from 'react-i18next'

export default function AddWord({ onOpenImport }: { onOpenImport?: () => void }) {
    const { t } = useTranslation()
    const { matches } = useShortcuts()
    const [searchWord, setSearchWord] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [searchResult, setSearchResult] = useState<any>(null)
    const [aiSentences, setAiSentences] = useState<string[]>([])
    const [isGeneratingAI, setIsGeneratingAI] = useState(false)
    const [activeTab, setActiveTab] = useState('youdao')
    const [isSaved, setIsSaved] = useState(false)

    const { notifyWordAdded } = useGlobalState()

    // Auto features state
    const [autoSave, setAutoSave] = useState(() => localStorage.getItem('auto_save') === 'true')
    const [autoPlay, setAutoPlay] = useState(() => localStorage.getItem('auto_play') !== 'false') // Default true

    useEffect(() => {
        localStorage.setItem('auto_save', String(autoSave))
    }, [autoSave])

    useEffect(() => {
        localStorage.setItem('auto_play', String(autoPlay))
    }, [autoPlay])

    const getDictionaryLabel = (source: string) => t(`addWord.dictionarySources.${source}`, { defaultValue: source })

    const saveWord = useCallback(async (data: any, silent = false, extraSentences: string[] = []) => {
        // 合并额外例句 (AI 生成的)
        if (extraSentences.length > 0) {
            const aiContent = "\n\n" + extraSentences.join("\n\n");
            if (!data.example.includes(extraSentences[0])) {
                data.example = (data.example || "") + aiContent;
            }
        }

        try {
            await api.post(API_PATHS.WORDS, data)
            if (!silent) alert(t('addWord.alerts.added'))
            notifyWordAdded()
            return 'success'
        } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
                if (extraSentences.length > 0) {
                    await api.put(API_PATHS.WORD(data.word), { example: data.example })
                }
                if (!silent) alert(t('addWord.alerts.exists'))
                return 'exist'
            }
            if (!silent) alert(t('addWord.alerts.failed'))
            return 'error'
        }
    }, [notifyWordAdded, t])

    const handleSearch = useCallback(async (overrideWord?: string) => {
        const wordToSearch = (overrideWord || searchWord).trim()
        if (!wordToSearch) return
        setIsSearching(true)
        setSearchResult(null)
        setAiSentences([])
        setIsSaved(false)

        const enabledDicts = ['youdao'];
        ['cambridge', 'bing', 'freedict'].forEach(id => {
            if (localStorage.getItem(`dict_${id}`) !== 'false') {
                enabledDicts.push(id);
            }
        });

        try {
            const sourcesParam = enabledDicts.join(',');
            const data = await api.get(API_PATHS.DICT_SEARCH(wordToSearch, sourcesParam))
            setSearchResult(data)
            setActiveTab('youdao')

            if (autoPlay) {
                const audioSrc = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(data.word.trim())}&type=2`;
                const audio = new Audio(audioSrc)
                audio.play().catch(e => console.error("Auto-play blocked:", e))
            }

            if (autoSave) {
                const res = await saveWord(data, true)
                if (res === 'success' || res === 'exist') {
                    setIsSaved(true)
                }
            } else {
                try {
                    const savedWord = await api.get(API_PATHS.WORD(data.word))
                    setIsSaved(!!savedWord && !savedWord.error)
                } catch {
                    setIsSaved(false)
                }
            }
        } catch (error) {
            setSearchResult({ error: getDictionarySearchErrorMessage(error, t) })
        } finally {
            setIsSearching(false)
        }
    }, [autoPlay, autoSave, saveWord, searchWord, t]);

    const handleAddWord = useCallback(async () => {
        if (!searchResult || searchResult.error) return
        const result = await saveWord(searchResult, false, aiSentences)
        if (result === 'success' || result === 'exist') {
            setIsSaved(true)
        }
    }, [aiSentences, saveWord, searchResult])

    const handleGenerateAI = useCallback(async () => {
        if (!searchWord.trim()) return
        setIsGeneratingAI(true)

        try {
            const aiProvider = localStorage.getItem('ai_provider') || 'dashscope'
            const aiApiKey = localStorage.getItem('ai_api_key') || ''
            const aiModel = localStorage.getItem('ai_model') || 'qwen-plus'

            const data = await api.post(API_PATHS.AI_GENERATE_SENTENCES,
                { word: searchWord.trim(), count: 3 },
                {
                    headers: {
                        'X-AI-Provider': aiProvider,
                        'X-AI-Key': aiApiKey,
                        'X-AI-Model': aiModel
                    }
                }
            )
            const newSentences = data.sentences || []
            setAiSentences(newSentences)

            if (searchResult && !searchResult.error && newSentences.length > 0) {
                void saveWord(searchResult, true, newSentences);
            }
        } catch (error) {
            console.error('AI generation failed:', error)
        } finally {
            setIsGeneratingAI(false)
        }
    }, [saveWord, searchResult, searchWord])


    // Keyboard shortcuts for AddWord page
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (matches(e, 'add.addWord')) {
                e.preventDefault()
                if (searchResult && !searchResult.error) {
                    handleAddWord()
                }
                return
            }

            if (matches(e, 'add.generateExample')) {
                e.preventDefault()
                if (searchWord.trim() && !isGeneratingAI) {
                    handleGenerateAI()
                }
                return
            }

            if (matches(e, 'add.playAudio')) {
                e.preventDefault()
                if (searchResult && !searchResult.error) {
                    const audioSrc = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(searchResult.word.trim())}&type=2`
                    const audio = new Audio(audioSrc)
                    audio.play().catch(err => console.warn('Audio play failed:', err))
                }
                return
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleAddWord, handleGenerateAI, isGeneratingAI, matches, searchResult, searchWord])

    // Helper to get display data for current tab
    const getDisplayData = () => {
        if (!searchResult || !searchResult.sources_data) return searchResult;
        return searchResult.sources_data[activeTab] || searchResult;
    }

    const currentData = getDisplayData();

    return (
        <div className="animate-fade-in space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                        🌟 {t('addWord.title')}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">
                        {t('addWord.subtitle', 'Ready to expand your vocabulary today?')}
                    </p>
                </div>
                {onOpenImport && (
                    <button
                        onClick={onOpenImport}
                        className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 shadow-sm transition-all hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/20 dark:hover:text-primary-300 hover:scale-105 active:scale-95"
                        title={t('sidebar.importTooltip', 'Import TXT / CSV in bulk')}
                    >
                        <Upload size={18} />
                        {t('sidebar.import', 'Batch Import')}
                    </button>
                )}
            </div>

            {/* Search Box */}
            <div className="glass-card p-6 md:p-8 rounded-3xl bg-gradient-to-br from-amber-50/50 to-rose-50/50 dark:from-amber-900/10 dark:to-rose-900/10 border-amber-100/50 dark:border-amber-700/20 shadow-xl shadow-amber-500/5 transition-all">
                <div className="flex gap-4">
                    <div className="relative flex-1 group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-amber-500/70 dark:text-amber-400/70" />
                        </div>
                        <input
                            type="text"
                            value={searchWord}
                            onChange={(e) => setSearchWord(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder={t('addWord.searchPlaceholder')}
                            className="input-field w-full pl-11 text-lg rounded-2xl border-amber-200/50 focus:border-amber-400 focus:ring-amber-400/20 dark:bg-slate-800/80 dark:border-slate-700 shadow-inner bg-white/80"
                            autoFocus
                        />
                    </div>
                    <button
                        onClick={() => handleSearch()}
                        disabled={isSearching}
                        className="btn-primary px-8 flex items-center gap-2 rounded-2xl shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all font-bold"
                    >
                        {isSearching ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Search size={20} />
                        )}
                        <span>{isSearching ? t('addWord.searching') : t('addWord.search')}</span>
                    </button>
                </div>

                {/* Options */}
                <div className="mt-5 flex gap-6 text-sm text-slate-600 dark:text-slate-400 justify-center sm:justify-start">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                        <input
                            type="checkbox"
                            checked={autoPlay}
                            onChange={e => setAutoPlay(e.target.checked)}
                            className="rounded-md border-amber-300 text-amber-500 focus:ring-amber-500/30 w-4 h-4 transition-all"
                        />
                        {t('addWord.autoPlay')}
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
                        <input
                            type="checkbox"
                            checked={autoSave}
                            onChange={e => setAutoSave(e.target.checked)}
                            className="rounded-md border-rose-300 text-rose-500 focus:ring-rose-500/30 w-4 h-4 transition-all"
                        />
                        {t('addWord.autoSave')}
                    </label>
                </div>
            </div>

            {/* Search Result */}
            {searchResult && (
                <div className="glass-card p-6 md:p-8 rounded-3xl animate-slide-up shadow-xl shadow-slate-200/40 dark:shadow-none border-slate-200/60 dark:border-slate-700/60">
                    {searchResult.error ? (
                        <div className="text-center text-slate-500 py-12 flex flex-col items-center">
                            <span className="text-6xl mb-4 opacity-80">😕</span>
                            <h3 className="text-xl font-medium text-slate-700 dark:text-slate-300 mb-2">Oops! Couldn't find that word.</h3>
                            <p className="text-slate-500">{searchResult.error}</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Sticky Word Header */}
                            <div className="sticky top-0 z-10 -mx-6 -mt-6 p-6 pb-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800 flex items-start justify-between rounded-t-3xl">
                                <div>
                                    <h3 className="text-3xl md:text-4xl font-extrabold text-slate-800 dark:text-white flex items-center gap-4 tracking-tight">
                                        {searchResult.word}
                                        <div className="flex gap-2">
                                            {searchResult.tags && searchResult.tags.split(',').map((tag: string) => (
                                                <span key={tag} className="px-2.5 py-1 text-xs rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 font-bold tracking-wide uppercase shadow-sm border border-indigo-100 dark:border-indigo-800">
                                                    {tag.trim()}
                                                </span>
                                            ))}
                                        </div>
                                    </h3>
                                    {/* Display phonetic from current tab if available, else primary */}
                                    {(currentData.phonetic || searchResult.phonetic) && (
                                        <p className="text-slate-500 dark:text-slate-400 text-xl mt-2 font-serif flex items-center gap-3">
                                            {currentData.phonetic || searchResult.phonetic}
                                            <AudioButton
                                                word={searchResult.word}
                                                audioSrc={currentData.audio}
                                                className="bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/30 dark:hover:bg-primary-900/50 text-primary-600 shadow-sm"
                                                size={20}
                                            />
                                        </p>
                                    )}
                                </div>
                                <div className="flex gap-3">
                                    {!isSaved && (
                                        <button
                                            onClick={handleAddWord}
                                            className="btn-primary flex items-center gap-2 rounded-2xl shadow-lg shadow-primary-500/20 hover:-translate-y-1 hover:shadow-primary-500/40 transition-all px-6 py-3 font-bold"
                                        >
                                            <Plus size={20} className="stroke-[3]" />
                                            <span>{t('addWord.actions.addToBook')}</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Global Context (Roots & Synonyms) - Always Visible */}
                            {(searchResult.roots || searchResult.synonyms) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {searchResult.roots && (
                                        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 border border-orange-100 dark:border-orange-900/30">
                                            <h4 className="text-xs font-bold text-orange-800 dark:text-orange-300 mb-1 uppercase tracking-wider">
                                                🌱 {t('addWord.roots')}
                                            </h4>
                                            <p className="text-orange-900 dark:text-orange-100 text-sm leading-relaxed">
                                                {searchResult.roots}
                                            </p>
                                        </div>
                                    )}
                                    {searchResult.synonyms && (
                                        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 border border-indigo-100 dark:border-indigo-900/30">
                                            <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-1 uppercase tracking-wider">
                                                🔄 {t('addWord.synonyms')}
                                            </h4>
                                            <p className="text-indigo-900 dark:text-indigo-100 text-sm leading-relaxed">
                                                {searchResult.synonyms}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Dictionary Tabs */}
                            {searchResult.sources_data && Object.keys(searchResult.sources_data).length > 1 && (
                                <div className="flex gap-1 p-1.5 bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl overflow-x-auto my-6 shadow-inner w-max max-w-full">
                                    {Object.keys(searchResult.sources_data).map(source => {
                                        const isActive = activeTab === source;
                                        const iconMap: Record<string, string> = {
                                            youdao: '🦜',
                                            cambridge: '🏛️',
                                            bing: '🔍',
                                            freedict: '📖'
                                        };
                                        return (
                                            <button
                                                key={source}
                                                onClick={() => setActiveTab(source)}
                                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${isActive
                                                    ? 'bg-white text-slate-800 dark:bg-slate-700 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/5 transform scale-100'
                                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 scale-95 hover:scale-100'
                                                    }`}
                                            >
                                                <span className="text-lg">{iconMap[source] || '📚'}</span>
                                                {getDictionaryLabel(source)}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Content for Active Tab */}
                            <div className="animate-fade-in min-h-[100px] mt-2">
                                {/* Meaning */}
                                <div className="mb-8">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-bold text-lg text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                            💡 {t('addWord.meaning')}
                                            <span className="ml-2 text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm">
                                                {getDictionaryLabel(activeTab)}
                                            </span>
                                        </h4>
                                    </div>
                                    <div className="p-5 md:p-6 bg-gradient-to-br from-emerald-50/70 to-teal-50/70 dark:from-emerald-900/10 dark:to-teal-900/10 rounded-2xl border border-emerald-100/60 dark:border-emerald-800/30 shadow-sm">
                                        <div className="space-y-3">
                                            {(currentData?.meaning || t('addWord.noMeaning')).split('\n').map((line: string, i: number) => {
                                                const match = line.match(/^([a-z]+\.)\s+(.+)$/);
                                                if (match) {
                                                    return (
                                                        <div key={i} className="flex items-start gap-3 bg-white/50 dark:bg-slate-800/50 p-3 rounded-xl">
                                                            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-black tracking-wider uppercase shrink-0 shadow-sm mt-0.5">{match[1]}</span>
                                                            <span className="text-slate-700 dark:text-slate-200 leading-relaxed font-medium text-lg">{match[2]}</span>
                                                        </div>
                                                    )
                                                }
                                                return <p key={i} className="text-slate-700 dark:text-slate-200 leading-relaxed font-medium text-lg px-2">{line}</p>
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Example */}
                                {currentData?.example && (
                                    <div className="mb-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <h4 className="font-bold text-lg text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                                📝 {t('addWord.example')}
                                            </h4>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4">
                                            {currentData.example.split(/\n(?=[•*-])|\n{2,}/).filter((item: string) => item.trim().length > 5).map((example: string, index: number) => {
                                                const lines = example.trim().replace(/^[•*-]\s*/, '').split('\n');
                                                const enLine = lines.find((l: string) => !/[\u4e00-\u9fff]/.test(l)) || '';
                                                
                                                return (
                                                    <div key={index} className="p-5 bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all group flex flex-col sm:flex-row items-start gap-4">
                                                        <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-700/50 flex items-center justify-center text-slate-400 font-bold shrink-0 shadow-inner text-sm mt-1">
                                                            {index + 1}
                                                        </div>
                                                        <div className="flex-1 space-y-2 w-full">
                                                            {lines.map((line: string, lineIndex: number) => {
                                                                const isCn = /[\u4e00-\u9fff]/.test(line);
                                                                return (
                                                                    <p
                                                                        key={lineIndex}
                                                                        className={`leading-relaxed ${isCn ? 'text-sm text-slate-500 dark:text-slate-400 mt-1 border-l-2 border-slate-200 dark:border-slate-600 pl-3' : 'text-base md:text-lg font-medium text-slate-800 dark:text-slate-200'}`}
                                                                    >
                                                                        {line.trim()}
                                                                    </p>
                                                                )
                                                            })}
                                                        </div>
                                                        {enLine && (
                                                            <AudioButton
                                                                text={enLine}
                                                                useTTS={true}
                                                                isExample={true}
                                                                size={18}
                                                                className="opacity-0 group-hover:opacity-100 transition-all bg-primary-50 hover:bg-primary-100 hover:scale-110 dark:bg-primary-900/30 dark:hover:bg-primary-900/50 shrink-0 shadow-sm self-start sm:self-center -mt-12 sm:mt-0 ml-auto sm:ml-0"
                                                            />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* AI Generation */}
                            <div className="border-t-2 border-dashed border-slate-200 dark:border-slate-700/60 pt-8 mt-8">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h4 className="font-bold text-lg text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                            ✨ {t('addWord.aiExamples')}
                                        </h4>
                                        <p className="text-sm text-slate-500 mt-1">Want more context? Let AI generate custom examples.</p>
                                    </div>
                                    <button
                                        onClick={handleGenerateAI}
                                        disabled={isGeneratingAI}
                                        className="btn-accent text-sm px-5 py-2.5 flex items-center gap-2 rounded-xl font-bold shadow-md shadow-accent-500/20 hover:shadow-accent-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                                    >
                                        {isGeneratingAI ? (
                                            <RotateCw size={18} className="animate-spin" />
                                        ) : (
                                            <Sparkles size={18} />
                                        )}
                                        <span>{isGeneratingAI ? t('addWord.generating') : t('addWord.generateExamples')}</span>
                                    </button>
                                </div>

                                {aiSentences.length > 0 && (
                                    <div className="grid grid-cols-1 gap-4 mt-4">
                                        {aiSentences.map((sentence, i) => (
                                            <div key={i} className="bg-gradient-to-r from-accent-50/80 to-purple-50/80 dark:from-accent-900/10 dark:to-purple-900/10 rounded-2xl p-5 border border-accent-100/50 dark:border-accent-800/30 text-slate-800 dark:text-slate-200 animate-slide-up shadow-sm flex items-start gap-4 group hover:shadow-md transition-shadow" style={{ animationDelay: `${i * 0.1}s` }}>
                                                <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-accent-500 font-bold shrink-0 shadow-sm text-sm mt-0.5">
                                                    ✨
                                                </div>
                                                <span className="flex-1 text-lg leading-relaxed">{sentence}</span>
                                                <AudioButton
                                                    text={sentence}
                                                    useTTS={true}
                                                    isExample={true}
                                                    size={18}
                                                    className="shrink-0 shadow-sm bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 opacity-0 group-hover:opacity-100 transition-opacity mt-1"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Quick Tips */}
            {!searchResult && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                    <div className="glass-card p-6 md:p-8 rounded-3xl text-center flex flex-col items-center gap-3 bg-gradient-to-b from-white to-blue-50/50 hover:to-blue-100/50 transition-all border-blue-100/50 dark:from-slate-800 dark:to-slate-800/80 dark:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-1">
                        <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-inner mb-2">
                            <Search size={32} strokeWidth={1.5} />
                        </div>
                        <h3 className="font-extrabold text-xl text-slate-800 dark:text-slate-200 tracking-tight">{t('addWord.quickTips.search.title')}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{t('addWord.quickTips.search.desc')}</p>
                    </div>
                    <div className="glass-card p-6 md:p-8 rounded-3xl text-center flex flex-col items-center gap-3 bg-gradient-to-b from-white to-amber-50/50 hover:to-amber-100/50 transition-all border-amber-100/50 dark:from-slate-800 dark:to-slate-800/80 dark:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-1">
                        <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-inner mb-2">
                            <Zap size={32} strokeWidth={1.5} />
                        </div>
                        <h3 className="font-extrabold text-xl text-slate-800 dark:text-slate-200 tracking-tight">{t('addWord.quickTips.ai.title')}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{t('addWord.quickTips.ai.desc')}</p>
                    </div>
                    <div className="glass-card p-6 md:p-8 rounded-3xl text-center flex flex-col items-center gap-3 bg-gradient-to-b from-white to-rose-50/50 hover:to-rose-100/50 transition-all border-rose-100/50 dark:from-slate-800 dark:to-slate-800/80 dark:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-1">
                        <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-inner mb-2">
                            <Keyboard size={32} strokeWidth={1.5} />
                        </div>
                        <h3 className="font-extrabold text-xl text-slate-800 dark:text-slate-200 tracking-tight">{t('addWord.quickTips.shortcuts.title')}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{t('addWord.quickTips.shortcuts.desc')}</p>
                    </div>
                </div>
            )}
        </div>
    )
}
