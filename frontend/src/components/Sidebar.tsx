import { useState, useRef, useEffect } from 'react'
import { Home, BookOpen, Brain, Settings, ChevronLeft, ChevronRight, User as UserIcon, LogOut, Crown, BarChart2, Bot, Languages } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useGlobalState } from '../context/GlobalStateContext'
import { useAuth } from '../context/AuthContext'
import { LoginModal } from './LoginModal'
import { SubscriptionModal } from './SubscriptionModal'

// User Avatar with Dropdown (rendered via Portal for proper positioning)
function UserAvatarDropdown({ onNavigateToSettings, isCollapsed }: { onNavigateToSettings?: (tab?: string) => void, isCollapsed: boolean }) {
    const { t, i18n } = useTranslation()
    const { user, logout } = useAuth()
    const [showAuth, setShowAuth] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)
    const [showPay, setShowPay] = useState(false)
    const [dropdownStyle, setDropdownStyle] = useState({ bottom: 0, left: 0 })
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

    useEffect(() => {
        if (!showDropdown || !buttonRef.current) return

        const updatePosition = () => {
            if (!buttonRef.current) return
            const rect = buttonRef.current.getBoundingClientRect()
            setDropdownStyle({
                bottom: window.innerHeight - rect.top + 8,
                left: rect.left,
            })
        }

        updatePosition()
        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true)
        return () => {
            window.removeEventListener('resize', updatePosition)
            window.removeEventListener('scroll', updatePosition, true)
        }
    }, [showDropdown])

    const currentLanguage = ((i18n.resolvedLanguage || i18n.language || 'en').split('-')[0]) as 'en' | 'zh'
    const isPremium = user?.tier === 'premium'
    const buttonLabel = user ? user.email.split('@')[0] : t('sidebar.loginRegister', 'Login / Sign Up')
    const labelClass = `overflow-hidden whitespace-nowrap text-sm font-bold transition-[max-width,opacity,margin] duration-200 ease-out ${
        isCollapsed ? 'ml-0 max-w-0 opacity-0' : 'ml-3 max-w-[10rem] opacity-100'
    }`
    const handleOpenAuth = () => {
        setShowDropdown(false)
        setShowAuth(true)
    }
    const handleOpenGeneralSettings = () => {
        setShowDropdown(false)
        onNavigateToSettings?.('general')
    }
    const handleLanguageChange = (nextLanguage: 'en' | 'zh') => {
        void i18n.changeLanguage(nextLanguage)
        localStorage.setItem('i18nextLng', nextLanguage)
        setShowDropdown(false)
    }
    const initials = user?.email.charAt(0).toUpperCase() ?? 'U'

    return (
        <>
            <button
                ref={buttonRef}
                onClick={() => setShowDropdown(!showDropdown)}
                className="group flex h-14 w-full items-center overflow-hidden rounded-xl border border-transparent px-2.5 text-slate-700 transition-[background-color,border-color,color,box-shadow] duration-200 hover:border-slate-100 hover:bg-white hover:shadow-md dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                title={isCollapsed ? (user?.email || t('sidebar.loginRegister', 'Login / Sign Up')) : buttonLabel}
            >
                <div
                    className="relative h-9 w-9 shrink-0 rounded-xl text-sm font-bold text-white shadow-sm flex items-center justify-center"
                    style={{
                        background: isPremium
                            ? 'linear-gradient(135deg, #fbbf24, #f97316)'
                            : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))'
                    }}
                >
                    {user ? initials : <UserIcon size={18} />}
                    {isPremium && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-slate-900">
                            <Crown size={9} className="text-amber-900" />
                        </div>
                    )}
                </div>

                <span className={`${labelClass} text-slate-700 group-hover:text-primary-600 dark:text-slate-200 dark:group-hover:text-primary-400`}>
                    {buttonLabel}
                </span>
            </button>

            {showDropdown && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed w-72 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl ring-1 ring-slate-200/50 dark:ring-zinc-800 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200 z-[9999]"
                    style={{ bottom: dropdownStyle.bottom, left: dropdownStyle.left }}
                >
                    <div className={`p-4 ${user && isPremium ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20' : 'bg-gradient-to-br from-slate-50 to-primary-50/50 dark:from-slate-900 dark:to-zinc-900'}`}>
                        <div className="flex items-center gap-3">
                            <div
                                className="relative w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg ring-2 ring-white/50 dark:ring-white/10"
                                style={{
                                    background: user && isPremium
                                        ? 'linear-gradient(135deg, #fbbf24, #f97316)'
                                        : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))'
                                }}
                            >
                                {user ? initials : <UserIcon size={20} />}
                                {user && isPremium && (
                                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-slate-900">
                                        <Crown size={11} className="text-amber-900" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 dark:text-white truncate">
                                    {user ? user.email.split('@')[0] : t('sidebar.loginRegister', 'Login / Sign Up')}
                                </p>
                                {user && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate opacity-80">
                                        {user.email}
                                    </p>
                                )}
                                <div className="mt-2">
                                    {user && isPremium ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 dark:from-amber-900/50 dark:to-orange-900/50 dark:text-amber-300 shadow-sm border border-amber-200/50 dark:border-amber-700/50">
                                            <Crown size={10} />
                                            {t('sidebar.premiumMember', 'Premium Member')}
                                        </span>
                                    ) : user ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200/50 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                            {t('sidebar.freeAccount', 'Free Account')}
                                        </span>
                                    ) : null}
                                    {!user && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200/50 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                            {t('settings.subtitle', 'Preferences')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-2 space-y-1">
                        {user ? (
                            <button
                                onClick={handleAccountSettings}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800/80 hover:text-slate-900 dark:hover:text-white transition-all"
                            >
                                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                    <UserIcon size={18} />
                                </div>
                                {t('sidebar.accountSettings', 'Account Settings')}
                            </button>
                        ) : (
                            <button
                                onClick={handleOpenAuth}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800/80 hover:text-slate-900 dark:hover:text-white transition-all"
                            >
                                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                    <UserIcon size={18} />
                                </div>
                                {t('sidebar.loginRegister', 'Login / Sign Up')}
                            </button>
                        )}

                        <button
                            onClick={handleOpenGeneralSettings}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800/80 hover:text-slate-900 dark:hover:text-white transition-all"
                        >
                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                <Settings size={18} />
                            </div>
                            {t('sidebar.settingsTooltip', 'App Settings')}
                        </button>

                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                                <Languages size={14} />
                                {t('settings.general.language', 'Language')}
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                {(['zh', 'en'] as const).map((language) => {
                                    const selected = currentLanguage === language
                                    return (
                                        <button
                                            key={language}
                                            type="button"
                                            onClick={() => handleLanguageChange(language)}
                                            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                                selected
                                                    ? 'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700'
                                            }`}
                                        >
                                            {language === 'zh'
                                                ? t('settings.general.languageOptions.zh', '简体中文')
                                                : t('settings.general.languageOptions.en', 'English')}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {user && !isPremium && (
                            <button
                                onClick={handleUpgrade}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                            >
                                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-500">
                                    <Crown size={18} />
                                </div>
                                <div className="flex-1 text-left">
                                    <div>{t('sidebar.upgradeToPremium', 'Upgrade to Premium')}</div>
                                    <div className="text-xs text-amber-600/70 dark:text-amber-400/70 font-normal">{t('sidebar.unlockPremiumFeatures', 'Unlock all premium features')}</div>
                                </div>
                            </button>
                        )}

                        {user && (
                            <>
                                <div className="my-2 border-t border-slate-100 dark:border-zinc-800 mx-3" />
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-500">
                                        <LogOut size={18} />
                                    </div>
                                    {t('sidebar.logout', 'Log Out')}
                                </button>
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}

            <LoginModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
            <SubscriptionModal isOpen={showPay} onClose={() => setShowPay(false)} />
        </>
    )
}

type Page = 'add' | 'list' | 'review' | 'settings' | 'import' | 'translation' | 'stats' | 'chat' | 'admin'

interface SidebarProps {
    currentPage: Page
    setCurrentPage: (page: Page) => void
    onNavigateToSettings?: (tab?: string) => void
}

export default function Sidebar({ currentPage, setCurrentPage, onNavigateToSettings }: SidebarProps) {
    const { t } = useTranslation()
    const [isCollapsed, setIsCollapsed] = useState(false)
    const { dueCount } = useGlobalState()

    const isPageActive = (page: Page) => {
        if (page === 'add') return currentPage === 'add' || currentPage === 'import'
        if (page === 'chat') return currentPage === 'chat' || currentPage === 'translation'
        if (page === 'settings') return currentPage === 'settings' || currentPage === 'admin'
        return currentPage === page
    }

    const navItems = [
        { id: 'add' as Page, icon: <Home size={22} />, label: t('sidebar.add', 'Vocabulary Hub'), tooltip: t('sidebar.addTooltip', 'Search and add new words'), badge: 0 },
        { id: 'list' as Page, icon: <BookOpen size={22} />, label: t('sidebar.list', 'Word List'), tooltip: t('sidebar.listTooltip', 'Manage saved words'), badge: 0 },
        { id: 'review' as Page, icon: <Brain size={22} />, label: t('sidebar.review', 'Smart Review'), tooltip: t('sidebar.reviewTooltip', 'Review with the SM-2 algorithm'), badge: dueCount },
        { id: 'chat' as Page, icon: <Bot size={22} />, label: t('sidebar.chat', 'AI Partner'), tooltip: t('sidebar.chatTooltip', 'Conversation practice with long-term memory'), badge: 0 },
        { id: 'stats' as Page, icon: <BarChart2 size={22} />, label: t('sidebar.stats', 'Statistics'), tooltip: t('sidebar.statsTooltip', 'View learning progress and heatmap'), badge: 0 },
    ]

    return (
        <aside
            className={`glass-sidebar relative z-50 flex shrink-0 flex-col bg-white/80 backdrop-blur-xl transition-[width] duration-300 dark:bg-slate-900/80 ${isCollapsed ? 'w-20' : 'w-60'}`}
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
                    {t('app.brand', 'Smart VocabBook')}
                </h1>
            </div>

            {/* Navigation */}
            <nav className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setCurrentPage(item.id)}
                        className={`nav-item w-full overflow-hidden group ${isPageActive(item.id) ? 'active' : ''}`}
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
                            className={`flex-1 min-w-0 whitespace-nowrap transition-all duration-300 ml-3 text-left
                                ${isCollapsed ? 'opacity-0 w-0 ml-0' : 'opacity-100 w-auto'}`}
                        >
                            {item.label}
                        </span>
                        {item.badge > 0 && !isCollapsed && (
                            <span className="ml-auto px-2 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
                                {item.badge > 99 ? '99+' : item.badge}
                            </span>
                        )}
                        {isPageActive(item.id) && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-500 rounded-r-full" />
                        )}
                    </button>
                ))}
            </nav>

            {/* Footer Section */}
            <div className="shrink-0 p-3 pb-4">
                <UserAvatarDropdown onNavigateToSettings={onNavigateToSettings} isCollapsed={isCollapsed} />
            </div>
        </aside>
    )
}
