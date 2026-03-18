import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import AudioButton from '../AudioButton'
import { useShortcuts } from '../../context/ShortcutContext'
import type { ReviewModeProps } from './types'

/**
 * 选择题模式 - 显示单词，从4个选项中选择正确释义
 */
export default function ChoiceMode({ word, allWords, onComplete }: ReviewModeProps) {
    const { t } = useTranslation()
    const { findMatching } = useShortcuts()
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const [showResult, setShowResult] = useState(false)

    // Generate 4 options: 1 correct + 3 distractors
    const options = useMemo(() => {
        const correctMeaning = word.meaning.split('\n')[0].trim() // Use first line of meaning

        // Get distractors from other words
        const otherWords = allWords.filter(w => w.id !== word.id && w.meaning)
        const rotation = otherWords.length > 0 ? word.id % otherWords.length : 0
        const rotatedWords = otherWords.slice(rotation).concat(otherWords.slice(0, rotation))
        const distractors = rotatedWords.slice(0, 3).map(w => w.meaning.split('\n')[0].trim())

        // If not enough distractors, add placeholders
        while (distractors.length < 3) {
            distractors.push(t('review.choice.placeholderMeaning', { index: distractors.length + 1 }))
        }

        const allOptions = distractors.map(d => ({ text: d, isCorrect: false }))
        allOptions.splice(word.id % 4, 0, { text: correctMeaning, isCorrect: true })

        return allOptions
    }, [word, allWords, t])

    const handleSelect = useCallback((index: number) => {
        if (showResult) return

        setSelectedIndex(index)
        setShowResult(true)

        const isCorrect = options[index].isCorrect

        setTimeout(() => {
            onComplete(isCorrect ? 4 : 1)
        }, 1500)
    }, [onComplete, options, showResult])

    // Reset state when word changes
    useEffect(() => {
        setSelectedIndex(null)
        setShowResult(false)
    }, [word.id])

    // Keyboard shortcuts for selecting options (1-4)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (showResult) return

            const matchedChoice = findMatching(e, ['review.choice1', 'review.choice2', 'review.choice3', 'review.choice4'])
            if (matchedChoice) {
                e.preventDefault()
                const indexMap: Record<string, number> = {
                    'review.choice1': 0,
                    'review.choice2': 1,
                    'review.choice3': 2,
                    'review.choice4': 3,
                }
                const index = indexMap[matchedChoice]
                handleSelect(index)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [findMatching, handleSelect, showResult])

    return (
        <div className="w-full h-full min-h-0 flex flex-col p-6 md:p-8">
            {/* Word Display */}
            <div className="flex-none text-center pb-6">
                <h3 className="text-4xl font-bold text-slate-800 dark:text-white mb-3 md:text-5xl">
                    {word.word}
                </h3>
                {word.phonetic && (
                    <p className="text-xl text-slate-500 mb-4 font-mono md:text-2xl">{word.phonetic}</p>
                )}
                <AudioButton
                    word={word.word}
                    className="!w-14 !h-14 !text-xl !bg-secondary-100 hover:!bg-secondary-200 text-secondary-700 dark:!bg-secondary-900/30 dark:text-secondary-400 border-none"
                    size={24}
                />
            </div>

            {/* Options Grid */}
            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
                <div className="mx-auto grid w-full max-w-2xl grid-cols-2 content-start gap-4">
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
                                    flex min-h-[132px] items-start rounded-xl border-2 p-4 text-left transition-all
                                    ${bgClass}
                                    ${!showResult ? 'cursor-pointer transform hover:scale-[1.02]' : 'cursor-default'}
                                `}
                            >
                                <span className="text-xs font-bold text-slate-400 mr-2 pt-0.5">{index + 1}</span>
                                <span className="text-base leading-relaxed">{option.text}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Result Feedback */}
            {showResult && (
                <div className={`flex-none pt-4 text-center text-xl font-bold animate-bounce ${options[selectedIndex!]?.isCorrect
                    ? 'text-green-500'
                    : 'text-red-500'
                    }`}>
                    {options[selectedIndex!]?.isCorrect ? t('review.choice.correct') : t('review.choice.incorrect')}
                </div>
            )}

            {/* Hint */}

        </div>
    )
}
