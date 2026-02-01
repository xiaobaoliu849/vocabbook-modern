import { useState } from 'react'
import { Home, BookOpen, Brain, Settings, ChevronLeft, ChevronRight } from 'lucide-react'


type Page = 'add' | 'list' | 'review' | 'settings'

interface SidebarProps {
    currentPage: Page
    setCurrentPage: (page: Page) => void
}

const navItems = [
    { id: 'add' as Page, icon: <Home size={22} />, label: '词汇中心', tooltip: '搜索和添加新单词' },
    { id: 'list' as Page, icon: <BookOpen size={22} />, label: '单词列表', tooltip: '管理已收藏的单词' },
    { id: 'review' as Page, icon: <Brain size={22} />, label: '智能复习', tooltip: '使用 SM-2 算法复习' },
]

export default function Sidebar({ currentPage, setCurrentPage }: SidebarProps) {
    const [isCollapsed, setIsCollapsed] = useState(false)

    return (
        <aside
            className={`glass-sidebar flex flex-col transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-48'
                }`}
        >
            {/* Header */}
            <div className="p-4 flex items-center gap-3 overflow-hidden">
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl
                     hover:bg-slate-200 dark:hover:bg-slate-700 
                     transition-colors text-slate-500"
                >
                    {isCollapsed ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
                </button>
                <h1
                    className={`font-bold text-xl bg-linear-to-r from-primary-600 to-accent-500 
                         bg-clip-text text-transparent whitespace-nowrap transition-all duration-300
                         ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}
                >
                    智能生词本
                </h1>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-2">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setCurrentPage(item.id)}
                        className={`nav-item w-full overflow-hidden ${currentPage === item.id ? 'active' : ''}`}
                        title={item.tooltip}
                    >
                        <span className="shrink-0">{item.icon}</span>
                        <span
                            className={`whitespace-nowrap transition-all duration-300 
                                ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}
                        >
                            {item.label}
                        </span>
                        {currentPage === item.id && (
                            <div className="absolute left-0 w-1 h-8 bg-primary-500 rounded-r-full" />
                        )}
                    </button>
                ))}
            </nav>

            {/* Settings at bottom */}
            <div className="px-3 pb-4">
                <button
                    onClick={() => setCurrentPage('settings')}
                    className={`nav-item w-full overflow-hidden ${currentPage === 'settings' ? 'active' : ''}`}
                    title="应用设置"
                >
                    <span className="shrink-0"><Settings size={22} /></span>
                    <span
                        className={`whitespace-nowrap transition-all duration-300 
                            ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}
                    >
                        设置
                    </span>
                </button>
            </div>

            {/* Version info */}
            <div
                className={`px-4 pb-4 text-xs text-slate-400 dark:text-slate-500 
                    whitespace-nowrap transition-all duration-300 overflow-hidden
                    ${isCollapsed ? 'opacity-0 h-0 pb-0' : 'opacity-100 h-auto'}`}
            >
                v2.0.0 Modern
            </div>
        </aside>
    )
}
