import { useState, useEffect } from 'react'
import { RefreshCw, Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

interface UpdateInfo {
    version?: string
    releaseDate?: string
    releaseNotes?: string
    percent?: number
    bytesPerSecond?: number
    transferred?: number
    total?: number
}

export default function AboutSection() {
    const { t } = useTranslation()
    const [appVersion, setAppVersion] = useState('2.0.0')
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
    const [errorMessage, setErrorMessage] = useState<string>('')
    const isElectron = typeof window !== 'undefined' && window.isElectron

    useEffect(() => {
        if (isElectron && window.electronAPI) {
            // Get current app version
            window.electronAPI.getAppVersion().then(setAppVersion).catch(console.error)

            // Listen for update status
            window.electronAPI.onUpdateStatus((status, data) => {
                setUpdateStatus(status as UpdateStatus)
                if (status === 'error') {
                    setErrorMessage(data as string)
                } else if (data) {
                    setUpdateInfo(data as UpdateInfo)
                }
            })

            return () => {
                window.electronAPI?.removeUpdateStatusListener()
            }
        }
    }, [isElectron])

    const handleCheckUpdate = async () => {
        if (!window.electronAPI) return
        setUpdateStatus('checking')
        setErrorMessage('')
        try {
            await window.electronAPI.checkForUpdates()
        } catch (err) {
            setUpdateStatus('error')
            setErrorMessage((err as Error).message || t('settings.about.checkUpdateFailed', '检查更新失败'))
        }
    }

    const handleDownload = async () => {
        if (!window.electronAPI) return
        try {
            await window.electronAPI.downloadUpdate()
        } catch (err) {
            setUpdateStatus('error')
            setErrorMessage((err as Error).message || t('settings.about.downloadFailed', '下载失败'))
        }
    }

    const handleInstall = () => {
        if (!window.electronAPI) return
        window.electronAPI.installUpdate()
    }

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    const renderUpdateButton = () => {
        if (!isElectron) {
            return (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                    {t('settings.about.updateOnlyInPackaged', '自动更新仅在打包后的应用中可用')}
                </p>
            )
        }

        switch (updateStatus) {
            case 'checking':
                return (
                    <button disabled className="btn-secondary flex items-center gap-2 opacity-70">
                        <Loader2 size={16} className="animate-spin" />
                        {t('settings.about.checkingUpdate', '正在检查更新...')}
                    </button>
                )
            case 'available':
                return (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle size={18} />
                            <span>{t('settings.about.newVersionFound', '发现新版本 v')}{updateInfo?.version}</span>
                        </div>
                        <button onClick={handleDownload} className="btn-primary flex items-center gap-2">
                            <Download size={16} />
                            {t('settings.about.downloadUpdate', '下载更新')}
                        </button>
                    </div>
                )
            case 'downloading':
                return (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 dark:text-slate-400">{t('settings.about.downloading', '下载中...')}</span>
                            <span className="text-primary-600 dark:text-primary-400 font-medium">
                                {updateInfo?.percent?.toFixed(1) || 0}%
                            </span>
                        </div>
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-300"
                                style={{ width: `${updateInfo?.percent || 0}%` }}
                            />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatBytes(updateInfo?.transferred || 0)} / {formatBytes(updateInfo?.total || 0)}
                            {updateInfo?.bytesPerSecond && ` · ${formatBytes(updateInfo.bytesPerSecond)}/s`}
                        </p>
                    </div>
                )
            case 'downloaded':
                return (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle size={18} />
                            <span>{t('settings.about.downloadComplete', '更新已下载完成')}</span>
                        </div>
                        <button onClick={handleInstall} className="btn-primary flex items-center gap-2">
                            <RefreshCw size={16} />
                            {t('settings.about.installAndRestart', '立即安装并重启')}
                        </button>
                    </div>
                )
            case 'not-available':
                return (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                            <CheckCircle size={18} className="text-emerald-500" />
                            <span>{t('settings.about.isLatestVersion', '当前已是最新版本')}</span>
                        </div>
                        <button onClick={handleCheckUpdate} className="btn-secondary flex items-center gap-2">
                            <RefreshCw size={16} />
                            {t('settings.about.recheck', '重新检查')}
                        </button>
                    </div>
                )
            case 'error':
                return (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                            <AlertCircle size={18} />
                            <span>{errorMessage || t('settings.about.checkUpdateError', '检查更新时出错')}</span>
                        </div>
                        <button onClick={handleCheckUpdate} className="btn-secondary flex items-center gap-2">
                            <RefreshCw size={16} />
                            {t('settings.about.retry', '重试')}
                        </button>
                    </div>
                )
            default:
                return (
                    <button onClick={handleCheckUpdate} className="btn-primary flex items-center gap-2">
                        <RefreshCw size={16} />
                        {t('settings.about.checkUpdate', '检查更新')}
                    </button>
                )
        }
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                    {t('settings.about.title', 'About')}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    {t('settings.about.desc', '版本信息与软件更新')}
                </p>
            </div>

            {/* Version Info Card */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    ℹ️ {t('settings.about.versionInfo', 'Version Information')}
                </h3>

                <div className="text-slate-600 dark:text-slate-400 space-y-4">
                    <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100 text-lg">{t('settings.about.appName', '智能生词本 Modern')}</p>
                        <p className="text-sm opacity-80">{t('settings.about.versionLabel', 'Version')} {appVersion}</p>
                    </div>

                    <p>{t('settings.about.appDesc', '使用 React + FastAPI + AI 构建的现代化英语学习工具')}</p>

                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-sm leading-relaxed">
                        <p className="font-medium mb-1">{t('settings.about.features', '主要特性：')}</p>
                        <ul className="list-disc list-inside space-y-1 ml-1 opacity-90">
                            <li>{t('settings.about.feature1', 'SM-2 间隔重复记忆算法')}</li>
                            <li>{t('settings.about.feature2', 'AI 智能生成例句与助记')}</li>
                            <li>{t('settings.about.feature3', '多维词典聚合查询')}</li>
                            <li>{t('settings.about.feature4', '现代化 Glassmorphism UI 设计')}</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Update Card */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    🔄 {t('settings.about.softwareUpdate', '软件更新')}
                </h3>

                <div className="space-y-4">
                    {renderUpdateButton()}
                </div>
            </div>

            {/* Footer */}
            <div className="text-center pt-4">
                <p className="text-xs text-slate-400">
                    {t('settings.about.footer', 'Designed with ❤️ by VocabBook Team')}
                </p>
            </div>
        </div>
    )
}
