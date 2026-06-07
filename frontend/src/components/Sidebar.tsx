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
    const labelClass = `overflow-hidden whitespace-nowrap text-[13px] font-medium transition-[max-width,opacity,margin] duration-200 ease-out ${
        isCollapsed ? 'ml-0 max-w-0 opacity-0' : 'ml-2.5 max-w-[10rem] opacity-100'
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
                className="group flex h-11 w-full items-center overflow-hidden rounded-lg
                    px-2 text-stone-700 transition-colors duration-150
                    hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
                title={isCollapsed ? (user?.email || t('sidebar.loginRegister', 'Login / Sign Up')) : buttonLabel}
            >
                <div
                    className={`relative h-7 w-7 shrink-0 rounded-lg text-xs font-bold text-white flex items-center justify-center ${isPremium ? 'premium-gradient' : 'avatar-gradient'}`}
                >
                    {user ? initials : <UserIcon size={18} />}
                    {isPremium && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-slate-900">
                            <Crown size={9} className="text-amber-900" />
                        </div>
                    )}
                </div>

                <span className={`${labelClass} text-stone-700 dark:text-stone-200`}>
                    {buttonLabel}
                </span>
            </button>

            {showDropdown && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed w-72 bg-white dark:bg-[#252525] rounded-xl shadow-lg ring-1 ring-stone-200/60 dark:ring-stone-800 overflow-hidden z-[9999]"
                    style={{ bottom: dropdownStyle.bottom, left: dropdownStyle.left }}
                >
                    <div className={`p-4 ${user && isPremium ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20' : 'bg-gradient-to-br from-slate-50 to-primary-50/50 dark:from-slate-900 dark:to-slate-900'}`}>
                        <div className="flex items-center gap-3">
                            <div
                                className={`relative w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg ring-2 ring-white/50 dark:ring-white/10 ${user && isPremium ? 'premium-gradient' : 'avatar-gradient'}`}
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
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white transition-all"
                            >
                                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                    <UserIcon size={18} />
                                </div>
                                {t('sidebar.accountSettings', 'Account Settings')}
                            </button>
                        ) : (
                            <button
                                onClick={handleOpenAuth}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white transition-all"
                            >
                                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                    <UserIcon size={18} />
                                </div>
                                {t('sidebar.loginRegister', 'Login / Sign Up')}
                            </button>
                        )}

                        <button
                            onClick={handleOpenGeneralSettings}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white transition-all"
                        >
                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                <Settings size={18} />
                            </div>
                            {t('sidebar.settingsTooltip', 'App Settings')}
                        </button>

                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
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
                                <div className="my-2 border-t border-slate-100 dark:border-slate-800 mx-3" />
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
        { id: 'add' as Page, icon: <Home size={18} />, label: t('sidebar.add', 'Vocabulary Hub'), tooltip: t('sidebar.addTooltip', 'Search and add new words'), badge: 0 },
        { id: 'list' as Page, icon: <BookOpen size={18} />, label: t('sidebar.list', 'Word List'), tooltip: t('sidebar.listTooltip', 'Manage saved words'), badge: 0 },
        { id: 'review' as Page, icon: <Brain size={18} />, label: t('sidebar.review', 'Smart Review'), tooltip: t('sidebar.reviewTooltip', 'Review with the SM-2 algorithm'), badge: dueCount },
        { id: 'chat' as Page, icon: <Bot size={18} />, label: t('sidebar.chat', 'AI Partner'), tooltip: t('sidebar.chatTooltip', 'Conversation practice with long-term memory'), badge: 0 },
        { id: 'stats' as Page, icon: <BarChart2 size={18} />, label: t('sidebar.stats', 'Statistics'), tooltip: t('sidebar.statsTooltip', 'View learning progress and heatmap'), badge: 0 },
    ]

    return (
        <aside
            className={`glass-sidebar relative z-50 flex shrink-0 flex-col transition-[width] duration-300 ease-in-out ${isCollapsed ? 'w-[60px]' : 'w-56'}`}
        >
            {/* Header: Logo + Collapse toggle */}
            <div className="h-14 flex items-center shrink-0 px-3 gap-2">
                {/* Collapse toggle */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-md
                        text-stone-400 hover:text-stone-700 dark:hover:text-stone-200
                        hover:bg-stone-100 dark:hover:bg-stone-800
                        transition-colors duration-150"
                    title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>

                {/* App name — plain, typographic, no gradient */}
                <span
                    className={`font-semibold text-sm text-stone-800 dark:text-stone-100
                        whitespace-nowrap transition-all duration-200 overflow-hidden
                        ${isCollapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[10rem]'}`}
                >
                    {t('app.brand', 'Smart VocabBook')}
                </span>
            </div>

            {/* Divider */}
            <div className="mx-3 border-t border-stone-200/80 dark:border-stone-800/60" />

            {/* Navigation */}
            <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3 space-y-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setCurrentPage(item.id)}
                        className={`nav-item w-full overflow-hidden ${isPageActive(item.id) ? 'active' : ''}`}
                        title={isCollapsed ? item.tooltip : ''}
                    >
                        {/* Icon */}
                        <span className="shrink-0 relative flex items-center justify-center">
                            {item.icon}
                            {/* Badge dot when collapsed */}
                            {item.badge > 0 && isCollapsed && (
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2
                                    bg-red-400 rounded-full border-2 border-stone-50 dark:border-[#191919]" />
                            )}
                        </span>

                        {/* Label — CSS transition, not conditional render, for smooth slide */}
                        <span
                            className={`flex-1 min-w-0 text-left text-sm whitespace-nowrap
                                transition-[opacity,max-width,margin] duration-300 ease-in-out
                                ${isCollapsed ? 'opacity-0 max-w-0 overflow-hidden ml-0' : 'opacity-100 max-w-[12rem] ml-0'}`}
                        >
                            {item.label}
                        </span>

                        {/* Badge count (expanded) */}
                        {item.badge > 0 && (
                            <span
                                className={`text-[11px] font-semibold px-1.5 py-0.5
                                    bg-stone-200/80 dark:bg-stone-700
                                    text-stone-600 dark:text-stone-300
                                    rounded tabular-nums
                                    transition-[opacity,max-width] duration-300
                                    ${isCollapsed ? 'opacity-0 max-w-0 overflow-hidden' : 'opacity-100 max-w-[4rem] ml-auto'}`}
                            >
                                {item.badge > 99 ? '99+' : item.badge}
                            </span>
                        )}
                    </button>
                ))}
            </nav>

            {/* Footer: User avatar */}
            <div className="shrink-0 px-2 pb-3">
                <div className="border-t border-stone-200/80 dark:border-stone-800/60 mb-2" />
                <UserAvatarDropdown onNavigateToSettings={onNavigateToSettings} isCollapsed={isCollapsed} />
            </div>
        </aside>
    )
}
