import { useState, useEffect } from 'react'

interface Word {
    id: number
    word: string
    phonetic: string
    meaning: string
    mastered: boolean
    next_review_time: number
    tags: string
}

export default function WordList() {
    const [words, setWords] = useState<Word[]>([])
    const [loading, setLoading] = useState(true)
    const [searchKeyword, setSearchKeyword] = useState('')
    const [filterTag, setFilterTag] = useState('')
    const [allTags, setAllTags] = useState<string[]>([])

    useEffect(() => {
        fetchWords()
        fetchTags()
    }, [searchKeyword, filterTag])

    const fetchWords = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (searchKeyword) params.append('keyword', searchKeyword)
            if (filterTag) params.append('tag', filterTag)
            params.append('page_size', '100')

            const response = await fetch(`http://localhost:8000/api/words?${params}`)
            if (response.ok) {
                const data = await response.json()
                setWords(data.words || [])
            }
        } catch (error) {
            console.error('Failed to fetch words:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchTags = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/words/tags')
            if (response.ok) {
                const data = await response.json()
                setAllTags(data.tags || [])
            }
        } catch (error) {
            console.error('Failed to fetch tags:', error)
        }
    }

    const handleDelete = async (word: string) => {
        if (!confirm(`确定要删除 "${word}" 吗？`)) return

        try {
            const response = await fetch(`http://localhost:8000/api/words/${encodeURIComponent(word)}`, {
                method: 'DELETE'
            })
            if (response.ok) {
                setWords(words.filter(w => w.word !== word))
            }
        } catch (error) {
            console.error('Failed to delete word:', error)
        }
    }

    const handleMarkMastered = async (word: string) => {
        try {
            const response = await fetch(`http://localhost:8000/api/words/${encodeURIComponent(word)}/master`, {
                method: 'POST'
            })
            if (response.ok) {
                setWords(words.map(w =>
                    w.word === word ? { ...w, mastered: true } : w
                ))
            }
        } catch (error) {
            console.error('Failed to mark mastered:', error)
        }
    }

    const getStatusBadge = (word: Word) => {
        if (word.mastered) {
            return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">已掌握</span>
        }
        const now = Date.now() / 1000
        if (word.next_review_time <= now) {
            return <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">待复习</span>
        }
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">学习中</span>
    }

    return (
        <div className="animate-fade-in space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800 dark:text-white">
                        单词列表
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        共 {words.length} 个单词
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="glass-card p-4 flex flex-wrap gap-4">
                <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="搜索单词或释义..."
                    className="input-field flex-1 min-w-[200px]"
                />
                <select
                    value={filterTag}
                    onChange={(e) => setFilterTag(e.target.value)}
                    className="input-field w-auto"
                >
                    <option value="">全部标签</option>
                    {allTags.map(tag => (
                        <option key={tag} value={tag}>{tag}</option>
                    ))}
                </select>
            </div>

            {/* Word List */}
            <div className="glass-card overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">
                        <div className="animate-pulse">加载中...</div>
                    </div>
                ) : words.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        <span className="text-4xl">📚</span>
                        <p className="mt-2">暂无单词，去添加一些吧！</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        {words.map((word, index) => (
                            <div
                                key={word.id}
                                className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 
                           transition-colors animate-slide-up"
                                style={{ animationDelay: `${index * 0.02}s` }}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <h3 className="font-bold text-lg text-slate-800 dark:text-white">
                                                {word.word}
                                            </h3>
                                            <span className="text-slate-400">{word.phonetic}</span>
                                            {getStatusBadge(word)}
                                            {word.tags && word.tags.split(',').map(tag => (
                                                <span
                                                    key={tag}
                                                    className="px-2 py-0.5 text-xs rounded bg-slate-100 dark:bg-slate-700 
                                     text-slate-600 dark:text-slate-300"
                                                >
                                                    {tag.trim()}
                                                </span>
                                            ))}
                                        </div>
                                        <p className="text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                            {word.meaning}
                                        </p>
                                    </div>

                                    <div className="flex gap-2 ml-4">
                                        <button
                                            onClick={() => {
                                                const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${word.word}&type=2`)
                                                audio.play()
                                            }}
                                            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 
                                 transition-colors text-slate-500"
                                            title="播放发音"
                                        >
                                            🔊
                                        </button>
                                        {!word.mastered && (
                                            <button
                                                onClick={() => handleMarkMastered(word.word)}
                                                className="p-2 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 
                                   transition-colors text-slate-500 hover:text-green-600"
                                                title="标记为已掌握"
                                            >
                                                ✅
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(word.word)}
                                            className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 
                                 transition-colors text-slate-500 hover:text-red-600"
                                            title="删除"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
