import { useState, useEffect, type ReactNode } from 'react'
import { Flame, Clock, AlertTriangle } from 'lucide-react'
import Heatmap from '../components/Heatmap'
import { api, API_PATHS } from '../utils/api'
import { useTranslation } from 'react-i18next'
import { PageTitle } from '../components/PageTitle'

interface Stats {
    total_words: number
    mastered: number
    learning: number
    due_today: number
    reviewed_today: number
    streak_days: number
}

interface StudyTime {
    total_hours: number
    formatted: string
}

export default function StatisticsPage() {
    const { t } = useTranslation()
    const [stats, setStats] = useState<Stats | null>(null)
    const [studyTime, setStudyTime] = useState<StudyTime | null>(null)
    const [fetchError, setFetchError] = useState('')

    const fetchStats = async () => {
        setFetchError('')
        try {
            const data = await api.get(API_PATHS.STATS)
            setStats(data)
        } catch (error) {
            console.error('Failed to fetch stats:', error)
            setFetchError('Failed to load statistics. Please try again.')
        }
    }

    const fetchStudyTime = async () => {
        setFetchError('')
        try {
            const data = await api.get(API_PATHS.STATS_STUDY_TIME)
            setStudyTime(data)
        } catch (error) {
            console.error('Failed to fetch study time:', error)
            setFetchError('Failed to load study time data. Please try again.')
        }
    }

    useEffect(() => {
        fetchStats()
        fetchStudyTime()
    }, [])

    return (
        <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
            <PageTitle subtitle={t('statistics.subtitle')}>
                {t('statistics.title')}
            </PageTitle>

            {/* Error Banner */}
            {fetchError && (
                <div className="glass-card p-4 flex items-center gap-3 border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10">
                    <AlertTriangle size={18} className="text-red-500 shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400 flex-1">{fetchError}</p>
                    <button onClick={() => { setFetchError(''); fetchStats(); fetchStudyTime(); }} className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-500/20 transition-colors">
                        Retry
                    </button>
                </div>
            )}

            {/* Core Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {stats ? (
                    <>
                        <StatCard label={t('statistics.cards.totalWords')} value={stats.total_words} color="text-slate-700 dark:text-slate-200" />
                        <StatCard label={t('statistics.cards.mastered')} value={stats.mastered} color="text-green-600" />
                        <StatCard label={t('statistics.cards.learning')} value={stats.learning} color="text-blue-600" />
                        <StatCard label={t('statistics.cards.dueToday')} value={stats.due_today} color="text-orange-600" />
                        <StatCard label={t('statistics.cards.reviewedToday')} value={stats.reviewed_today} color="text-indigo-600" />
                        <StatCard
                            label={t('statistics.cards.streakDays')}
                            value={
                                <span className="flex items-center justify-center gap-1">
                                    {stats.streak_days} <Flame size={16} className="text-pink-500 inline" />
                                </span>
                            }
                            color="text-pink-600"
                        />
                    </>
                ) : (
                    Array(6).fill(0).map((_, i) => (
                        <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 h-24 animate-pulse" />
                    ))
                )}
            </div>

            {/* Heatmap Section - Full Width */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    {t('statistics.heatmapTitle')}
                </h3>
                <Heatmap />
            </div>

            {/* Bottom Section - Study Time & Progress */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Study Time Card */}
                {studyTime && (
                    <div className="glass-card p-6 flex flex-col justify-center">
                        <div className="flex items-center gap-3 mb-2">
                            <Clock size={36} className="text-slate-400 dark:text-slate-500" />
                            <div>
                                <h3 className="font-bold text-slate-800 dark:text-white text-lg">
                                    {t('statistics.studyTimeTitle')}
                                </h3>
                                <p className="text-sm text-slate-500">{t('statistics.studyTimeSubtitle')}</p>
                            </div>
                        </div>
                        <div className="text-4xl font-bold text-primary-600 mt-2">{studyTime.formatted}</div>
                    </div>
                )}

                {/* Progress Card */}
                <div className="glass-card p-6">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">
                        {t('statistics.progressTitle')}
                    </h3>
                    {stats && stats.total_words > 0 ? (
                        <div className="space-y-4">
                            <div className="flex items-end justify-between">
                                <span className="text-3xl font-bold text-slate-800 dark:text-white">
                                    {Math.round((stats.mastered / stats.total_words) * 100)}%
                                </span>
                                <span className="text-sm text-slate-500 mb-1">
                                    {stats.mastered} / {stats.total_words}
                                </span>
                            </div>
                            <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-1000 ease-out"
                                    style={{ width: `${(stats.mastered / stats.total_words) * 100}%` }}
                                />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
                                {t('statistics.progressEncouragement')}
                            </p>
                        </div>
                    ) : (
                        <div className="text-slate-500 text-center py-8">{t('statistics.empty')}</div>
                    )}
                </div>
            </div>
        </div>
    )
}

function StatCard({ label, value, color }: { label: string, value: ReactNode, color: string }) {
    return (
        <div className="glass-card p-4 text-center hover:shadow-lg transition-shadow">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">{label}</div>
        </div>
    )
}
