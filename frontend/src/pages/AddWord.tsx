import { useState } from 'react'

export default function AddWord() {
    const [searchWord, setSearchWord] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [searchResult, setSearchResult] = useState<any>(null)
    const [aiSentences, setAiSentences] = useState<string[]>([])
    const [isGeneratingAI, setIsGeneratingAI] = useState(false)

    const handleSearch = async () => {
        if (!searchWord.trim()) return
        setIsSearching(true)
        setSearchResult(null)

        try {
            const response = await fetch(`http://localhost:8000/api/dict/search/${encodeURIComponent(searchWord)}`)
            if (response.ok) {
                const data = await response.json()
                setSearchResult(data)
            } else {
                setSearchResult({ error: '未找到该单词' })
            }
        } catch (error) {
            setSearchResult({ error: '查询失败，请检查后端服务' })
        } finally {
            setIsSearching(false)
        }
    }

    const handleAddWord = async () => {
        if (!searchResult || searchResult.error) return

        try {
            const response = await fetch('http://localhost:8000/api/words', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(searchResult)
            })

            if (response.ok) {
                alert('✅ 单词添加成功！')
                setSearchWord('')
                setSearchResult(null)
                setAiSentences([])
            } else if (response.status === 409) {
                alert('⚠️ 该单词已存在')
            }
        } catch (error) {
            alert('❌ 添加失败')
        }
    }

    const handleGenerateAI = async () => {
        if (!searchWord.trim()) return
        setIsGeneratingAI(true)

        try {
            const response = await fetch('http://localhost:8000/api/ai/generate-sentences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word: searchWord, count: 3 })
            })

            if (response.ok) {
                const data = await response.json()
                setAiSentences(data.sentences || [])
            }
        } catch (error) {
            console.error('AI generation failed:', error)
        } finally {
            setIsGeneratingAI(false)
        }
    }

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
                        onClick={handleSearch}
                        disabled={isSearching}
                        className="btn-primary px-8"
                    >
                        {isSearching ? (
                            <span className="animate-pulse">查询中...</span>
                        ) : (
                            '🔍 查询'
                        )}
                    </button>
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
                                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white">
                                        {searchResult.word}
                                    </h3>
                                    {searchResult.phonetic && (
                                        <p className="text-slate-500 text-lg">{searchResult.phonetic}</p>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${searchResult.word}&type=2`)
                                            audio.play()
                                        }}
                                        className="btn-secondary"
                                    >
                                        🔊 发音
                                    </button>
                                    <button onClick={handleAddWord} className="btn-primary">
                                        ➕ 添加到生词本
                                    </button>
                                </div>
                            </div>

                            {/* Meaning */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                                <h4 className="font-medium text-slate-600 dark:text-slate-300 mb-2">释义</h4>
                                <p className="text-slate-800 dark:text-slate-200 whitespace-pre-line">
                                    {searchResult.meaning}
                                </p>
                            </div>

                            {/* Example */}
                            {searchResult.example && (
                                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                                    <h4 className="font-medium text-slate-600 dark:text-slate-300 mb-2">例句</h4>
                                    <p className="text-slate-800 dark:text-slate-200 whitespace-pre-line">
                                        {searchResult.example}
                                    </p>
                                </div>
                            )}

                            {/* AI Generation */}
                            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                        ✨ AI 智能例句
                                    </h4>
                                    <button
                                        onClick={handleGenerateAI}
                                        disabled={isGeneratingAI}
                                        className="btn-accent text-sm px-4 py-2"
                                    >
                                        {isGeneratingAI ? '生成中...' : '🤖 生成例句'}
                                    </button>
                                </div>

                                {aiSentences.length > 0 && (
                                    <div className="space-y-2">
                                        {aiSentences.map((sentence, i) => (
                                            <div
                                                key={i}
                                                className="bg-accent-50 dark:bg-accent-900/20 rounded-lg p-3 
                                   text-slate-700 dark:text-slate-300 animate-slide-up"
                                                style={{ animationDelay: `${i * 0.1}s` }}
                                            >
                                                {sentence}
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
                    <div className="glass-card p-5 text-center">
                        <span className="text-3xl">🔍</span>
                        <h3 className="font-medium mt-2">智能查询</h3>
                        <p className="text-sm text-slate-500 mt-1">支持英文单词查询和翻译</p>
                    </div>
                    <div className="glass-card p-5 text-center">
                        <span className="text-3xl">🤖</span>
                        <h3 className="font-medium mt-2">AI 增强</h3>
                        <p className="text-sm text-slate-500 mt-1">AI 生成例句和记忆技巧</p>
                    </div>
                    <div className="glass-card p-5 text-center">
                        <span className="text-3xl">⌨️</span>
                        <h3 className="font-medium mt-2">快捷键</h3>
                        <p className="text-sm text-slate-500 mt-1">Ctrl+Alt+V 全局呼出</p>
                    </div>
                </div>
            )}
        </div>
    )
}
