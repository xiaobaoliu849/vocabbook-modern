import { useState, useEffect, useCallback } from 'react'
import AudioButton from '../AudioButton'
import type { ReviewModeProps } from './types'

/**
 * 听写模式 - 只播放发音，用户输入单词拼写
 */
export default function DictationMode({ word, onComplete, playAudio }: ReviewModeProps) {
    const [input, setInput] = useState('')
    const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle')
    const [showAnswer, setShowAnswer] = useState(false)
    const [attempts, setAttempts] = useState(0)

    // Reset state when word changes
    useEffect(() => {
        setInput('')
        setStatus('idle')
        setShowAnswer(false)
        setAttempts(0)
    }, [word.id])

    // Auto-play audio when component mounts or word changes
    useEffect(() => {
        const timer = setTimeout(() => {
            playAudio()
        }, 500)
        return () => clearTimeout(timer)
    }, [word.id, playAudio])

    const checkAnswer = useCallback(() => {
        if (!input.trim()) return

        const userInput = input.trim().toLowerCase()
        const correctWord = word.word.toLowerCase()

        if (userInput === correctWord) {
            setStatus('correct')
            // Rating based on attempts: first try = 5, second = 4, third+ = 3
            const rating = attempts === 0 ? 5 : attempts === 1 ? 4 : 3
            setTimeout(() => {
                onComplete(rating)
            }, 1200)
        } else {
            setStatus('incorrect')
            setAttempts(prev => prev + 1)

            // After 3 wrong attempts, show answer
            if (attempts >= 2) {
                setShowAnswer(true)
                setTimeout(() => {
                    onComplete(1) // Rating 1 for giving up
                }, 2500)
            }
        }
    }, [input, word.word, attempts, onComplete])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            checkAnswer()
        }
    }

    const handleGiveUp = () => {
        setShowAnswer(true)
        setTimeout(() => {
            onComplete(1)
        }, 2000)
    }

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8">
            {/* Audio Section */}
            <div className="text-center mb-8">
                <div className="mb-4">
                    <span className="text-6xl">🎧</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 mb-4">
                    听发音，输入单词
                </p>
                <AudioButton
                    word={word.word}
                    className="!w-20 !h-20 !text-3xl !bg-primary-100 hover:!bg-primary-200 text-primary-700 dark:!bg-primary-900/30 dark:text-primary-400 border-none"
                    size={36}
                />
                <p className="text-sm text-slate-400 mt-2">点击播放 / 按 P 键</p>
            </div>

            {/* Input Section */}
            <div className="w-full max-w-md">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value)
                        if (status !== 'idle') setStatus('idle')
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="输入你听到的单词..."
                    autoFocus
                    disabled={showAnswer}
                    className={`
            w-full px-6 py-4 text-2xl text-center rounded-2xl border-2 outline-none transition-all
            ${status === 'correct'
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                            : status === 'incorrect'
                                ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary-500'
                        }
            ${showAnswer ? 'opacity-50' : ''}
          `}
                />

                {/* Feedback */}
                <div className="h-16 flex items-center justify-center mt-4">
                    {status === 'correct' && (
                        <div className="text-green-500 text-xl font-bold animate-bounce">
                            ✅ 正确！
                        </div>
                    )}
                    {status === 'incorrect' && !showAnswer && (
                        <div className="text-red-500 animate-shake">
                            ❌ 拼写错误，再试一次 ({3 - attempts - 1} 次机会)
                        </div>
                    )}
                    {showAnswer && (
                        <div className="text-center">
                            <p className="text-slate-500 mb-1">正确答案：</p>
                            <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                                {word.word}
                            </p>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex justify-center gap-4 mt-4">
                    {!showAnswer && status !== 'correct' && (
                        <button
                            onClick={handleGiveUp}
                            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline decoration-dotted underline-offset-4"
                        >
                            显示答案
                        </button>
                    )}
                </div>
            </div>

            {/* Phonetic hint after first wrong attempt */}
            {attempts >= 1 && !showAnswer && word.phonetic && (
                <div className="mt-6 text-slate-400">
                    <span className="text-sm">提示音标：</span>
                    <span className="font-mono text-lg ml-2">{word.phonetic}</span>
                </div>
            )}
        </div>
    )
}
