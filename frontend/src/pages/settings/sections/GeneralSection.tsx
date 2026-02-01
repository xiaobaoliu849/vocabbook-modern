import { useTheme } from '../../../context/ThemeContext'

export default function GeneralSection() {
    const { isDark, toggleTheme } = useTheme()

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

