import { useTheme } from '../../../context/ThemeContext'
import { useState, useEffect } from 'react'
import { Check, Volume2 } from 'lucide-react'

export default function GeneralSection() {
    const { isDark, toggleTheme } = useTheme()
    const [accent, setAccent] = useState<'us' | 'uk'>(() => 
        (localStorage.getItem('preferred_accent') as 'us' | 'uk') || 'us'
    )

    useEffect(() => {
        localStorage.setItem('preferred_accent', accent)
    }, [accent])

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                    常规设置
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    自定义应用的外观和基础偏好
                </p>
            </div>

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    🎨 外观
                </h3>

                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-medium text-slate-700 dark:text-slate-300">深色模式</div>
                        <div className="text-sm text-slate-500">切换明暗主题</div>
                    </div>
                    <button
                        onClick={toggleTheme}
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

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                    <Volume2 className="text-primary-500" size={20} />
                    发音偏好
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* US Accent Card */}
                    <button
                        onClick={() => setAccent('us')}
                        className={`relative group flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all duration-300 ${accent === 'us'
                            ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10 ring-4 ring-primary-500/10 shadow-lg shadow-primary-500/10'
                            : 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md'
                            }`}
                    >
                        <div className={`text-4xl w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border transition-colors ${
                            accent === 'us' 
                                ? 'bg-white dark:bg-slate-800 border-primary-200 dark:border-primary-800' 
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 group-hover:bg-white'
                        }`}>
                            <span className="transform group-hover:scale-110 transition-transform duration-300">🇺🇸</span>
                        </div>
                        <div>
                            <div className={`font-bold text-lg mb-1 transition-colors ${accent === 'us' ? 'text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200'}`}>美式英语</div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">General American</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-black/20 px-2 py-1 rounded-md inline-block border border-slate-100 dark:border-slate-700/50">
                                卷舌音重 · 热情奔放
                            </div>
                        </div>
                        {accent === 'us' && (
                            <div className="absolute top-4 right-4 text-white bg-primary-500 rounded-full p-1 shadow-sm animate-scale-in">
                                <Check size={14} strokeWidth={3} />
                            </div>
                        )}
                    </button>

                    {/* UK Accent Card */}
                    <button
                        onClick={() => setAccent('uk')}
                        className={`relative group flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all duration-300 ${accent === 'uk'
                            ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10 ring-4 ring-primary-500/10 shadow-lg shadow-primary-500/10'
                            : 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md'
                            }`}
                    >
                        <div className={`text-4xl w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border transition-colors ${
                            accent === 'uk' 
                                ? 'bg-white dark:bg-slate-800 border-primary-200 dark:border-primary-800' 
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 group-hover:bg-white'
                        }`}>
                            <span className="transform group-hover:scale-110 transition-transform duration-300">🇬🇧</span>
                        </div>
                        <div>
                            <div className={`font-bold text-lg mb-1 transition-colors ${accent === 'uk' ? 'text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200'}`}>英式英语</div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Received Pronunciation</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-black/20 px-2 py-1 rounded-md inline-block border border-slate-100 dark:border-slate-700/50">
                                字正腔圆 · 优雅内敛
                            </div>
                        </div>
                        {accent === 'uk' && (
                            <div className="absolute top-4 right-4 text-white bg-primary-500 rounded-full p-1 shadow-sm animate-scale-in">
                                <Check size={14} strokeWidth={3} />
                            </div>
                        )}
                    </button>
                </div>
            </div>

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    ⌨️ 快捷键说明
                </h3>

                <div className="space-y-4">
                    <div>
                        <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                            全局
                        </h4>
                        <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50">
                            <span className="text-slate-700 dark:text-slate-300">显示/隐藏窗口</span>
                            <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500 dark:text-slate-400">
                                Ctrl + Alt + V
                            </kbd>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                            复习模式
                        </h4>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50">
                                <span className="text-slate-700 dark:text-slate-300">查看答案 / 翻转卡片</span>
                                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500 dark:text-slate-400">
                                    Space
                                </kbd>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50">
                                <span className="text-slate-700 dark:text-slate-300">评价记忆程度</span>
                                <div className="flex gap-1">
                                    <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500 dark:text-slate-400">1</kbd>
                                    <span className="text-slate-400 text-xs flex items-center">-</span>
                                    <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500 dark:text-slate-400">5</kbd>
                                </div>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50">
                                <span className="text-slate-700 dark:text-slate-300">播放发音</span>
                                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500 dark:text-slate-400">
                                    P
                                </kbd>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                            通用
                        </h4>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50">
                                <span className="text-slate-700 dark:text-slate-300">搜索 / 确认</span>
                                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500 dark:text-slate-400">
                                    Enter
                                </kbd>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50">
                                <span className="text-slate-700 dark:text-slate-300">关闭弹窗</span>
                                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500 dark:text-slate-400">
                                    Esc
                                </kbd>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

