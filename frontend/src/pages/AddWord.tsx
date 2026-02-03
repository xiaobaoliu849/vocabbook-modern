import { useState, useEffect, useCallback } from 'react'
import AudioButton from '../components/AudioButton'
import { Search, Sparkles, Keyboard, Plus, RotateCw, Zap, Loader2 } from 'lucide-react'
import { splitExamples, extractEnglish } from '../utils/textUtils'

export default function AddWord() {
    const [searchWord, setSearchWord] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [searchResult, setSearchResult] = useState<any>(null)
    const [aiSentences, setAiSentences] = useState<string[]>([])
    const [isGeneratingAI, setIsGeneratingAI] = useState(false)
    const [activeTab, setActiveTab] = useState('youdao')

    // Auto features state
    const [autoSave, setAutoSave] = useState(() => localStorage.getItem('auto_save') === 'true')
    const [autoPlay, setAutoPlay] = useState(() => localStorage.getItem('auto_play') !== 'false') // Default true

    useEffect(() => {
        localStorage.setItem('auto_save', String(autoSave))
    }, [autoSave])

    useEffect(() => {
        localStorage.setItem('auto_play', String(autoPlay))
    }, [autoPlay])

    const saveWord = async (data: any, silent = false, extraSentences: string[] = []) => {
        // 合并额外例句 (AI 生成的)
        if (extraSentences.length > 0) {
            const aiContent = "\n\n" + extraSentences.join("\n\n");
            // 避免重复追加
            if (!data.example.includes(extraSentences[0])) {
                data.example = (data.example || "") + aiContent;
            }
        }

        try {
            const response = await fetch('http://localhost:8000/api/words', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })

            if (response.ok) {
                if (!silent) alert('✅ 单词添加成功！')
                return 'success'
            } else if (response.status === 409) {
                // 如果已存在且是 AI 生成触发的静默保存，则尝试更新
                if (extraSentences.length > 0) {
                    await fetch(`http://localhost:8000/api/words/${encodeURIComponent(data.word)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ example: data.example })
                    });
                }
                if (!silent) alert('⚠️ 该单词已存在')
                return 'exist'
            }
        } catch (error) {
            if (!silent) alert('❌ 添加失败')
            return 'error'
        }
    }

    const handleSearch = useCallback(async (overrideWord?: string) => {
        const wordToSearch = overrideWord || searchWord
        if (!wordToSearch.trim()) return
        setIsSearching(true)
        setSearchResult(null)
        setAiSentences([])

        // Get enabled dicts from localStorage (Default to enabled if not set)
        const enabledDicts = ['youdao'];
        ['cambridge', 'bing', 'freedict'].forEach(id => {
            if (localStorage.getItem(`dict_${id}`) !== 'false') {
                enabledDicts.push(id);
            }
        });

        try {
            const sourcesParam = enabledDicts.join(',');
            const response = await fetch(`http://localhost:8000/api/dict/search/${encodeURIComponent(wordToSearch)}?sources=${sourcesParam}`)
            if (response.ok) {
                const data = await response.json()
                setSearchResult(data)
                setActiveTab('youdao')

                // Auto Play
                if (autoPlay) {
                    let audioSrc = `https://dict.youdao.com/dictvoice?audio=${data.word}&type=2`;
                    const audio = new Audio(audioSrc)
                    audio.play().catch(e => console.error("Auto-play blocked:", e))
                }

                // Auto Save
                if (autoSave) {
                    saveWord(data, true)
                }

            } else {
                setSearchResult({ error: '未找到该单词' })
            }
        } catch (error) {
            setSearchResult({ error: '查询失败，请检查后端服务' })
        } finally {
            setIsSearching(false)
        }
    }, [searchWord, autoPlay, autoSave]);

    // Listen for global search events (e.g. from context menu)
    useEffect(() => {
        const handleSearchRequest = (event: Event) => {
            const customEvent = event as CustomEvent
            if (customEvent.detail) {
                setSearchWord(customEvent.detail)
                handleSearch(customEvent.detail)
            }
        }

        window.addEventListener('search-word', handleSearchRequest)
        return () => window.removeEventListener('search-word', handleSearchRequest)
    }, [handleSearch])

    // Keyboard shortcuts for AddWord page
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+Enter to add word
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault()
                if (searchResult && !searchResult.error) {
                    handleAddWord()
                }
                return
            }

            // Ctrl+G to generate AI sentences
            if (e.ctrlKey && (e.key === 'g' || e.key === 'G')) {
                e.preventDefault()
                if (searchWord.trim() && !isGeneratingAI) {
                    handleGenerateAI()
                }
                return
            }

            // Ctrl+P to play audio
            if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
                e.preventDefault()
                if (searchResult && !searchResult.error) {
                    const audioSrc = `https://dict.youdao.com/dictvoice?audio=${searchResult.word}&type=2`
                    const audio = new Audio(audioSrc)
                    audio.play().catch(err => console.warn('Audio play failed:', err))
                }
                return
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [searchResult, searchWord, isGeneratingAI])

    const handleAddWord = async () => {
        if (!searchResult || searchResult.error) return
        const result = await saveWord(searchResult, false, aiSentences)
        if (result === 'success') {
            setSearchWord('')
            setSearchResult(null)
            setAiSentences([])
        }
    }

    const handleGenerateAI = async () => {
        if (!searchWord.trim()) return
        setIsGeneratingAI(true)

        try {
            const aiProvider = localStorage.getItem('ai_provider') || 'dashscope'
            const aiApiKey = localStorage.getItem('ai_api_key') || ''
            const aiModel = localStorage.getItem('ai_model') || 'qwen-plus'

            const response = await fetch('http://localhost:8000/api/ai/generate-sentences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-AI-Provider': aiProvider,
                    'X-AI-Key': aiApiKey,
                    'X-AI-Model': aiModel
                },
                body: JSON.stringify({ word: searchWord, count: 3 })
            })

            if (response.ok) {
                const data = await response.json()
                const newSentences = data.sentences || []
                setAiSentences(newSentences)

                // 重点：自动同步到数据库
                if (searchResult && !searchResult.error && newSentences.length > 0) {
                    // 静默调用 saveWord，利用其内部的 update 逻辑
                    saveWord(searchResult, true, newSentences);
                }
            }
        } catch (error) {
            console.error('AI generation failed:', error)
        } finally {
            setIsGeneratingAI(false)
        }
    }

    // Helper to get display data for current tab
    const getDisplayData = () => {
        if (!searchResult || !searchResult.sources_data) return searchResult;
        return searchResult.sources_data[activeTab] || searchResult;
    }

    const currentData = getDisplayData();

    return (
        <div className="animate-fade-in space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-bold text-slate-800 dark:text-white">
                    词汇中心
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                    搜索词典、AI 生成例句、一键添加到生词本
                </p>
            </div>

            {/* Search Box */}
            <div className="glass-card p-6">
                <div className="flex gap-4">
                    <input
                        type="text"
                        value={searchWord}
                        onChange={(e) => setSearchWord(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="输入要查询的单词..."
                        className="input-field flex-1 text-lg"
                        autoFocus
                    />
                    <button
                        onClick={() => handleSearch()}
                        disabled={isSearching}
                        className="btn-primary px-8 flex items-center gap-2"
                    >
                        {isSearching ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Search size={20} />
                        )}
                        <span>{isSearching ? '查询中...' : '查询'}</span>
                    </button>
                </div>

                {/* Options */}
                <div className="mt-4 flex gap-6 text-sm text-slate-600 dark:text-slate-400">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={autoPlay}
                            onChange={e => setAutoPlay(e.target.checked)}
                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        />
                        自动发音
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={autoSave}
                            onChange={e => setAutoSave(e.target.checked)}
                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        />
                        自动收藏
                    </label>
                </div>
            </div>

            {/* Search Result */}
            {searchResult && (
                <div className="glass-card p-6 animate-slide-up">
                    {searchResult.error ? (
                        <div className="text-center text-slate-500 py-8">
                            <span className="text-4xl">😕</span>
                            <p className="mt-2">{searchResult.error}</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Word Header */}
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                                        {searchResult.word}
                                        {searchResult.tags && searchResult.tags.split(',').map((tag: string) => (
                                            <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 font-normal">
                                                {tag.trim()}
                                            </span>
                                        ))}
                                    </h3>
                                    {/* Display phonetic from current tab if available, else primary */}
                                    {(currentData.phonetic || searchResult.phonetic) && (
                                        <p className="text-slate-500 text-lg mt-1">
                                            {currentData.phonetic || searchResult.phonetic}
                                        </p>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <AudioButton
                                        word={searchResult.word}
                                        audioSrc={currentData.audio}
                                        className="btn-secondary !p-2 h-auto"
                                    />
                                    <button onClick={handleAddWord} className="btn-primary flex items-center gap-2">
                                        <Plus size={18} />
                                        <span>添加到生词本</span>
                                    </button>
                                </div>                                                        </div>

                            {/* Global Context (Roots & Synonyms) - Always Visible */}
                            {(searchResult.roots || searchResult.synonyms) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {searchResult.roots && (
                                        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 border border-orange-100 dark:border-orange-900/30">
                                            <h4 className="text-xs font-bold text-orange-800 dark:text-orange-300 mb-1 uppercase tracking-wider">
                                                🌱 词根记忆
                                            </h4>
                                            <p className="text-orange-900 dark:text-orange-100 text-sm leading-relaxed">
                                                {searchResult.roots}
                                            </p>
                                        </div>
                                    )}
                                    {searchResult.synonyms && (
                                        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 border border-indigo-100 dark:border-indigo-900/30">
                                            <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-1 uppercase tracking-wider">
                                                🔄 同近义词
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
                                <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-2 overflow-x-auto mt-2">
                                    {Object.keys(searchResult.sources_data).map(source => (
                                        <button
                                            key={source}
                                            onClick={() => setActiveTab(source)}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === source
                                                ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-md'
                                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                                }`}
                                        >
                                            {
                                                source === 'youdao' ? '有道词典' :
                                                    source === 'cambridge' ? 'Cambridge' :
                                                        source === 'bing' ? 'Bing' :
                                                            source === 'freedict' ? 'FreeDict' : source
                                            }
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Content for Active Tab */}
                            <div className="animate-fade-in min-h-[100px]">
                                {/* Meaning */}
                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-bold text-slate-700 dark:text-slate-200">
                                            释义
                                            <span className="ml-2 text-xs font-normal text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                                {activeTab}
                                            </span>
                                        </h4>
                                    </div>
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                        <p className="text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed text-base">
                                            {currentData?.meaning || "暂无释义"}
                                        </p>
                                    </div>
                                </div>

                                {/* Example */}
                                {currentData?.example && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <h4 className="font-bold text-slate-700 dark:text-slate-200">例句</h4>
                                            <AudioButton
                                                text={currentData.example}
                                                useTTS={true}
                                                isExample={true}
                                                size={16}
                                                className="bg-emerald-50 dark:bg-emerald-900/20"
                                            />
                                        </div>
                                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                            <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed text-sm font-mono">
                                                {currentData.example}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* AI Generation */}
                            <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                        <Sparkles size={18} className="text-accent-500" />
                                        AI 智能例句
                                    </h4>
                                    <button
                                        onClick={handleGenerateAI}
                                        disabled={isGeneratingAI}
                                        className="btn-accent text-sm px-4 py-2 flex items-center gap-2"
                                    >
                                        {isGeneratingAI ? (
                                            <RotateCw size={16} className="animate-spin" />
                                        ) : (
                                            <Sparkles size={16} />
                                        )}
                                        <span>{isGeneratingAI ? '生成中...' : '生成例句'}</span>
                                    </button>
                                </div>

                                {aiSentences.length > 0 && (
                                    <div className="space-y-2">
                                        {aiSentences.map((sentence, i) => (
                                            <div key={i} className="bg-accent-50 dark:bg-accent-900/20 rounded-lg p-3 text-slate-700 dark:text-slate-300 animate-slide-up flex items-start gap-2" style={{ animationDelay: `${i * 0.1}s` }}>
                                                <AudioButton
                                                    text={sentence}
                                                    useTTS={true}
                                                    isExample={true}
                                                    size={16}
                                                    className="flex-shrink-0 mt-0.5"
                                                />
                                                <span>{sentence}</span>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="glass-card p-5 text-center flex flex-col items-center gap-2 hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400">
                            <Search size={24} />
                        </div>
                        <h3 className="font-medium">智能查询</h3>
                        <p className="text-sm text-slate-500">支持多词典聚合查询</p>
                    </div>
                    <div className="glass-card p-5 text-center flex flex-col items-center gap-2 hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="w-12 h-12 rounded-2xl bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center text-accent-600 dark:text-accent-400">
                            <Zap size={24} />
                        </div>
                        <h3 className="font-medium">AI 增强</h3>
                        <p className="text-sm text-slate-500">AI 生成例句和记忆技巧</p>
                    </div>
                    <div className="glass-card p-5 text-center flex flex-col items-center gap-2 hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="w-12 h-12 rounded-2xl bg-secondary-100 dark:bg-secondary-900/30 flex items-center justify-center text-secondary-600 dark:text-secondary-400">
                            <Keyboard size={24} />
                        </div>
                        <h3 className="font-medium">快捷键</h3>
                        <p className="text-sm text-slate-500">Ctrl+Alt+V 全局呼出</p>
                    </div>
                </div>
            )}
        </div>
    )
}