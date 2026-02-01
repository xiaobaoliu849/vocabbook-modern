export default function AboutSection() {
    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                    关于软件
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    版本信息与开发团队
                </p>
            </div>

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    ℹ️ 详细信息
                </h3>

                <div className="text-slate-600 dark:text-slate-400 space-y-4">
                    <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100 text-lg">智能生词本 Modern</p>
                        <p className="text-sm opacity-80">Version 2.0.0</p>
                    </div>

                    <p>使用 React + FastAPI + AI 构建的现代化英语学习工具</p>

                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-sm leading-relaxed">
                        <p className="font-medium mb-1">主要特性：</p>
                        <ul className="list-disc list-inside space-y-1 ml-1 opacity-90">
                            <li>SM-2 间隔重复记忆算法</li>
                            <li>AI 智能生成例句与助记</li>
                            <li>多维词典聚合查询</li>
                            <li>现代化 Glassmorphism UI 设计</li>
                        </ul>
                    </div>

                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                        <p className="text-xs text-slate-400 text-center">
                            Designed with ❤️ by VocabBook Team
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
