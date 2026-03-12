import { useState, useRef, useEffect } from 'react'
import { User as UserIcon, LogOut, Crown, Settings, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { AuthModal } from './auth/AuthModal'
import { PaymentModal } from './pay/PaymentModal'

interface HeaderProps {
    onNavigateToSettings: (tab?: string) => void
}

export default function Header({ onNavigateToSettings }: HeaderProps) {
    const { t } = useTranslation()
    const { user, logout } = useAuth()
    const [showAuth, setShowAuth] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)
    const [showPay, setShowPay] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false)
            }
        }

        if (showDropdown) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [showDropdown])

    const handleLogout = () => {
        logout()
        setShowDropdown(false)
    }

    const handleAccountSettings = () => {
        setShowDropdown(false)
        onNavigateToSettings('account')
    }

    const handleUpgrade = () => {
        setShowDropdown(false)
        setShowPay(true)
    }

    // Not logged in - show login button
    if (!user) {
        return (
            <>
                <header className="h-14 shrink-0 flex items-center justify-end px-6 border-b border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                    <button
                        onClick={() => setShowAuth(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow-md"
                    >
                        <UserIcon size={16} />
                        <span>{t('sidebar.loginRegister')}</span>
                    </button>
                </header>
                <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
            </>
        )
    }

    const initials = user.email.charAt(0).toUpperCase()
    const isPremium = user.tier === 'premium'

    return (
        <>
            <header className="h-14 shrink-0 flex items-center justify-end px-6 border-b border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                {/* User Avatar Dropdown */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setShowDropdown(!showDropdown)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                    >
                        {/* Avatar */}
                        <div
                            className="relative w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold text-sm shadow-sm"
                            style={{
                                background: isPremium
                                    ? 'linear-gradient(135deg, #fbbf24, #f97316)'
                                    : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))'
                            }}
                        >
                            {initials}
                            {isPremium && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center shadow-sm">
                                    <Crown size={9} className="text-amber-800" />
                                </div>
                            )}
                        </div>
                        {/* Chevron */}
                        <ChevronDown
                            size={14}
                            className={`text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`}
                        />
                    </button>

                    {/* Dropdown Menu */}
                    {showDropdown && (
                        <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-700 overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top-right z-50">
                            {/* User Info Card */}
                            <div className={`p-4 ${isPremium ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20' : 'bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-900/20 dark:to-accent-900/20'}`}>
                                <div className="flex items-center gap-3">
                                    {/* Large Avatar */}
                                    <div
                                        className="relative w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-md"
                                        style={{
                                            background: isPremium
                                                ? 'linear-gradient(135deg, #fbbf24, #f97316)'
                                                : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))'
                                        }}
                                    >
                                        {initials}
                                        {isPremium && (
                                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center shadow-sm">
                                                <Crown size={11} className="text-amber-800" />
                                            </div>
                                        )}
                                    </div>
                                    {/* User Details */}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-slate-800 dark:text-white truncate">
                                            {user.email.split('@')[0]}
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                            {user.email}
                                        </p>
                                        {/* Tier Badge */}
                                        <div className="mt-1.5">
                                            {isPremium ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-amber-200 to-orange-200 text-amber-800 dark:from-amber-800/50 dark:to-orange-800/50 dark:text-amber-300">
                                                    <Crown size={10} />
                                                    {t('sidebar.premiumMember')}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                    {t('sidebar.freeAccount')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Menu Items */}
                            <div className="p-2">
                                {/* Account Settings */}
                                <button
                                    onClick={handleAccountSettings}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    <Settings size={16} className="text-slate-400" />
                                    {t('sidebar.accountSettings')}
                                </button>

                                {/* Upgrade Button (for free users) */}
                                {!isPremium && (
                                    <button
                                        onClick={handleUpgrade}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                    >
                                        <Crown size={16} className="text-amber-500" />
                                        {t('sidebar.upgradeToPremium')}
                                    </button>
                                )}

                                {/* Divider */}
                                <div className="my-2 border-t border-slate-100 dark:border-zinc-700" />

                                {/* Logout */}
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                    <LogOut size={16} />
                                    {t('sidebar.logout')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            <PaymentModal isOpen={showPay} onClose={() => setShowPay(false)} />
        </>
    )
}
