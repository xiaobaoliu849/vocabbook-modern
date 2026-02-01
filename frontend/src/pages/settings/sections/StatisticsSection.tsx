import { useState, useEffect } from 'react'
import Heatmap from '../../../components/Heatmap'

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

export default function StatisticsSection() {
    const [stats, setStats] = useState<Stats | null>(null)
    const [studyTime, setStudyTime] = useState<StudyTime | null>(null)

    useEffect(() => {
        fetchStats()
        fetchStudyTime()
    }, [])

    const fetchStats = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/stats')
            if (response.ok) {
                const data = await response.json()
                setStats(data)
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error)
        }
    }

    const fetchStudyTime = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/stats/study-time')
            if (response.ok) {
                const data = await response.json()
                setStudyTime(data)
            }
        } catch (error) {
            console.error('Failed to fetch study time:', error)
        }
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                    学习统计
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    查看你的学习进度和坚持情况
                </p>
            </div>

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    📊 核心数据
                </h3>

                {stats ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-slate-700 dark:text-slate-200">{stats.total_words}</div>
                            <div className="text-sm text-slate-500 mt-1">总单词数</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-green-600">{stats.mastered}</div>
                            <div className="text-sm text-slate-500 mt-1">已掌握</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-blue-600">{stats.learning}</div>
                            <div className="text-sm text-slate-500 mt-1">学习中</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-orange-600">{stats.due_today}</div>
                            <div className="text-sm text-slate-500 mt-1">今日待复习</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-indigo-600">{stats.reviewed_today}</div>
                            <div className="text-sm text-slate-500 mt-1">今日已复习</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-pink-600 flex items-center justify-center gap-1">
                                {stats.streak_days} <span className="text-base">🔥</span>
                            </div>
                            <div className="text-sm text-slate-500 mt-1">连续坚持(天)</div>
                        </div>
                    </div>
                ) : (
                    <div className="text-slate-500 text-center py-4">加载中...</div>
                )}

                {/* Progress */}
                {stats && stats.total_words > 0 && (
                    <div className="mt-6">
                        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400 mb-2">
                            <span>学习进度</span>
                            <span>{Math.round((stats.mastered / stats.total_words) * 100)}%</span>
                        </div>
                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-linear-to-r from-green-500 to-accent-500 transition-all duration-500"
                                style={{ width: `${(stats.mastered / stats.total_words) * 100}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Heatmap */}
                <div className="mt-6">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">学习热力图</p>
                    <Heatmap />
                </div>
            </div>

            {/* Study Time */}
            {studyTime && (
                <div className="glass-card p-6 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-slate-800 dark:text-white">⏱️ 累计学习时长</h3>
                        <p className="text-sm text-slate-500">坚持就是胜利</p>
                    </div>
                    <div className="text-2xl font-bold text-primary-600">{studyTime.formatted}</div>
                </div>
            )}
        </div>
    )
}
