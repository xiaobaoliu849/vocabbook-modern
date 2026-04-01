import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import AudioButton from '../AudioButton'
import type { SessionSummaryData, WordRating } from './types'

interface SessionSummaryProps {
    data: SessionSummaryData
    onRestart: () => void
    onBackToNormal: () => void
    onReviewWeak: (words: SessionSummaryData['ratings'][0]['word'][]) => void
}

const RATING_STYLES = [
    { quality: 1, color: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400', bgLight: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800' },
    { quality: 2, color: 'bg-orange-500', textColor: 'text-orange-600 dark:text-orange-400', bgLight: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800' },
    { quality: 3, color: 'bg-yellow-500', textColor: 'text-yellow-600 dark:text-yellow-400', bgLight: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-yellow-200 dark:border-yellow-800' },
    { quality: 4, color: 'bg-blue-500', textColor: 'text-blue-600 dark:text-blue-400', bgLight: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800' },
    { quality: 5, color: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400', bgLight: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800' },
]

function getRatingStyle(quality: number) {
    return RATING_STYLES.find(r => r.quality === quality) || RATING_STYLES[2]
}

export default function SessionSummary({ data, onRestart, onBackToNormal, onReviewWeak }: SessionSummaryProps) {
    const { t } = useTranslation()
    const [showWeakWords, setShowWeakWords] = useState(false)
    const ratingLabels = useMemo<Record<number, string>>(() => ({
        1: t('review.summary.ratingLabels.1'),
        2: t('review.summary.ratingLabels.2'),
        3: t('review.summary.ratingLabels.3'),
        4: t('review.summary.ratingLabels.4'),
        5: t('review.summary.ratingLabels.5'),
    }), [t])
    const ratingConfig = useMemo(
        () => RATING_STYLES.map(cfg => ({ ...cfg, label: ratingLabels[cfg.quality] })),
        [ratingLabels]
    )

    const stats = useMemo(() => {
        const { ratings, duration } = data
        const total = ratings.length

        // 评分分布
        const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        ratings.forEach(r => {
            distribution[r.quality] = (distribution[r.quality] || 0) + 1
        })

        // 掌握情况分类
        const perfect = ratings.filter(r => r.quality >= 4)       // 4-5: 掌握良好
        const okay = ratings.filter(r => r.quality === 3)         // 3: 一般
        const weak = ratings.filter(r => r.quality <= 2)          // 1-2: 需要加强

        // 平均评分
        const avgRating = total > 0 ? ratings.reduce((sum, r) => sum + r.quality, 0) / total : 0

        // 正确率 (>=3 算正确)
        const correctRate = total > 0 ? (perfect.length + okay.length) / total * 100 : 0

        // 格式化时长
        const minutes = Math.floor(duration / 60)
        const seconds = duration % 60
        const durationStr = minutes > 0
            ? t('review.summary.duration.minutesSeconds', { minutes, seconds })
            : t('review.summary.duration.secondsOnly', { seconds })

        // 每个单词平均耗时
        const avgTime = total > 0 ? Math.round(duration / total) : 0

        return {
            total,
            distribution,
            perfect,
            okay,
            weak,
            avgRating,
            correctRate,
            durationStr,
            avgTime,
        }
    }, [data, t])

    // 最大分布数（用于柱状图比例）
    const maxDistCount = Math.max(...Object.values(stats.distribution), 1)

    // 评价等级
    const getGrade = () => {
        if (stats.correctRate >= 90) return { emoji: '🏆', desc: t('review.summary.grades.excellent') }
        if (stats.correctRate >= 75) return { emoji: '🌟', desc: t('review.summary.grades.great') }
        if (stats.correctRate >= 60) return { emoji: '💪', desc: t('review.summary.grades.good') }
        if (stats.correctRate >= 40) return { emoji: '📖', desc: t('review.summary.grades.keepGoing') }
        return { emoji: '🔥', desc: t('review.summary.grades.needsWork') }
    }

    const grade = getGrade()
    const modeLabel = data.mode === 'practice'
        ? t('review.summary.modes.practice')
        : data.mode === 'difficult'
            ? t('review.summary.modes.difficult')
            : t('review.summary.modes.normal')

    return (
        <div className="animate-fade-in max-w-3xl mx-auto py-6 space-y-6">
            {/* ===== 顶部总评 ===== */}
            <div className="glass-card p-8 text-center">
                <div className="text-6xl mb-3">{grade.emoji}</div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                    {t('review.summary.completed', { mode: modeLabel })}
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">{grade.desc}</p>

                {/* 核心指标卡片 */}
                <div className="grid grid-cols-4 gap-3 mt-6">
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                        <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.total}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{t('review.summary.metrics.reviewedWords')}</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                        <div className={`text-2xl font-bold ${stats.correctRate >= 70 ? 'text-green-600' : stats.correctRate >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {stats.correctRate.toFixed(0)}%
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{t('review.summary.metrics.accuracy')}</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                        <div className="text-2xl font-bold text-primary-600">{stats.avgRating.toFixed(1)}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{t('review.summary.metrics.averageRating')}</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                        <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.durationStr}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{t('review.summary.metrics.totalTime')}</div>
                    </div>
                </div>
            </div>

            {/* ===== 评分分布柱状图 ===== */}
            <div className="glass-card p-6">
                <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
                    {t('review.summary.distributionTitle')}
                </h3>
                <div className="space-y-2.5">
                    {ratingConfig.map(cfg => {
                        const count = stats.distribution[cfg.quality] || 0
                        const pct = stats.total > 0 ? (count / stats.total * 100) : 0
                        const barWidth = maxDistCount > 0 ? (count / maxDistCount * 100) : 0

                        return (
                            <div key={cfg.quality} className="flex items-center gap-3">
                                <div className={`w-20 text-sm font-medium ${cfg.textColor} shrink-0`}>
                                    {cfg.quality} {cfg.label}
                                </div>
                                <div className="flex-1 h-7 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden relative">
                                    <div
                                        className={`h-full ${cfg.color} rounded-lg transition-all duration-700 ease-out`}
                                        style={{ width: `${barWidth}%` }}
                                    />
                                    {count > 0 && (
                                        <span className="absolute inset-0 flex items-center px-3 text-xs font-medium text-white mix-blend-difference">
                                            {t('review.summary.distributionCount', { count, percentage: pct.toFixed(0) })}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* 掌握情况三段式 */}
                <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-slate-100 dark:border-slate-700/50">
                    <div className="text-center">
                        <div className="text-xl font-bold text-green-600">{stats.perfect.length}</div>
                        <div className="text-xs text-slate-500">{t('review.summary.mastery.strong')}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xl font-bold text-yellow-600">{stats.okay.length}</div>
                        <div className="text-xs text-slate-500">{t('review.summary.mastery.okay')}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xl font-bold text-red-600">{stats.weak.length}</div>
                        <div className="text-xs text-slate-500">{t('review.summary.mastery.weak')}</div>
                    </div>
                </div>
            </div>

            {/* ===== 薄弱单词列表 ===== */}
            {stats.weak.length > 0 && (
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {t('review.summary.weakWordsTitle', { count: stats.weak.length })}
                        </h3>
                        <button
                            onClick={() => setShowWeakWords(!showWeakWords)}
                            className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
                        >
                            {showWeakWords ? t('review.summary.collapse') : t('review.summary.expand')}
                        </button>
                    </div>

                    {/* 默认始终显示 */}
                    <div className="space-y-2">
                        {(showWeakWords ? stats.weak : stats.weak.slice(0, 5)).map((item, i) => (
                            <WordRatingItem key={item.word.id} item={item} index={i} label={ratingLabels[item.quality]} />
                        ))}
                        {!showWeakWords && stats.weak.length > 5 && (
                            <button
                                onClick={() => setShowWeakWords(true)}
                                className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                            >
                                {t('review.summary.moreWeakWords', { count: stats.weak.length - 5 })}
                            </button>
                        )}
                    </div>

                    {/* 一键复习薄弱单词 */}
                    <button
                        onClick={() => onReviewWeak(stats.weak.map(r => r.word))}
                        className="mt-4 w-full py-2.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 font-medium text-sm transition-colors flex items-center justify-center gap-2"
                    >
                        {t('review.summary.reviewWeakNow', { count: stats.weak.length })}
                    </button>
                </div>
            )}

            {/* ===== 全部单词评分明细 ===== */}
            <details className="glass-card p-6 group">
                <summary className="cursor-pointer text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between select-none">
                    <span>{t('review.summary.allRatings', { count: stats.total })}</span>
                    <span className="text-xs font-normal text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 space-y-2">
                    {data.ratings.map((item, i) => (
                        <WordRatingItem key={item.word.id} item={item} index={i} label={ratingLabels[item.quality]} />
                    ))}
                </div>
            </details>

            {/* ===== 操作按钮 ===== */}
            <div className="flex justify-center gap-4 pt-2">
                <button onClick={onRestart} className="btn-primary px-6">
                    {t('review.summary.restart')}
                </button>
                {data.mode !== 'normal' && (
                    <button onClick={onBackToNormal} className="btn-secondary px-6">
                        {t('review.summary.backToNormal')}
                    </button>
                )}
            </div>
        </div>
    )
}

/** 单个单词评分行 */
function WordRatingItem({ item, index, label }: { item: WordRating; index: number; label: string }) {
    const cfg = getRatingStyle(item.quality)

    return (
        <div
            className={`flex items-center gap-3 p-3 rounded-xl border ${cfg.bgLight} ${cfg.border} transition-all hover:shadow-sm animate-fade-in`}
            style={{ animationDelay: `${index * 30}ms` }}
        >
            {/* 评分徽章 */}
            <div className={`w-8 h-8 rounded-lg ${cfg.color} text-white text-sm font-bold flex items-center justify-center shrink-0`}>
                {item.quality}
            </div>

            {/* 单词信息 */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 dark:text-white">{item.word.word}</span>
                    <span className="text-xs text-slate-400 font-mono">{item.word.phonetic}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {item.word.meaning.split('\n')[0]}
                </p>
            </div>

            {/* 发音按钮 */}
            <AudioButton
                word={item.word.word}
                size={16}
                className="shrink-0 !p-1.5"
            />

            {/* 评分标签 */}
            <span className={`text-xs font-medium ${cfg.textColor} shrink-0`}>
                {label}
            </span>
        </div>
    )
}
