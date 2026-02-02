import { useState, useEffect, useCallback } from 'react'
import AudioButton from '../components/AudioButton'
import { splitExamples, extractEnglish } from '../utils/textUtils'
import { ChoiceMode, DictationMode } from '../components/review'
import type { ReviewMode } from '../components/review'

interface ReviewWord {
    id: number
    word: string
    phonetic: string
    meaning: string
    example: string
    easiness: number
    interval: number
}

export default function Review({ isActive }: { isActive?: boolean }) {
    // Mode state
    const [reviewMode, setReviewMode] = useState<ReviewMode>('flashcard')

    // Standard review state
    const [dueWords, setDueWords] = useState<ReviewWord[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isFlipped, setIsFlipped] = useState(false)
    const [loading, setLoading] = useState(true)
    const [sessionStats, setSessionStats] = useState({ reviewed: 0, startTime: Date.now() })
    const [practiceMode, setPracticeMode] = useState(false)

    // Spelling mode state
    const [spellingInput, setSpellingInput] = useState('')
    const [spellingStatus, setSpellingStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle')
    const [showSpellingHint, setShowSpellingHint] = useState(false)

    useEffect(() => {
        fetchDueWords()
    }, [])

    const fetchDueWords = async (isPractice = false) => {
        setLoading(true)
        try {
            // 练习模式获取所有单词，正常模式只获取到期单词
            const url = isPractice
                ? 'http://localhost:8000/api/words?limit=50'
                : 'http://localhost:8000/api/review/due?limit=50'
            const response = await fetch(url)
            if (response.ok) {
                const data = await response.json()
                // 两个 API 都返回 data.words
                const words = data.words || []
                // 练习模式随机打乱顺序
                if (isPractice && words.length > 0) {
                    words.sort(() => Math.random() - 0.5)
                }
                setDueWords(words)
                setCurrentIndex(0)
                setIsFlipped(false)
            }
        } catch (error) {
            console.error('Failed to fetch words:', error)
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


            // Move to next word (increment index even for last word to trigger completion view)
            setCurrentIndex(prev => prev + 1)
            setIsFlipped(false)

            // Reset spelling state
            setSpellingInput('')
            setSpellingStatus('idle')
            setShowSpellingHint(false)

            if (currentIndex >= dueWords.length - 1) {
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
            audio.play().catch(e => console.warn("Audio play failed", e))
        }
    }, [currentWord])

    // Auto-play audio when word changes (only if page is active)
    useEffect(() => {
        if (isActive && currentWord && !loading) {
            // Small delay to ensure smooth transition
            const timer = setTimeout(() => {
                playAudio()
            }, 300)
            return () => clearTimeout(timer)
        }
    }, [isActive, currentWord, loading, playAudio])

    const checkSpelling = () => {
        if (!currentWord) return

        const input = spellingInput.trim().toLowerCase()
        const target = currentWord.word.toLowerCase()

        if (input === target) {
            setSpellingStatus('correct')
            // const audio = new Audio('/sounds/correct.mp3') 
            // Or just rely on visual feedback

            // Auto flip after success
            setTimeout(() => {
                setIsFlipped(true)
            }, 800)
        } else {
            setSpellingStatus('incorrect')
        }
    }

    const handleSpellingKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            checkSpelling()
        }
    }

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!currentWord) return

            const target = e.target as HTMLElement
            const isInInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

            // Rating keys 1-5 should work even when in input (after card is flipped)
            if (isFlipped && ['1', '2', '3', '4', '5'].includes(e.key)) {
                e.preventDefault()
                handleRating(parseInt(e.key))
                return
            }

            // Don't intercept other shortcuts when typing in spelling input
            if (isInInput) {
                return
            }

            // Tab to switch modes
            if (e.key === 'Tab') {
                e.preventDefault()
                const modes: ReviewMode[] = ['flashcard', 'spelling', 'choice', 'dictation']
                const currentIdx = modes.indexOf(reviewMode)
                const nextIdx = (currentIdx + 1) % modes.length
                setReviewMode(modes[nextIdx])
                return
            }

            // Space/Arrow to flip
            if (e.code === 'Space' || e.key === 'ArrowRight') {
                // In spelling mode, space shouldn't flip unless already flipped
                if (reviewMode === 'flashcard' || isFlipped) {
                    e.preventDefault()
                    setIsFlipped(!isFlipped)
                }
            } else if (e.key === 'ArrowLeft' && isFlipped) {
                // Arrow left to flip back
                e.preventDefault()
                setIsFlipped(false)
            } else if (e.key === 'p' || e.key === 'P' || e.key === 'r' || e.key === 'R') {
                // P or R for play/replay audio
                e.preventDefault()
                playAudio()
            } else if ((e.key === 'h' || e.key === 'H') && reviewMode === 'spelling') {
                // H for hint in spelling mode
                e.preventDefault()
                setShowSpellingHint(prev => !prev)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [currentWord, isFlipped, playAudio, reviewMode])

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
                <span className="text-6xl">{practiceMode ? '📚' : '🎉'}</span>
                <h2 className="text-2xl font-bold mt-4 text-slate-800 dark:text-white">
                    {practiceMode ? '练习模式' : '太棒了！'}
                </h2>
                <p className="text-slate-500 mt-2">
                    {practiceMode ? '正在加载单词...' : '暂无待复习的单词，休息一下吧！'}
                </p>
                <div className="flex justify-center gap-4 mt-6">
                    <button
                        onClick={() => fetchDueWords(false)}
                        className="btn-secondary"
                    >
                        刷新
                    </button>
                    <button
                        onClick={() => {
                            setPracticeMode(true)
                            fetchDueWords(true)
                        }}
                        className="btn-primary"
                    >
                        🎯 练习模式
                    </button>
                </div>
                <p className="text-xs text-slate-400 mt-4">
                    练习模式可复习所有单词，不影响复习计划
                </p>
            </div>
        )
    }

    if (currentIndex >= dueWords.length) {
        return (
            <div className="animate-fade-in text-center py-16">
                <span className="text-6xl">✅</span>
                <h2 className="text-2xl font-bold mt-4 text-slate-800 dark:text-white">
                    {practiceMode ? '练习完成！' : '复习完成！'}
                </h2>
                <p className="text-slate-500 mt-2">
                    本次{practiceMode ? '练习' : '复习'}了 {sessionStats.reviewed} 个单词
                </p>
                <div className="flex justify-center gap-4 mt-6">
                    <button
                        onClick={() => {
                            setCurrentIndex(0)
                            setSessionStats({ reviewed: 0, startTime: Date.now() })
                            fetchDueWords(practiceMode)
                        }}
                        className="btn-primary"
                    >
                        再来一轮
                    </button>
                    {practiceMode && (
                        <button
                            onClick={() => {
                                setPracticeMode(false)
                                setCurrentIndex(0)
                                setSessionStats({ reviewed: 0, startTime: Date.now() })
                                fetchDueWords(false)
                            }}
                            className="btn-secondary"
                        >
                            返回正常模式
                        </button>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col animate-fade-in">
            {/* Header */}
            <div className="flex-none mb-1">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                            智能复习
                            {practiceMode && (
                                <button
                                    onClick={() => {
                                        setPracticeMode(false)
                                        fetchDueWords(false)
                                    }}
                                    className="px-3 py-1 text-xs font-medium bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-400 rounded-full transition-colors flex items-center gap-1 cursor-pointer"
                                    title="点击退出练习模式"
                                >
                                    🎯 练习模式 <span className="text-amber-500 ml-1">×</span>
                                </button>
                            )}
                            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-sm font-medium">
                                {[
                                    { key: 'flashcard' as ReviewMode, icon: '🎴', label: '识记' },
                                    { key: 'spelling' as ReviewMode, icon: '⌨️', label: '拼写' },
                                    { key: 'choice' as ReviewMode, icon: '📝', label: '选择' },
                                    { key: 'dictation' as ReviewMode, icon: '🎧', label: '听写' },
                                ].map(mode => (
                                    <button
                                        key={mode.key}
                                        onClick={() => setReviewMode(mode.key)}
                                        className={`px-3 py-1 rounded-md transition-all ${reviewMode === mode.key
                                            ? 'bg-white dark:bg-slate-600 shadow-sm text-primary-600 dark:text-primary-400'
                                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                            }`}
                                    >
                                        {mode.icon} {mode.label}
                                    </button>
                                ))}
                            </div>
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">
                            {currentIndex + 1} / {dueWords.length} · 已复习 {sessionStats.reviewed} 个
                        </p>
                    </div>
                    <div className="text-sm text-slate-500">
                        {reviewMode === 'flashcard' ? '按 空格 翻转' : '输入后按 回车 检查'} · 数字键 1-5 评分
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-linear-to-r from-primary-500 to-accent-500 transition-all duration-300"
                        style={{ width: `${((currentIndex + 1) / dueWords.length) * 100}%` }}
                    />
                </div>
            </div>

            {/* Card Container - Flex Grow */}
            <div className="flex-1 w-full relative perspective-container mb-8 min-h-0">
                {/* Choice Mode - 选择题 */}
                {reviewMode === 'choice' && (
                    <div className="w-full h-full glass-card">
                        <ChoiceMode
                            word={currentWord}
                            allWords={dueWords}
                            onComplete={handleRating}
                            playAudio={playAudio}
                            isFlipped={isFlipped}
                            setIsFlipped={setIsFlipped}
                        />
                    </div>
                )}

                {/* Dictation Mode - 听写 */}
                {reviewMode === 'dictation' && (
                    <div className="w-full h-full glass-card">
                        <DictationMode
                            word={currentWord}
                            allWords={dueWords}
                            onComplete={handleRating}
                            playAudio={playAudio}
                            isFlipped={isFlipped}
                            setIsFlipped={setIsFlipped}
                        />
                    </div>
                )}

                {/* Flashcard/Spelling Mode - uses flip card */}
                {(reviewMode === 'flashcard' || reviewMode === 'spelling') && (
                    <div
                        className={`w-full h-full cursor-pointer flip-card ${isFlipped ? 'flipped' : ''}`}
                        onClick={() => setIsFlipped(!isFlipped)}
                    >
                        <div className="flip-card-inner w-full h-full relative" style={{ transformStyle: 'preserve-3d', transition: 'transform 0.6s' }}>
                            {/* Front */}
                            <div className="flip-card-front absolute inset-0 glass-card p-6 flex flex-col items-center justify-center backface-hidden">
                                {reviewMode === 'flashcard' ? (
                                    <>
                                        <h3 className="text-5xl font-bold text-slate-800 dark:text-white mb-6 text-center">
                                            {currentWord.word}
                                        </h3>
                                        {currentWord.phonetic && (
                                            <p className="text-2xl text-slate-500 mb-4 font-mono">{currentWord.phonetic}</p>
                                        )}
                                        <AudioButton
                                            word={currentWord.word}
                                            className="!w-16 !h-16 !text-2xl !bg-secondary-100 hover:!bg-secondary-200 text-secondary-700 dark:!bg-secondary-900/30 dark:text-secondary-400 border-none"
                                            size={28}
                                        />
                                        <p className="absolute bottom-6 text-slate-400 text-sm opacity-60">点击卡片查看释义</p>
                                    </>
                                ) : reviewMode === 'spelling' ? (
                                    // Spelling Mode Front
                                    <div className="w-full h-full flex flex-col relative overflow-hidden">
                                        {/* Meaning Display Area - Grows */}
                                        <div className="flex-1 overflow-y-auto w-full px-8 py-6 custom-scrollbar flex flex-col justify-center">
                                            {currentWord.meaning && (
                                                <div className="text-xl text-slate-700 dark:text-slate-300 text-left space-y-3 leading-relaxed max-w-3xl mx-auto">
                                                    {currentWord.meaning.split('\n').map((line, i) => (
                                                        <div key={i}>{line}</div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Input Area - Fixed at bottom */}
                                        <div className="flex-none p-6 bg-gradient-to-t from-white/50 to-transparent dark:from-slate-900/50 flex flex-col items-center gap-4">
                                            <input
                                                type="text"
                                                value={spellingInput}
                                                onChange={(e) => {
                                                    setSpellingInput(e.target.value)
                                                    setSpellingStatus('idle')
                                                }}
                                                onKeyDown={handleSpellingKeyDown}
                                                onClick={(e) => e.stopPropagation()}
                                                placeholder="输入单词拼写..."
                                                autoFocus
                                                className={`w-full max-w-lg px-8 py-3 text-3xl text-center rounded-2xl border-2 outline-none transition-all shadow-sm
                                                ${spellingStatus === 'correct'
                                                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                                        : spellingStatus === 'incorrect'
                                                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                                                            : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 focus:border-primary-500'
                                                    }
                                            `}
                                            />

                                            <div className="h-6 flex items-center justify-center">
                                                {spellingStatus === 'incorrect' && (
                                                    <p className="text-red-500 text-center animate-shake font-medium">
                                                        拼写错误，请重试
                                                    </p>
                                                )}
                                                {spellingStatus === 'correct' && (
                                                    <p className="text-green-500 text-center animate-bounce font-medium">
                                                        ✅ 正确！
                                                    </p>
                                                )}
                                            </div>

                                            <div className="flex justify-center gap-6">
                                                <AudioButton
                                                    word={currentWord.word}
                                                    className="!bg-secondary-100 hover:!bg-secondary-200 text-secondary-700 dark:!bg-secondary-900/30 dark:text-secondary-400"
                                                />
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setShowSpellingHint(!showSpellingHint)
                                                    }}
                                                    className="text-slate-400 hover:text-primary-500 text-sm underline decoration-dotted underline-offset-4"
                                                >
                                                    {showSpellingHint ? currentWord.word[0] + '...' : '提示?'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            {/* Back */}
                            <div className="flip-card-back absolute inset-0 glass-card flex flex-col overflow-hidden backface-hidden" style={{ transform: 'rotateY(180deg)' }}>
                                {/* Fixed Header */}
                                <div className="flex-none bg-white/95 dark:bg-slate-800/95 backdrop-blur-md py-4 px-8 z-10 border-b border-slate-100 dark:border-slate-700/50 shadow-sm dark:shadow-slate-900/20">
                                    <h3 className="text-4xl font-bold text-slate-800 dark:text-white text-center">
                                        {currentWord.word}
                                    </h3>
                                </div>

                                {/* Scrollable Content */}
                                <div className="flex-1 overflow-y-auto px-8 py-6 pb-20 custom-scrollbar">
                                    <div className="max-w-4xl mx-auto space-y-8 pb-6">
                                        {/* Meaning Section */}
                                        <div className="text-xl text-slate-700 dark:text-slate-300 text-left leading-relaxed font-medium">
                                            {currentWord.meaning.split('\n').map((line, i) => {
                                                const trimmed = line.trim()
                                                if (!trimmed) return null
                                                return (
                                                    <div key={i} className="mb-2 pl-4 border-l-4 border-primary-200 dark:border-primary-800">
                                                        {trimmed}
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        {/* Examples Section */}
                                        {currentWord.example && (
                                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-6 text-left border border-slate-100 dark:border-slate-700/50">
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                                    例句 Example
                                                </p>
                                                <div className="space-y-4">
                                                    {splitExamples(currentWord.example).map((ex, i) => (
                                                        <div key={i} className="flex items-start gap-3 p-3 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50 hover:border-primary-200 dark:hover:border-primary-800 transition-colors">
                                                            <AudioButton
                                                                text={extractEnglish(ex)}
                                                                useTTS={true}
                                                                isExample={true}
                                                                size={18}
                                                                className="mt-0.5 flex-shrink-0 bg-emerald-50/50 hover:bg-emerald-100 dark:bg-emerald-900/10"
                                                            />
                                                            <div className="flex-1">
                                                                <p className="text-base text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                                                                    {ex}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Rating Buttons - Fixed Height Area */}
                <div className="flex-none h-16 flex items-center justify-center relative z-20">
                    {isFlipped ? (
                        <div className="flex justify-center gap-3 w-full max-w-4xl animate-slide-up">
                            <button
                                onClick={() => handleRating(1)}
                                className="flex-1 h-12 rounded-xl bg-red-100 hover:bg-red-200 
                        dark:bg-red-900/30 dark:hover:bg-red-900/50
                        text-red-700 dark:text-red-400 font-medium text-lg transition-all transform hover:scale-105"
                            >
                                1 完全忘记
                            </button>
                            <button
                                onClick={() => handleRating(2)}
                                className="flex-1 h-12 rounded-xl bg-orange-100 hover:bg-orange-200 
                        dark:bg-orange-900/30 dark:hover:bg-orange-900/50
                        text-orange-700 dark:text-orange-400 font-medium text-lg transition-all transform hover:scale-105"
                            >
                                2 困难
                            </button>
                            <button
                                onClick={() => handleRating(3)}
                                className="flex-1 h-12 rounded-xl bg-yellow-100 hover:bg-yellow-200 
                        dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50
                        text-yellow-700 dark:text-yellow-400 font-medium text-lg transition-all transform hover:scale-105"
                            >
                                3 一般
                            </button>
                            <button
                                onClick={() => handleRating(4)}
                                className="flex-1 h-12 rounded-xl bg-blue-100 hover:bg-blue-200 
                        dark:bg-blue-900/30 dark:hover:bg-blue-900/50
                        text-blue-700 dark:text-blue-400 font-medium text-lg transition-all transform hover:scale-105"
                            >
                                4 简单
                            </button>
                            <button
                                onClick={() => handleRating(5)}
                                className="flex-1 h-12 rounded-xl bg-green-100 hover:bg-green-200 
                        dark:bg-green-900/30 dark:hover:bg-green-900/50
                        text-green-700 dark:text-green-400 font-medium text-lg transition-all transform hover:scale-105"
                            >
                                5 完美
                            </button>
                        </div>
                    ) : (
                        <div className="text-slate-400 text-sm animate-pulse">
                            {reviewMode === 'flashcard' ? '按 空格键翻转卡片' : '输入拼写并回车检查'}
                        </div>
                    )}
                </div>
            </div>
        </div >
    )
}
