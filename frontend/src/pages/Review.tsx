import { useState, useEffect, useCallback } from 'react'

interface ReviewWord {
    id: number
    word: string
    phonetic: string
    meaning: string
    example: string
    easiness: number
    interval: number
}

export default function Review() {
    const [dueWords, setDueWords] = useState<ReviewWord[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isFlipped, setIsFlipped] = useState(false)
    const [loading, setLoading] = useState(true)
    const [sessionStats, setSessionStats] = useState({ reviewed: 0, startTime: Date.now() })

    useEffect(() => {
        fetchDueWords()
    }, [])

    const fetchDueWords = async () => {
        setLoading(true)
        try {
            const response = await fetch('http://localhost:8000/api/review/due?limit=50')
            if (response.ok) {
                const data = await response.json()
                setDueWords(data.words || [])
            }
        } catch (error) {
            console.error('Failed to fetch due words:', error)
        } finally {
            setLoading(false)
        }
    }

    const currentWord = dueWords[currentIndex]

    const handleRating = async (quality: number) => {
        if (!currentWord) return

        try {
            await fetch('http://localhost:8000/api/review/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    word: currentWord.word,
                    quality,
                    time_spent: 0
                })
            })

            setSessionStats(prev => ({ ...prev, reviewed: prev.reviewed + 1 }))

            // Move to next word
            if (currentIndex < dueWords.length - 1) {
                setCurrentIndex(currentIndex + 1)
                setIsFlipped(false)
            } else {
                // Session complete
                logSession()
            }
        } catch (error) {
            console.error('Failed to submit review:', error)
        }
    }

    const logSession = async () => {
        const duration = Math.floor((Date.now() - sessionStats.startTime) / 1000)
        try {
            await fetch('http://localhost:8000/api/review/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    duration,
                    review_count: sessionStats.reviewed
                })
            })
        } catch (error) {
            console.error('Failed to log session:', error)
        }
    }

    const playAudio = useCallback(() => {
        if (currentWord) {
            const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${currentWord.word}&type=2`)
            audio.play()
        }
    }, [currentWord])

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!currentWord) return

            if (e.code === 'Space') {
                e.preventDefault()
                setIsFlipped(!isFlipped)
            } else if (e.key === '1') handleRating(1)
            else if (e.key === '2') handleRating(2)
            else if (e.key === '3') handleRating(3)
            else if (e.key === '4') handleRating(4)
            else if (e.key === '5') handleRating(5)
            else if (e.key === 'p') playAudio()
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [currentWord, isFlipped, playAudio])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-xl text-slate-500 animate-pulse">加载中...</div>
            </div>
        )
    }

    if (dueWords.length === 0) {
        return (
            <div className="animate-fade-in text-center py-16">
                <span className="text-6xl">🎉</span>
                <h2 className="text-2xl font-bold mt-4 text-slate-800 dark:text-white">
                    太棒了！
                </h2>
                <p className="text-slate-500 mt-2">
                    暂无待复习的单词，休息一下吧！
                </p>
                <button
                    onClick={fetchDueWords}
                    className="btn-primary mt-6"
                >
                    刷新
                </button>
            </div>
        )
    }

    if (currentIndex >= dueWords.length) {
        return (
            <div className="animate-fade-in text-center py-16">
                <span className="text-6xl">✅</span>
                <h2 className="text-2xl font-bold mt-4 text-slate-800 dark:text-white">
                    复习完成！
                </h2>
                <p className="text-slate-500 mt-2">
                    本次复习了 {sessionStats.reviewed} 个单词
                </p>
                <button
                    onClick={() => {
                        setCurrentIndex(0)
                        setSessionStats({ reviewed: 0, startTime: Date.now() })
                        fetchDueWords()
                    }}
                    className="btn-primary mt-6"
                >
                    再来一轮
                </button>
            </div>
        )
    }

    return (
        <div className="animate-fade-in space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800 dark:text-white">
                        智能复习
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        {currentIndex + 1} / {dueWords.length} · 已复习 {sessionStats.reviewed} 个
                    </p>
                </div>
                <div className="text-sm text-slate-500">
                    按 空格 翻转 · 数字键 1-5 评分
                </div>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-300"
                    style={{ width: `${((currentIndex + 1) / dueWords.length) * 100}%` }}
                />
            </div>

            {/* Flashcard */}
            <div
                className={`flip-card cursor-pointer ${isFlipped ? 'flipped' : ''}`}
                onClick={() => setIsFlipped(!isFlipped)}
            >
                <div className="flip-card-inner relative" style={{ minHeight: '300px' }}>
                    {/* Front */}
                    <div className="flip-card-front absolute inset-0 glass-card p-8 flex flex-col items-center justify-center">
                        <h3 className="text-4xl font-bold text-slate-800 dark:text-white mb-4">
                            {currentWord.word}
                        </h3>
                        {currentWord.phonetic && (
                            <p className="text-xl text-slate-500">{currentWord.phonetic}</p>
                        )}
                        <button
                            onClick={(e) => { e.stopPropagation(); playAudio() }}
                            className="mt-4 btn-secondary"
                        >
                            🔊 发音
                        </button>
                        <p className="mt-6 text-slate-400 text-sm">点击卡片查看释义</p>
                    </div>

                    {/* Back */}
                    <div className="flip-card-back absolute inset-0 glass-card p-8 flex flex-col items-center justify-center">
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                            {currentWord.word}
                        </h3>
                        <div className="text-lg text-slate-700 dark:text-slate-300 text-center whitespace-pre-line max-w-lg">
                            {currentWord.meaning}
                        </div>
                        {currentWord.example && (
                            <div className="mt-4 text-slate-500 text-center text-sm max-w-lg">
                                {currentWord.example}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Rating Buttons */}
            {isFlipped && (
                <div className="flex justify-center gap-3 animate-slide-up">
                    <button
                        onClick={() => handleRating(1)}
                        className="px-6 py-3 rounded-xl bg-red-100 hover:bg-red-200 
                       dark:bg-red-900/30 dark:hover:bg-red-900/50
                       text-red-700 dark:text-red-400 font-medium transition-all"
                    >
                        1 完全忘记
                    </button>
                    <button
                        onClick={() => handleRating(2)}
                        className="px-6 py-3 rounded-xl bg-orange-100 hover:bg-orange-200 
                       dark:bg-orange-900/30 dark:hover:bg-orange-900/50
                       text-orange-700 dark:text-orange-400 font-medium transition-all"
                    >
                        2 困难
                    </button>
                    <button
                        onClick={() => handleRating(3)}
                        className="px-6 py-3 rounded-xl bg-yellow-100 hover:bg-yellow-200 
                       dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50
                       text-yellow-700 dark:text-yellow-400 font-medium transition-all"
                    >
                        3 一般
                    </button>
                    <button
                        onClick={() => handleRating(4)}
                        className="px-6 py-3 rounded-xl bg-blue-100 hover:bg-blue-200 
                       dark:bg-blue-900/30 dark:hover:bg-blue-900/50
                       text-blue-700 dark:text-blue-400 font-medium transition-all"
                    >
                        4 简单
                    </button>
                    <button
                        onClick={() => handleRating(5)}
                        className="px-6 py-3 rounded-xl bg-green-100 hover:bg-green-200 
                       dark:bg-green-900/30 dark:hover:bg-green-900/50
                       text-green-700 dark:text-green-400 font-medium transition-all"
                    >
                        5 完美
                    </button>
                </div>
            )}
        </div>
    )
}
