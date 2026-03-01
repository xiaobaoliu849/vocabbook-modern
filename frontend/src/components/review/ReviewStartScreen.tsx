import type { ReviewMode } from './types'

interface ReviewStartScreenProps {
    dueCount: number
    onStart: (mode: ReviewMode) => void
    onStartPractice: (mode: ReviewMode) => void
}

export default function ReviewStartScreen({ dueCount, onStart, onStartPractice }: ReviewStartScreenProps) {
    const modes: { id: ReviewMode; icon: string; title: string; desc: string; color: string }[] = [
        {
            id: 'flashcard',
            icon: '🎴',
            title: '识记模式 (Flashcard)',
            desc: '经典翻转卡片，适合快速复习',
            color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
        },
        {
            id: 'spelling',
            icon: '⌨️',
            title: '拼写模式 (Spelling)',
            desc: '看释义拼单词，强化记忆',
            color: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'
        },
        {
            id: 'choice',
            icon: '📝',
            title: '选择模式 (Choice)',
            desc: '四选一，快速回顾词义',
            color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
        },
        {
            id: 'dictation',
            icon: '🎧',
            title: '听写模式 (Dictation)',
            desc: '听发音写单词，训练听力',
            color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
        }
    ]

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in p-6">
            <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">
                    准备好复习了吗？
                </h1>
                <p className="text-slate-500 text-lg">
                    今日待复习 <span className="text-primary-600 font-bold text-2xl">{dueCount}</span> 个单词
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
                    🎯 自由练习模式
                </button>
            </div>
        </div>
    )
}
