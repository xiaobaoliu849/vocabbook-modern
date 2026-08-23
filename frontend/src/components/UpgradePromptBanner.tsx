
import { useTranslation } from 'react-i18next'
import { Sparkles, ArrowRight, LogIn } from 'lucide-react'

interface UpgradePromptBannerProps {
    isLoggedIn: boolean
    freeUsageLeft?: number
    onLoginClick: () => void
    onUpgradeClick: () => void
    className?: string
}

export default function UpgradePromptBanner({ 
    isLoggedIn, 
    freeUsageLeft, 
    onLoginClick, 
    onUpgradeClick,
    className = ''
}: UpgradePromptBannerProps) {
    const { t } = useTranslation()

    if (!isLoggedIn) {
        return (
            <div className={`rounded-2xl border border-primary-200 dark:border-primary-900/50 bg-primary-50/50 dark:bg-primary-900/20 p-4 ${className}`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-800/50 text-primary-600 dark:text-primary-400">
                            <LogIn size={20} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-warm-800 dark:text-warm-200">
                                {t('upgrade.banner.loginTitle', '登录以同步数据并解锁更多额度')}
                            </h3>
                            <p className="text-sm text-warm-600 dark:text-warm-400 mt-0.5">
                                {t('upgrade.banner.loginDesc', '创建免费账户，保存您的对话记录和词汇。')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onLoginClick}
                        className="shrink-0 flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
                    >
                        {t('upgrade.banner.loginBtn', '立即登录')}
                        <ArrowRight size={16} />
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className={`rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 ${className}`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/20">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-warm-800 dark:text-warm-200 flex items-center gap-2">
                            {t('upgrade.banner.upgradeTitle', '升级至 Premium 体验完整功能')}
                            {freeUsageLeft !== undefined && (
                                <span className="inline-flex items-center rounded-md bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                                    {t('upgrade.banner.freeLeft', { count: freeUsageLeft })}
                                </span>
                            )}
                        </h3>
                        <p className="text-sm text-warm-600 dark:text-warm-400 mt-0.5">
                            {t('upgrade.banner.upgradeDesc', '无限次对话、云端同步、全部 AI 模型。')}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onUpgradeClick}
                    className="shrink-0 flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-medium text-white hover:from-amber-600 hover:to-orange-600 shadow-md transition-all active:scale-95"
                >
                    <Sparkles size={16} />
                    {t('upgrade.banner.upgradeBtn', '升级 Premium')}
                </button>
            </div>
        </div>
    )
}
