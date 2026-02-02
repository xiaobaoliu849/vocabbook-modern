import { useState, useEffect, useMemo } from 'react'
import AudioButton from '../AudioButton'
import type { ReviewModeProps } from './types'

/**
 * 选择题模式 - 显示单词，从4个选项中选择正确释义
 */
export default function ChoiceMode({ word, allWords, onComplete }: ReviewModeProps) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const [showResult, setShowResult] = useState(false)

    // Generate 4 options: 1 correct + 3 distractors
    const options = useMemo(() => {
        const correctMeaning = word.meaning.split('\n')[0].trim() // Use first line of meaning

        // Get distractors from other words
        const otherWords = allWords.filter(w => w.id !== word.id && w.meaning)
        const shuffled = [...otherWords].sort(() => Math.random() - 0.5)
        const distractors = shuffled.slice(0, 3).map(w => w.meaning.split('\n')[0].trim())

        // If not enough distractors, add placeholders
        while (distractors.length < 3) {
            distractors.push(`释义 ${distractors.length + 1}`)
        }

        // Combine and shuffle
        const allOptions = [
            { text: correctMeaning, isCorrect: true },
            ...distractors.map(d => ({ text: d, isCorrect: false }))
        ].sort(() => Math.random() - 0.5)

        return allOptions
    }, [word, allWords])

    // Reset state when word changes
    useEffect(() => {
        setSelectedIndex(null)
        setShowResult(false)
    }, [word.id])

    // Keyboard shortcuts for selecting options (1-4)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (showResult) return

            const key = e.key
            if (['1', '2', '3', '4'].includes(key)) {
                e.preventDefault()
                const index = parseInt(key) - 1
                handleSelect(index)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [showResult, options])

    const handleSelect = (index: number) => {
        if (showResult) return

        setSelectedIndex(index)
        setShowResult(true)

        const isCorrect = options[index].isCorrect

        // Auto-advance after showing result
        setTimeout(() => {
            onComplete(isCorrect ? 4 : 1) // 4 for correct, 1 for wrong
        }, 1500)
    }

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8">
            {/* Word Display */}
            <div className="text-center mb-8">
                <h3 className="text-5xl font-bold text-slate-800 dark:text-white mb-4">
                    {word.word}
                </h3>
                {word.phonetic && (
                    <p className="text-2xl text-slate-500 mb-4 font-mono">{word.phonetic}</p>
                )}
                <AudioButton
                    word={word.word}
                    className="!w-14 !h-14 !text-xl !bg-secondary-100 hover:!bg-secondary-200 text-secondary-700 dark:!bg-secondary-900/30 dark:text-secondary-400 border-none"
                    size={24}
                />
            </div>

            {/* Options Grid */}
            <div className="grid grid-cols-2 gap-4 w-full max-w-2xl">
                {options.map((option, index) => {
                    let bgClass = 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'

                    if (showResult) {
                        if (option.isCorrect) {
                            bgClass = 'bg-green-100 dark:bg-green-900/40 border-green-500 text-green-800 dark:text-green-300'
                        } else if (index === selectedIndex) {
                            bgClass = 'bg-red-100 dark:bg-red-900/40 border-red-500 text-red-800 dark:text-red-300'
                        } else {
                            bgClass = 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-50'
                        }
                    }

                    return (
                        <button
                            key={index}
                            onClick={() => handleSelect(index)}
                            disabled={showResult}
                            className={`
                p-4 rounded-xl border-2 text-left transition-all
                ${bgClass}
                ${!showResult ? 'cursor-pointer transform hover:scale-[1.02]' : 'cursor-default'}
              `}
                        >
                            <span className="text-xs font-bold text-slate-400 mr-2">{index + 1}</span>
                            <span className="text-base leading-relaxed">{option.text}</span>
                        </button>
                    )
                })}
            </div>

            {/* Result Feedback */}
            {showResult && (
                <div className={`mt-6 text-xl font-bold animate-bounce ${options[selectedIndex!]?.isCorrect
                    ? 'text-green-500'
                    : 'text-red-500'
                    }`}>
                    {options[selectedIndex!]?.isCorrect ? '✅ 正确！' : '❌ 错误'}
                </div>
            )}

            {/* Hint */}
            {!showResult && (
                <p className="mt-8 text-slate-400 text-sm">按 1-4 或点击选择正确释义</p>
            )}
        </div>
    )
}
