import { useState } from 'react'
import { Crown, Cloud, LogOut, Mail, Shield, Smartphone } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { SubscriptionModal } from '../../../components/SubscriptionModal'
import { useTranslation } from 'react-i18next'

export default function AccountSection({ onOpenAdmin }: { onOpenAdmin?: () => void }) {
    const { user, logout } = useAuth()
    const [showPay, setShowPay] = useState(false)
    const { t } = useTranslation()

    // Not logged in - show login prompt
    if (!user) {
        return (
            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{t('settings.account.title', '账户')}</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">{t('settings.account.desc', '管理您的账户信息和会员状态')}</p>
                </div>

                <div className="bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-900/20 dark:to-accent-900/20 rounded-2xl p-8 text-center border border-primary-100 dark:border-primary-800/30">
                    <div className="w-16 h-16 bg-primary-100 dark:bg-primary-800/30 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                        <Shield size={32} className="text-primary-600 dark:text-primary-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
                        {t('settings.account.loginForSync', '登录以使用云同步')}
                    </h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                        {t('settings.account.loginForSyncDesc', '登录后，您的生词本数据将自动同步到云端，支持多设备访问。')}
                    </p>
                </div>
            </div>
        )
    }

    const initials = user.email.charAt(0).toUpperCase()
    const isPremium = user.tier === 'premium'

    return (
        <div className="space-y-6">
            {/* Section Header */}
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{t('settings.account.title', '账户')}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">{t('settings.account.desc', '管理您的账户信息和会员状态')}</p>
            </div>

            {/* Profile Card */}
            <div className={`rounded-2xl p-6 border ${isPremium
                ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800/30'
                : 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 border-slate-200 dark:border-slate-700'
                }`}>
                <div className="flex items-start gap-5">
                    {/* Avatar */}
                    <div
                        className="relative w-20 h-20 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-lg shrink-0"
                        style={{
                            background: isPremium
                                ? 'linear-gradient(135deg, #fbbf24, #f97316)'
                                : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))'
                        }}
                    >
                        {initials}
                        {isPremium && (
                            <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center shadow-md ring-2 ring-white dark:ring-slate-900">
                                <Crown size={16} className="text-amber-800" />
                            </div>
                        )}
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                        <h4 className="text-xl font-bold text-slate-800 dark:text-white">
                            {user.email.split('@')[0]}
                        </h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1">
                            <Mail size={14} />
                            {user.email}
                        </p>

                        {/* Tier Badge */}
                        <div className="mt-3">
                            {isPremium ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-gradient-to-r from-amber-200 to-orange-200 text-amber-800 dark:from-amber-800/50 dark:to-orange-800/50 dark:text-amber-300 shadow-sm">
                                    <Crown size={14} />
                                    {t('settings.account.premium', '专业版会员')}
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                    {t('settings.account.free', '免费版')}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Membership Section */}
            {!isPremium && (
                <div className="rounded-2xl border border-amber-200 dark:border-amber-800/30 bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-amber-900/10 dark:to-orange-900/10 p-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-md shrink-0">
                            <Crown size={24} className="text-white" />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-semibold text-slate-800 dark:text-white mb-1">
                                {t('settings.account.upgradeTitle', '升级至专业版')}
                            </h4>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                                {t('settings.account.upgradeDesc', '解锁无限制 AI 生成、云端同步、多设备支持等高级功能')}
                            </p>
                            <button
                                onClick={() => setShowPay(true)}
                                className="px-5 py-2.5 rounded-xl text-sm font-semibold
                                    bg-gradient-to-r from-amber-400 to-orange-500
                                    hover:from-amber-500 hover:to-orange-600
                                    text-white shadow-lg shadow-amber-500/25
                                    transition-all hover:shadow-xl hover:shadow-amber-500/30 hover:-translate-y-0.5
                                    flex items-center gap-2"
                            >
                                <Crown size={16} />
                                {t('settings.account.upgradeBtn', '立即升级')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cloud Sync Status */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                        <Cloud size={20} className="text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-slate-800 dark:text-white">{t('settings.account.cloudSync', '云同步')}</h4>
                        <p className="text-xs text-green-600 dark:text-green-400">{t('settings.account.connected', '已连接')}</p>
                    </div>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('settings.account.cloudSyncDesc', '您的生词本数据已自动同步至云端，可在其他设备登录同一账户访问。')}
                </p>
            </div>

            {/* Device Info */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                        <Smartphone size={20} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-slate-800 dark:text-white">{t('settings.account.currentDevice', '当前设备')}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('settings.account.desktopApp', '桌面应用')}</p>
                    </div>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('settings.account.deviceSyncDesc', '此设备已登录您的账户，数据将实时同步。')}
                </p>
            </div>

            {onOpenAdmin && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-xl flex items-center justify-center">
                                    <Shield size={20} className="text-violet-600 dark:text-violet-400" />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-slate-800 dark:text-white">{t('admin.title', 'Cloud Admin')}</h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('sidebar.adminTooltip', 'Manage cloud users, tiers, and orders')}</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {t('admin.subtitle', 'Manage registered users, premium access, and payment orders from the deployed cloud API.')}
                            </p>
                        </div>
                        <button
                            onClick={onOpenAdmin}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-800/60 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30"
                        >
                            <Shield size={16} />
                            {t('sidebar.admin', 'Admin')}
                        </button>
                    </div>
                </div>
            )}

            {/* Logout Section */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                    onClick={logout}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                    <LogOut size={16} />
                    {t('settings.account.logout', '退出登录')}
                </button>
            </div>

            <SubscriptionModal isOpen={showPay} onClose={() => setShowPay(false)} />
        </div>
    )
}
