import { useState, useRef, useEffect } from 'react'
import { Home, BookOpen, Brain, Settings, ChevronLeft, ChevronRight, Upload, Languages, User as UserIcon, LogOut, Crown, BarChart2, Bot } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useGlobalState } from '../context/GlobalStateContext'
import { useAuth } from '../context/AuthContext'
import { LoginModal } from './LoginModal'
import { SubscriptionModal } from './SubscriptionModal'

// User Avatar with Dropdown (rendered via Portal for proper positioning)
function UserAvatarDropdown({ onNavigateToSettings, isCollapsed }: { onNavigateToSettings?: (tab?: string) => void, isCollapsed: boolean }) {
    const { user, logout } = useAuth()
    const [showAuth, setShowAuth] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)
    const [showPay, setShowPay] = useState(false)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
                setShowDropdown(false)
            }
        }

        if (showDropdown) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showDropdown])

    const handleLogout = () => {
        logout()
        setShowDropdown(false)
    }

    const handleAccountSettings = () => {
        setShowDropdown(false)
        onNavigateToSettings?.('account')
    }

    const handleUpgrade = () => {
        setShowDropdown(false)
        setShowPay(true)
    }

    // Calculate dropdown position (Open UPWARDS from bottom)
    const getDropdownStyle = () => {
        if (!buttonRef.current) return { top: 0, left: 0 }
        const rect = buttonRef.current.getBoundingClientRect()
        // Calculate bottom position relative to viewport
        return {
            bottom: window.innerHeight - rect.top + 8,
            left: rect.left,
        }
    }

    // Not logged in
    if (!user) {
        return (
            <>
                <button
                    onClick={() => setShowAuth(true)}
                    className={`group relative flex items-center gap-3 w-full p-2.5 rounded-xl transition-all duration-200 overflow-hidden
                        hover:bg-white dark:hover:bg-slate-800 hover:shadow-md border border-transparent hover:border-slate-100 dark:hover:border-slate-700`}
                    title="登录 / 注册"
                >
                    <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white transition-transform group-hover:scale-110 shadow-sm flex-shrink-0">
                        <UserIcon size={18} />
                    </div>
                    <span className={`text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary-600 dark:group-hover:text-primary-400 whitespace-nowrap transition-all duration-300 ml-3
                        ${isCollapsed ? 'opacity-0 w-0 ml-0' : 'opacity-100 w-auto'}`}>
                        立即登录
                    </span>
                </button>
                <LoginModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
            </>
        )
    }

    const initials = user.email.charAt(0).toUpperCase()
    const isPremium = user.tier === 'premium'
    const dropdownStyle = getDropdownStyle()

    return (
        <>
            <button
                ref={buttonRef}
                onClick={() => setShowDropdown(!showDropdown)}
                className={`group flex items-center gap-3 w-full p-2.5 rounded-xl transition-all duration-200 overflow-hidden
                    hover:bg-white dark:hover:bg-slate-800 hover:shadow-md border border-transparent hover:border-slate-100 dark:hover:border-slate-700`}
                title={isCollapsed ? user.email : (isPremium ? '专业版会员' : '免费版账号')}
            >
                {/* Avatar */}
                <div
                    className="relative w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm group-hover:scale-110 transition-transform"
                    style={{
                        background: isPremium
                            ? 'linear-gradient(135deg, #fbbf24, #f97316)'
                            : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))'
                    }}
                >
                    {initials}
                    {isPremium && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-slate-900">
                            <Crown size={9} className="text-amber-900" />
                        </div>
                    )}
                </div>

                {/* User Info - animate opacity/width */}
                <span className={`text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary-600 dark:group-hover:text-primary-400 whitespace-nowrap transition-all duration-300 ml-3
                    ${isCollapsed ? 'opacity-0 w-0 ml-0' : 'opacity-100 w-auto'}`}>
                    {user.email.split('@')[0]}
                </span>
            </button>

            {/* Dropdown Menu - Rendered via Portal */}
            {showDropdown && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed w-72 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl ring-1 ring-slate-200/50 dark:ring-zinc-800 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200 z-[9999]"
                    style={{ bottom: dropdownStyle.bottom, left: dropdownStyle.left }}
                >
                    {/* User Info Card */}
                    <div className={`p-4 ${isPremium ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20' : 'bg-gradient-to-br from-slate-50 to-primary-50/50 dark:from-slate-900 dark:to-zinc-900'}`}>
                        <div className="flex items-center gap-3">
                            <div
                                className="relative w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg ring-2 ring-white/50 dark:ring-white/10"
                                style={{
                                    background: isPremium
                                        ? 'linear-gradient(135deg, #fbbf24, #f97316)'
                                        : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))'
                                }}
                            >
                                {initials}
                                {isPremium && (
                                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-slate-900">
                                        <Crown size={11} className="text-amber-900" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 dark:text-white truncate">
                                    {user.email.split('@')[0]}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate opacity-80">
                                    {user.email}
                                </p>
                                <div className="mt-2">
                                    {isPremium ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 dark:from-amber-900/50 dark:to-orange-900/50 dark:text-amber-300 shadow-sm border border-amber-200/50 dark:border-amber-700/50">
                                            <Crown size={10} />
                                            专业版会员
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200/50 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                            免费版账号
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Menu Items */}
                    <div className="p-2 space-y-1">
                        <button
                            onClick={handleAccountSettings}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800/80 hover:text-slate-900 dark:hover:text-white transition-all"
                        >
                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                <Settings size={18} />
                            </div>
                            账户设置
                        </button>

                        {!isPremium && (
                            <button
                                onClick={handleUpgrade}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                            >
                                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-500">
                                    <Crown size={18} />
                                </div>
                                <div className="flex-1 text-left">
                                    <div>升级至专业版</div>
                                    <div className="text-xs text-amber-600/70 dark:text-amber-400/70 font-normal">解锁全部高级功能</div>
                                </div>
                            </button>
                        )}

                        <div className="my-2 border-t border-slate-100 dark:border-zinc-800 mx-3" />

                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        >
                            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-500">
                                <LogOut size={18} />
                            </div>
                            退出登录
                        </button>
                    </div>
                </div>,
                document.body
            )}

            <SubscriptionModal isOpen={showPay} onClose={() => setShowPay(false)} />
        </>
    )
}

type Page = 'add' | 'list' | 'review' | 'settings' | 'import' | 'translation' | 'stats' | 'chat'

interface SidebarProps {
    currentPage: Page
    setCurrentPage: (page: Page) => void
    onNavigateToSettings?: (tab?: string) => void
}

export default function Sidebar({ currentPage, setCurrentPage, onNavigateToSettings }: SidebarProps) {
    const [isCollapsed, setIsCollapsed] = useState(false)
    const { dueCount } = useGlobalState()

    const navItems = [
        { id: 'add' as Page, icon: <Home size={22} />, label: '词汇中心', tooltip: '搜索和添加新单词', badge: 0 },
        { id: 'import' as Page, icon: <Upload size={22} />, label: '批量导入', tooltip: 'TXT/CSV 批量导入', badge: 0 },
        { id: 'list' as Page, icon: <BookOpen size={22} />, label: '单词列表', tooltip: '管理已收藏的单词', badge: 0 },
        { id: 'review' as Page, icon: <Brain size={22} />, label: '智能复习', tooltip: '使用 SM-2 算法复习', badge: dueCount },
        { id: 'stats' as Page, icon: <BarChart2 size={22} />, label: '学习统计', tooltip: '查看学习进度和热力图', badge: 0 },
        { id: 'translation' as Page, icon: <Languages size={22} />, label: '翻译助手', tooltip: '多语言智能翻译助手', badge: 0 },
        { id: 'chat' as Page, icon: <Bot size={22} />, label: 'AI 语伴', tooltip: '拥有长期记忆的对话练习', badge: 0 },
    ]

    return (
        <aside
            className={`glass-sidebar flex flex-col transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-48'} shrink-0 relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800 z-50`}
        >
            {/* Header with Logo and Collapse Button */}
            <div className="h-16 flex items-center gap-3 px-4 shrink-0">
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                    {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                </button>

                {/* Logo - hidden when collapsed */}
                <h1
                    className={`font-bold text-lg bg-linear-to-r from-primary-600 to-accent-500 
                         bg-clip-text text-transparent whitespace-nowrap transition-all duration-300 flex-1 min-w-0
                         ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}
                >
                    智能生词本
                </h1>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-2 space-y-1.5 overflow-y-auto custom-scrollbar">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setCurrentPage(item.id)}
                        className={`nav-item w-full overflow-hidden group ${currentPage === item.id ? 'active' : ''}`}
                        title={isCollapsed ? item.tooltip : ''}
                    >
                        <span className="shrink-0 relative">
                            {item.icon}
                            {item.badge > 0 && isCollapsed && (
                                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 
                                    bg-red-500 text-white text-xs font-medium rounded-full 
                                    flex items-center justify-center shadow-sm border border-white dark:border-slate-900">
                                    {item.badge > 99 ? '99+' : item.badge}
                                </span>
                            )}
                        </span>
                        <span
                            className={`whitespace-nowrap transition-all duration-300 ml-3
                                ${isCollapsed ? 'opacity-0 w-0 ml-0' : 'opacity-100 w-auto'}`}
                        >
                            {item.label}
                        </span>
                        {item.badge > 0 && !isCollapsed && (
                            <span className="ml-auto px-2 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
                                {item.badge > 99 ? '99+' : item.badge}
                            </span>
                        )}
                        {currentPage === item.id && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-500 rounded-r-full" />
                        )}
                    </button>
                ))}
            </nav>

            {/* Footer Section */}
            <div className="p-3 space-y-3 pb-4">
                {/* User Profile */}
                <UserAvatarDropdown onNavigateToSettings={onNavigateToSettings} isCollapsed={isCollapsed} />

                {/* Separator */}
                <div className="h-px bg-slate-200 dark:bg-slate-700/50 mx-1" />

                {/* Settings Link */}
                <button
                    onClick={() => setCurrentPage('settings')}
                    className={`group flex items-center gap-3 w-full p-2.5 rounded-xl transition-all duration-200 overflow-hidden
                        ${currentPage === 'settings'
                            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-bold shadow-sm border border-primary-100 dark:border-primary-800/50'
                            : 'hover:bg-white dark:hover:bg-slate-800 hover:shadow-md border border-transparent hover:border-slate-100 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                    title={isCollapsed ? "应用设置" : ''}
                >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 flex-shrink-0
                        ${currentPage === 'settings'
                            ? 'bg-primary-100 dark:bg-primary-800/50 text-primary-600 dark:text-primary-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:scale-110 group-hover:bg-primary-50 dark:group-hover:bg-primary-900/20 group-hover:text-primary-600 dark:group-hover:text-primary-400'
                        }`}
                    >
                        <Settings size={20} />
                    </div>
                    <span className={`text-sm text-left whitespace-nowrap transition-all duration-300 ml-3
                        ${isCollapsed ? 'opacity-0 w-0 ml-0' : 'opacity-100 w-auto'}`}>
                        设置
                    </span>
                </button>
            </div>
        </aside>
    )
}
