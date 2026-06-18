import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { Flame, Clock, AlertTriangle } from 'lucide-react'
import Heatmap from '../components/Heatmap'
import { api, API_PATHS } from '../utils/api'
import { useTranslation } from 'react-i18next'
import { PageTitle } from '../components/PageTitle'
import { useTheme } from '../context/ThemeContext'
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    PieChart,
    Pie,
    Cell
} from 'recharts'

interface Stats {
    total_words: number
    mastered: number
    learning: number
    new: number
    due_today: number
    reviewed_today: number
    streak_days: number
}

interface StudyTime {
    total_hours: number
    formatted: string
}

export default function StatisticsPage() {
    const { t, i18n } = useTranslation()
    const { isDark } = useTheme()
    const [stats, setStats] = useState<Stats | null>(null)
    const [studyTime, setStudyTime] = useState<StudyTime | null>(null)
    const [heatmapData, setHeatmapData] = useState<Record<string, number>>({})
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

    const fetchHeatmapData = async () => {
        try {
            const result = await api.get(API_PATHS.STATS_HEATMAP)
            setHeatmapData(result.heatmap || {})
        } catch (error) {
            console.error('Failed to fetch heatmap data:', error)
        }
    }

    useEffect(() => {
        fetchStats()
        fetchStudyTime()
        fetchHeatmapData()
    }, [])

    const textColor = isDark ? '#94a3b8' : '#475569'
    const tooltipBg = isDark ? '#1e293b' : '#ffffff'
    const tooltipBorder = isDark ? '#334155' : '#e2e8f0'

    const last7DaysData = useMemo(() => {
        const result = []
        const locale = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('zh') ? 'zh-CN' : 'en-US'
        const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short' })
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date()
            d.setDate(d.getDate() - i)
            const year = d.getFullYear()
            const month = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            const dateStr = `${year}-${month}-${day}`
            
            const label = weekdayFormatter.format(d)
            const count = heatmapData[dateStr] || 0
            result.push({ name: label, count })
        }
        return result
    }, [heatmapData, i18n.resolvedLanguage, i18n.language])

    const distributionData = useMemo(() => {
        if (!stats) return []
        return [
            { name: t('statistics.cards.mastered'), value: stats.mastered, color: '#10b981' },
            { name: t('statistics.cards.learning'), value: stats.learning, color: '#3b82f6' },
            { name: t('statistics.cards.new', 'New'), value: stats.new || 0, color: '#64748b' }
        ].filter(item => item.value > 0)
    }, [stats, t])

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
                    <button onClick={() => { setFetchError(''); fetchStats(); fetchStudyTime(); fetchHeatmapData(); }} className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-500/20 transition-colors">
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

            {/* Visual Charts Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Weekly Study Trends (Bar Chart) */}
                <div className="glass-card p-6 flex flex-col h-[320px]">
                    <h3 className="text-base font-bold text-slate-800 dark:text-white mb-4">
                        {t('statistics.weeklyTrendsTitle', 'Weekly Review Trends')}
                    </h3>
                    <div className="flex-1 w-full min-h-0">
                        {heatmapData && Object.keys(heatmapData).length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={last7DaysData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                                            <stop offset="100%" stopColor="#d97706" stopOpacity={0.6} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="name" stroke={textColor} fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke={textColor} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: tooltipBg,
                                            borderColor: tooltipBorder,
                                            color: isDark ? '#f8fafc' : '#0f172a',
                                            borderRadius: '12px',
                                            fontSize: '13px',
                                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                                        }}
                                        cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)', radius: 4 }}
                                    />
                                    <Bar dataKey="count" fill="url(#barGradient)" radius={[6, 6, 0, 0]} maxBarSize={32} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-sm text-slate-400">
                                {t('statistics.noTrendData', 'No review history found')}
                            </div>
                        )}
                    </div>
                </div>

                {/* Mastery Distribution (Donut Chart) */}
                <div className="glass-card p-6 flex flex-col h-[320px]">
                    <h3 className="text-base font-bold text-slate-800 dark:text-white mb-4">
                        {t('statistics.masteryDistributionTitle', 'Mastery Distribution')}
                    </h3>
                    <div className="flex-1 w-full min-h-0 flex items-center justify-between">
                        {stats && stats.total_words > 0 ? (
                            <>
                                <div className="w-[55%] h-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={distributionData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={3}
                                                dataKey="value"
                                            >
                                                {distributionData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: tooltipBg,
                                                    borderColor: tooltipBorder,
                                                    color: isDark ? '#f8fafc' : '#0f172a',
                                                    borderRadius: '12px',
                                                    fontSize: '13px',
                                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                                                }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="w-[45%] pl-4 flex flex-col gap-3">
                                    {distributionData.map((entry, index) => (
                                        <div key={index} className="flex items-center gap-2.5">
                                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                                                    {entry.name}
                                                </div>
                                                <div className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                                                    {entry.value} {t('statistics.wordsUnit', 'words')}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="h-full w-full flex items-center justify-center text-sm text-slate-400">
                                {t('statistics.empty', 'No words found')}
                            </div>
                        )}
                    </div>
                </div>
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
        <div className="glass-card p-4 rounded-xl hover:shadow-md transition-shadow">
            <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mt-1 font-medium">{label}</div>
        </div>
    )
}
