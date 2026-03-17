import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import AudioButton from '../components/AudioButton'
import { BookOpen, CheckCircle, Flame, Keyboard, Target, Volume2, type LucideIcon } from 'lucide-react'
import { splitExamples, extractEnglish } from '../utils/textUtils'
import { ChoiceMode, DictationMode, SessionSummary } from '../components/review'
import type { ReviewMode, WordRating, SessionSummaryData } from '../components/review'
import { api, API_PATHS } from '../utils/api'
import { useGlobalState } from '../context/GlobalStateContext'

interface ReviewWord {
    id: number
    word: string
    phonetic: string
    meaning: string
    example: string
    easiness: number
    interval: number
}

interface ReviewSubmitResponse {
    message: string
    word: string
    quality: number
    next_review: string
    interval_days: number
    next_review_in_hours: number
    easiness: number
    error_count_incremented: boolean
    remaining_due_count?: number
}

export default function Review({ isActive }: { isActive?: boolean }) {
    const { t } = useTranslation()
    // Mode state
    const [reviewMode, setReviewMode] = useState<ReviewMode>('flashcard')

    // Standard review state
    const [dueWords, setDueWords] = useState<ReviewWord[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isFlipped, setIsFlipped] = useState(false)
    const [loading, setLoading] = useState(true)
    const [sessionStats, setSessionStats] = useState({ reviewed: 0, startTime: Date.now() })
    const [practiceMode, setPracticeMode] = useState(false)
    const [difficultMode, setDifficultMode] = useState(false)

    // Spelling mode state
    // Session ratings tracking
    const [sessionRatings, setSessionRatings] = useState<WordRating[]>([])

    const [spellingInput, setSpellingInput] = useState('')
    const [spellingStatus, setSpellingStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle')
    const [showSpellingHint, setShowSpellingHint] = useState(false)
    const spellingScrollRef = useRef<HTMLDivElement>(null)
    const answerScrollRef = useRef<HTMLDivElement>(null)
    const currentLoadModeRef = useRef<'normal' | 'practice' | 'difficult'>('normal')
    const wasActiveRef = useRef(false)

    const { refreshDueCount } = useGlobalState()

    const resetInteractionState = useCallback(() => {
        setIsFlipped(false)
        setSpellingInput('')
        setSpellingStatus('idle')
        setShowSpellingHint(false)
    }, [])

    useEffect(() => {
        const nowActive = Boolean(isActive)
        const becameActive = nowActive && !wasActiveRef.current
        wasActiveRef.current = nowActive

        if (becameActive) {
            void fetchDueWords(currentLoadModeRef.current)
        }
    }, [isActive])

    const fetchDueWords = async (mode: 'normal' | 'practice' | 'difficult' = 'normal') => {
        currentLoadModeRef.current = mode
        setLoading(true)
        setPracticeMode(mode === 'practice')
        setDifficultMode(mode === 'difficult')

        try {
            let path = `${API_PATHS.REVIEW_DUE}?limit=50`
            if (mode === 'practice') {
                path = `${API_PATHS.WORDS}?limit=50`
            } else if (mode === 'difficult') {
                path = `${API_PATHS.REVIEW_DIFFICULT}?limit=50`
            }

            const data = await api.get(path)
            const words = data.words || []
            if (mode === 'practice' && words.length > 0) {
                words.sort(() => Math.random() - 0.5)
            }
            setDueWords(words)
            setCurrentIndex(0)
            resetInteractionState()
            setSessionStats({ reviewed: 0, startTime: Date.now() })
            setSessionRatings([])
        } catch (error) {
            console.error('Failed to fetch words:', error)
        } finally {
            setLoading(false)
        }
    }

    const switchReviewMode = useCallback((mode: ReviewMode) => {
        setReviewMode(mode)
        resetInteractionState()
    }, [resetInteractionState])

    const currentWord = dueWords[currentIndex]
    const reviewModes: {
        key: ReviewMode
        icon: LucideIcon
        label: string
        accent: string
        iconAccent: string
    }[] = [
        {
            key: 'flashcard',
            icon: BookOpen,
            label: t('review.mode.flashcard'),
            accent: 'text-primary-700 dark:text-primary-300',
            iconAccent: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
        },
        {
            key: 'spelling',
            icon: Keyboard,
            label: t('review.mode.spelling'),
            accent: 'text-amber-700 dark:text-amber-300',
            iconAccent: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        },
        {
            key: 'choice',
            icon: CheckCircle,
            label: t('review.mode.choice'),
            accent: 'text-emerald-700 dark:text-emerald-300',
            iconAccent: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
        },
        {
            key: 'dictation',
            icon: Volume2,
            label: t('review.mode.dictation'),
            accent: 'text-sky-700 dark:text-sky-300',
            iconAccent: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
        },
    ]

    const handleRating = async (quality: number) => {
        if (!currentWord) return

        try {
            const nextReviewedCount = sessionStats.reviewed + 1

            setSessionRatings(prev => [...prev, {
                word: currentWord,
                quality,
                timestamp: Date.now()
            }])

            const result = await api.post<ReviewSubmitResponse>(API_PATHS.REVIEW_SUBMIT, {
                word: currentWord.word,
                quality,
                time_spent: 0
            })

            setSessionStats(prev => ({ ...prev, reviewed: nextReviewedCount }))

            setCurrentIndex(prev => prev + 1)
            setIsFlipped(false)

            setSpellingInput('')
            setSpellingStatus('idle')
            setShowSpellingHint(false)

            if (currentIndex >= dueWords.length - 1) {
                logSession(nextReviewedCount)
            }

            // Refresh global due count
            void refreshDueCount(result.remaining_due_count)
        } catch (error) {
            console.error('Failed to submit review:', error)
        }
    }

    const logSession = async (reviewCount: number = sessionStats.reviewed) => {
        const duration = Math.floor((Date.now() - sessionStats.startTime) / 1000)
        try {
            await api.post(API_PATHS.REVIEW_SESSION, {
                duration,
                review_count: reviewCount
            })
        } catch (error) {
            console.error('Failed to log session:', error)
        }
    }

    const playAudio = useCallback(() => {
        if (currentWord) {
            const accent = (localStorage.getItem('preferred_accent') || 'us') === 'uk' ? '1' : '2'
            const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${currentWord.word}&type=${accent}`)
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
            if ((reviewMode === 'flashcard' || reviewMode === 'spelling') && isFlipped && ['1', '2', '3', '4', '5'].includes(e.key)) {
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
                switchReviewMode(modes[nextIdx])
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
    }, [currentWord, handleRating, isFlipped, playAudio, reviewMode, switchReviewMode])

    const topShortcutText = reviewMode === 'flashcard'
        ? t('review.shortcuts.rate')
        : reviewMode === 'spelling'
            ? t('review.shortcuts.rate')
            : reviewMode === 'choice'
                ? t('review.shortcuts.chooseOption')
                : t('review.shortcuts.listenAndType')

    const bottomHintText = reviewMode === 'flashcard'
        ? t('review.shortcuts.flipCard')
        : reviewMode === 'spelling'
            ? t('review.shortcuts.typeAndCheck')
            : reviewMode === 'choice'
                ? t('review.shortcuts.chooseOption')
                : t('review.shortcuts.listenAndType')
    const showBottomDock = reviewMode === 'flashcard' || reviewMode === 'spelling'

    const handleReviewWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
        const activeScroller = reviewMode === 'spelling' && !isFlipped
            ? spellingScrollRef.current
            : isFlipped
                ? answerScrollRef.current
                : null

        if (!activeScroller) return
        if (activeScroller.scrollHeight <= activeScroller.clientHeight + 1) return

        event.preventDefault()
        activeScroller.scrollBy({
            top: event.deltaY,
            left: event.deltaX,
            behavior: 'auto',
        })
    }, [isFlipped, reviewMode])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-xl text-slate-500 animate-pulse">{t('review.loading')}</div>
            </div>
        )
    }

    if (dueWords.length === 0) {
        return (
            <div className="animate-fade-in text-center py-16">
                <span className="text-6xl">{difficultMode ? '💪' : practiceMode ? '📚' : '🎉'}</span>
                <h2 className="text-2xl font-bold mt-4 text-slate-800 dark:text-white">
                    {difficultMode ? t('review.empty.difficultTitle') : practiceMode ? t('review.empty.practiceTitle') : t('review.empty.normalTitle')}
                </h2>
                <p className="text-slate-500 mt-2">
                    {difficultMode ? t('review.empty.difficultDesc') : practiceMode ? t('review.empty.practiceDesc') : t('review.empty.normalDesc')}
                </p>
                <div className="flex justify-center gap-4 mt-6">
                    <button
                        onClick={() => fetchDueWords('normal')}
                        className="btn-secondary"
                    >
                        {t('review.empty.refresh')}
                    </button>
                    <button
                        onClick={() => fetchDueWords('practice')}
                        className="btn-primary"
                    >
                        🎯 {t('review.empty.practiceMode')}
                    </button>
                    <button
                        onClick={() => fetchDueWords('difficult')}
                        className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 rounded-lg transition-colors flex items-center gap-2 font-medium"
                    >
                        🔥 {t('review.empty.difficultMode')}
                    </button>
                </div>
                <p className="text-xs text-slate-400 mt-4">
                    {t('review.empty.modeHint')}
                </p>
            </div>
        )
    }

    // Session complete - show summary
    if (currentIndex >= dueWords.length && sessionRatings.length > 0) {
        const duration = Math.floor((Date.now() - sessionStats.startTime) / 1000)
        const summaryData: SessionSummaryData = {
            ratings: sessionRatings,
            duration,
            mode: difficultMode ? 'difficult' : practiceMode ? 'practice' : 'normal',
            reviewMode
        }

        const handleRestart = () => {
            setCurrentIndex(0)
            setSessionStats({ reviewed: 0, startTime: Date.now() })
            setSessionRatings([])
            fetchDueWords(difficultMode ? 'difficult' : practiceMode ? 'practice' : 'normal')
        }

        const handleBackToNormal = () => {
            setCurrentIndex(0)
            setSessionStats({ reviewed: 0, startTime: Date.now() })
            setSessionRatings([])
            fetchDueWords('normal')
        }

        const handleReviewWeak = (words: ReviewWord[]) => {
            setDueWords(words)
            setCurrentIndex(0)
            setSessionStats({ reviewed: 0, startTime: Date.now() })
            setSessionRatings([])
            setIsFlipped(false)
            setPracticeMode(true)
            setDifficultMode(false)
        }

        return (
            <SessionSummary
                data={summaryData}
                onRestart={handleRestart}
                onBackToNormal={handleBackToNormal}
                onReviewWeak={handleReviewWeak}
            />
        )
    }

    return (
        <div className="h-[calc(100vh-4rem)] overflow-hidden flex flex-col animate-fade-in" onWheelCapture={handleReviewWheel}>
            {/* Header */}
            <div className="flex-none mb-1">
                <div className="mb-4 flex items-start justify-between gap-6">
                    <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                                {t('review.title')}
                            </h2>
                            {practiceMode && (
                                <button
                                    onClick={() => fetchDueWords('normal')}
                                    className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:border-amber-300 hover:bg-amber-100 dark:border-amber-800/70 dark:bg-amber-900/25 dark:text-amber-300 dark:hover:bg-amber-900/40"
                                    title={t('review.exitPracticeMode')}
                                >
                                    <Target size={12} />
                                    {t('review.empty.practiceMode')}
                                    <span className="text-amber-500/80">×</span>
                                </button>
                            )}
                            {difficultMode && (
                                <button
                                    onClick={() => fetchDueWords('normal')}
                                    className="inline-flex items-center gap-2 rounded-full border border-rose-200/80 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 transition-colors hover:border-rose-300 hover:bg-rose-100 dark:border-rose-800/70 dark:bg-rose-900/25 dark:text-rose-300 dark:hover:bg-rose-900/40"
                                    title={t('review.exitDifficultMode')}
                                >
                                    <Flame size={12} />
                                    {t('review.empty.difficultMode')}
                                    <span className="text-rose-500/80">×</span>
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                            <span>{t('review.progress', { current: currentIndex + 1, total: dueWords.length, reviewed: sessionStats.reviewed })}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                            <span className="text-slate-400 dark:text-slate-500">{reviewModes.find(mode => mode.key === reviewMode)?.label}</span>
                        </div>
                        <div className="inline-flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/75 p-1.5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-900/65 dark:shadow-[0_16px_36px_rgba(0,0,0,0.24)]">
                            {reviewModes.map(mode => {
                                const Icon = mode.icon
                                const isActiveMode = reviewMode === mode.key
                                return (
                                    <button
                                        key={mode.key}
                                        onClick={() => switchReviewMode(mode.key)}
                                        className={`group inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all ${isActiveMode
                                            ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-white dark:ring-slate-700/80'
                                            : 'text-slate-500 hover:bg-white/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-200'
                                            }`}
                                    >
                                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${isActiveMode ? mode.iconAccent : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                            <Icon size={15} className={isActiveMode ? mode.accent : ''} />
                                        </span>
                                        <span>{mode.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                    <div className="hidden shrink-0 md:flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/78 px-4 py-3 text-left shadow-[0_14px_34px_rgba(15,23,42,0.05)] backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-900/60 dark:shadow-[0_16px_34px_rgba(0,0,0,0.22)]">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                            <Keyboard size={16} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                                {t('review.labels.controls', 'Controls')}
                            </p>
                            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                {topShortcutText}
                            </p>
                        </div>
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

            {/* Review Workspace */}
            <div className={`flex-1 min-h-0 flex flex-col ${showBottomDock ? 'gap-4 mb-8' : 'gap-2 mb-2'}`}>
                <div className="flex-1 min-h-0 w-full perspective-container">
                    {/* Choice Mode - 选择题 */}
                    {reviewMode === 'choice' && (
                        <div className="w-full h-full min-h-0 glass-card">
                        <ChoiceMode
                            key={`choice-${currentWord.id}`}
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
                        <div className="w-full h-full min-h-0 glass-card">
                        <DictationMode
                            key={`dictation-${currentWord.id}`}
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
                            key={`flip-${reviewMode}-${currentWord.id}`}
                            className="w-full h-full min-h-0 glass-card overflow-hidden"
                        >
                        <div
                            className={`w-full h-full min-h-0 cursor-pointer flip-card ${isFlipped ? 'flipped' : ''}`}
                            onClick={(event) => {
                                const target = event.target as HTMLElement | null
                                if (target?.closest('input, textarea, button, [data-review-scroll="true"]')) return
                                if (window.getSelection()?.toString()) return;
                                setIsFlipped(!isFlipped);
                            }}
                        >
                            <div className="flip-card-inner relative w-full h-full">
                                {/* Front */}
                                <div className={`flip-card-front absolute inset-0 bg-white dark:bg-slate-800 p-6 flex flex-col items-center justify-center backface-hidden ${isFlipped ? 'pointer-events-none' : 'pointer-events-auto'}`}>
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
                                        </>
                                    ) : reviewMode === 'spelling' ? (
                                        // Spelling Mode Front
                                        <div className="w-full h-full flex flex-col relative overflow-hidden">
                                            {/* Meaning Display Area - Grows */}
                                            <div ref={spellingScrollRef} data-review-scroll="true" className="flex-1 overflow-y-auto w-full px-8 py-6 custom-scrollbar flex flex-col justify-start">
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
                                                    placeholder={t('review.spelling.placeholder')}
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
                                                            {t('review.spelling.incorrect')}
                                                        </p>
                                                    )}
                                                    {spellingStatus === 'correct' && (
                                                        <p className="text-green-500 text-center animate-bounce font-medium">
                                                            {t('review.spelling.correct')}
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
                                                        {showSpellingHint ? currentWord.word[0] + '...' : t('review.spelling.hint')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>

                                {/* Back */}
                                <div className={`flip-card-back absolute inset-0 bg-white dark:bg-slate-800 flex flex-col overflow-hidden backface-hidden ${isFlipped ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                                    {/* Fixed Header */}
                                    <div className="flex-none bg-white dark:bg-slate-800 py-4 px-8 z-10 border-b border-slate-100 dark:border-slate-700/50 shadow-sm dark:shadow-slate-900/20">
                                        <h3 className="text-4xl font-bold text-slate-800 dark:text-white text-center">
                                            {currentWord.word}
                                        </h3>
                                    </div>

                                    {/* Scrollable Content */}
                                    <div ref={answerScrollRef} data-review-scroll="true" className="flex-1 overflow-y-auto px-8 py-6 pb-20 custom-scrollbar">
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
                                                        {t('review.examples')}
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
                        </div>
                    )}
                </div>

                {/* Rating Buttons - Fixed Height Area */}
                {showBottomDock && (
                    <div className="flex-none h-16 flex items-center justify-center relative z-20">
                        {isFlipped ? (
                            <div className="flex justify-center gap-3 w-full max-w-4xl animate-slide-up">
                                <button
                                    onClick={() => handleRating(1)}
                                    className="flex-1 h-12 rounded-xl bg-red-100 hover:bg-red-200 
                            dark:bg-red-900/30 dark:hover:bg-red-900/50
                            text-red-700 dark:text-red-400 font-medium text-lg transition-all transform hover:scale-105"
                                >
                                    {t('review.rating.1')}
                                </button>
                                <button
                                    onClick={() => handleRating(2)}
                                    className="flex-1 h-12 rounded-xl bg-orange-100 hover:bg-orange-200 
                            dark:bg-orange-900/30 dark:hover:bg-orange-900/50
                            text-orange-700 dark:text-orange-400 font-medium text-lg transition-all transform hover:scale-105"
                                >
                                    {t('review.rating.2')}
                                </button>
                                <button
                                    onClick={() => handleRating(3)}
                                    className="flex-1 h-12 rounded-xl bg-yellow-100 hover:bg-yellow-200 
                            dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50
                            text-yellow-700 dark:text-yellow-400 font-medium text-lg transition-all transform hover:scale-105"
                                >
                                    {t('review.rating.3')}
                                </button>
                                <button
                                    onClick={() => handleRating(4)}
                                    className="flex-1 h-12 rounded-xl bg-blue-100 hover:bg-blue-200 
                            dark:bg-blue-900/30 dark:hover:bg-blue-900/50
                            text-blue-700 dark:text-blue-400 font-medium text-lg transition-all transform hover:scale-105"
                                >
                                    {t('review.rating.4')}
                                </button>
                                <button
                                    onClick={() => handleRating(5)}
                                    className="flex-1 h-12 rounded-xl bg-green-100 hover:bg-green-200 
                            dark:bg-green-900/30 dark:hover:bg-green-900/50
                            text-green-700 dark:text-green-400 font-medium text-lg transition-all transform hover:scale-105"
                                >
                                    {t('review.rating.5')}
                                </button>
                            </div>
                        ) : (
                            <div className="text-slate-400 text-sm animate-pulse">
                                {bottomHintText}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div >
    )
}
