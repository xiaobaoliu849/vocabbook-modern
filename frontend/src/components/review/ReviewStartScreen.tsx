import { useTranslation } from 'react-i18next'
import type { ReviewMode } from './types'

interface ReviewStartScreenProps {
    dueCount: number
    onStart: (mode: ReviewMode) => void
    onStartPractice: (mode: ReviewMode) => void
}

export default function ReviewStartScreen({ dueCount, onStart, onStartPractice }: ReviewStartScreenProps) {
    const { t } = useTranslation()
    const modes: { id: ReviewMode; icon: string; title: string; desc: string; color: string }[] = [
        {
            id: 'flashcard',
            icon: '🎴',
            title: t('review.start.modes.flashcard.title'),
            desc: t('review.start.modes.flashcard.desc'),
            color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
        },
        {
            id: 'spelling',
            icon: '⌨️',
            title: t('review.start.modes.spelling.title'),
            desc: t('review.start.modes.spelling.desc'),
            color: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'
        },
        {
            id: 'choice',
            icon: '📝',
            title: t('review.start.modes.choice.title'),
            desc: t('review.start.modes.choice.desc'),
            color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
        },
        {
            id: 'dictation',
            icon: '🎧',
            title: t('review.start.modes.dictation.title'),
            desc: t('review.start.modes.dictation.desc'),
            color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
        }
    ]

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in p-6">
            <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">
                    {t('review.start.title')}
                </h1>
                <p className="text-slate-500 text-lg">
                    {t('review.start.todayDue', { count: dueCount })}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl mb-10">
                {modes.map(mode => (
                    <button
                        key={mode.id}
                        onClick={() => onStart(mode.id)}
                        className="flex items-center p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 hover:shadow-lg hover:scale-[1.02] transition-all text-left group"
                    >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mr-4 ${mode.color}`}>
                            {mode.icon}
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary-600 transition-colors">
                                {mode.title}
                            </h3>
                            <p className="text-sm text-slate-400 dark:text-slate-500">
                                {mode.desc}
                            </p>
                        </div>
                    </button>
                ))}
            </div>

            <div className="flex gap-4">
                <button
                    onClick={() => onStartPractice('flashcard')}
                    className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                    {t('review.start.freePractice')}
                </button>
            </div>
        </div>
    )
}
