import { useState, useEffect } from 'react'

interface SettingsProps {
    isDark: boolean
    setIsDark: (dark: boolean) => void
}

interface Stats {
    total_words: number
    mastered: number
    learning: number
    due_today: number
}

interface StudyTime {
    total_hours: number
    formatted: string
}

export default function Settings({ isDark, setIsDark }: SettingsProps) {
    const [stats, setStats] = useState<Stats | null>(null)
    const [studyTime, setStudyTime] = useState<StudyTime | null>(null)
    const [aiProvider, setAiProvider] = useState('openai')
    const [aiApiKey, setAiApiKey] = useState('')

    useEffect(() => {
        fetchStats()
        fetchStudyTime()
        loadAiSettings()
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

    const loadAiSettings = () => {
        setAiProvider(localStorage.getItem('ai_provider') || 'openai')
        setAiApiKey(localStorage.getItem('ai_api_key') || '')
    }

    const saveAiSettings = () => {
        localStorage.setItem('ai_provider', aiProvider)
        localStorage.setItem('ai_api_key', aiApiKey)
        alert('✅ AI 设置已保存')
    }

    return (
        <div className="animate-fade-in space-y-6 max-w-4xl">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-bold text-slate-800 dark:text-white">
                    设置
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                    应用设置和学习统计
                </p>
            </div>

            {/* Statistics */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    📊 学习统计
                </h3>

                {stats ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-primary-600">{stats.total_words}</div>
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
                                className="h-full bg-gradient-to-r from-green-500 to-accent-500 transition-all duration-500"
                                style={{ width: `${(stats.mastered / stats.total_words) * 100}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Study Time */}
                {studyTime && (
                    <div className="mt-4 text-center text-slate-600 dark:text-slate-400">
                        累计学习时长：<span className="font-bold text-primary-600">{studyTime.formatted}</span>
                    </div>
                )}
            </div>

            {/* Theme */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    🎨 外观设置
                </h3>

                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-medium text-slate-700 dark:text-slate-300">深色模式</div>
                        <div className="text-sm text-slate-500">切换明暗主题</div>
                    </div>
                    <button
                        onClick={() => setIsDark(!isDark)}
                        className={`relative w-14 h-8 rounded-full transition-colors ${isDark ? 'bg-primary-600' : 'bg-slate-300'
                            }`}
                    >
                        <div
                            className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform ${isDark ? 'translate-x-7' : 'translate-x-1'
                                }`}
                        />
                    </button>
                </div>
            </div>

            {/* AI Settings */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    🤖 AI 设置
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            AI 提供商
                        </label>
                        <select
                            value={aiProvider}
                            onChange={(e) => setAiProvider(e.target.value)}
                            className="input-field"
                        >
                            <option value="openai">OpenAI (GPT-4)</option>
                            <option value="anthropic">Anthropic (Claude)</option>
                            <option value="gemini">Google (Gemini)</option>
                            <option value="ollama">Ollama (本地)</option>
                            <option value="custom">自定义 API</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            API Key
                        </label>
                        <input
                            type="password"
                            value={aiApiKey}
                            onChange={(e) => setAiApiKey(e.target.value)}
                            placeholder="输入你的 API Key..."
                            className="input-field"
                        />
                    </div>

                    <button onClick={saveAiSettings} className="btn-primary">
                        保存 AI 设置
                    </button>
                </div>
            </div>

            {/* About */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    ℹ️ 关于
                </h3>

                <div className="text-slate-600 dark:text-slate-400 space-y-2">
                    <p><strong>智能生词本 Modern</strong> v2.0.0</p>
                    <p>使用 React + FastAPI + AI 构建的现代化英语学习工具</p>
                    <p className="text-sm">
                        特性：SM-2 间隔重复算法 · AI 智能例句 · 多词典支持 · 深色模式
                    </p>
                </div>
            </div>
        </div>
    )
}
