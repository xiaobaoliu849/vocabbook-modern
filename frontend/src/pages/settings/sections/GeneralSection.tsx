import { useTheme } from '../../../context/ThemeContext'
import { useState, useEffect } from 'react'
import { Check, Volume2, Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'


export default function GeneralSection() {
    const { isDark, toggleTheme } = useTheme()
    const { t, i18n } = useTranslation()
    const currentLanguage = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0]

    const [accent, setAccent] = useState<'us' | 'uk'>(() =>
        (localStorage.getItem('preferred_accent') as 'us' | 'uk') || 'us'
    )

    useEffect(() => {
        localStorage.setItem('preferred_accent', accent)
    }, [accent])

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                    {t('settings.general.title', 'General Settings')}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    {t('settings.general.desc', 'Customize the app appearance and basic preferences')}
                </p>
            </div>

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    🎨 {t('settings.general.appearance', 'Appearance')}
                </h3>

                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-medium text-slate-700 dark:text-slate-300">{t('settings.general.darkMode', 'Dark Mode')}</div>
                        <div className="text-sm text-slate-500">{t('settings.general.darkModeDesc', 'Switch between light and dark themes')}</div>
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
                    <Globe className="text-primary-500" size={20} />
                    {t('settings.general.language', '语言 (Language)')}
                </h3>

                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-medium text-slate-700 dark:text-slate-300">{t('settings.general.displayLanguage', '显示语言')}</div>
                        <div className="text-sm text-slate-500">{t('settings.general.languageDesc', '更改应用程序的界面语言')}</div>
                    </div>
                    
                    <div className="relative">
                        <select
                            value={currentLanguage}
                            onChange={(e) => {
                                const nextLanguage = e.target.value
                                i18n.changeLanguage(nextLanguage)
                                localStorage.setItem('i18nextLng', nextLanguage)
                            }}
                            className="appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 py-2 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all font-medium"
                        >
                            <option value="en">{t('settings.general.languageOptions.en', 'English')}</option>
                            <option value="zh">{t('settings.general.languageOptions.zh', 'Chinese (Simplified)')}</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                        </div>
                    </div>
                </div>
            </div>

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                    <Volume2 className="text-primary-500" size={20} />
                    {t('settings.general.pronunciation', 'Pronunciation Preference')}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* US Accent Card */}
                    <button
                        onClick={() => setAccent('us')}
                        className={`relative group flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all duration-300 ${accent === 'us'
                            ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10 ring-4 ring-primary-500/10 shadow-lg shadow-primary-500/10'
                            : 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md'
                            }`}
                    >
                        <div className={`text-4xl w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border transition-colors ${
                            accent === 'us'
                                ? 'bg-white dark:bg-slate-800 border-primary-200 dark:border-primary-800'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 group-hover:bg-white'
                        }`}>
                            <span className="transform group-hover:scale-110 transition-transform duration-300">🇺🇸</span>
                        </div>
                        <div>
                            <div className={`font-bold text-lg mb-1 transition-colors ${accent === 'us' ? 'text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200'}`}>{t('settings.general.usEnglish', 'American English')}</div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('settings.general.usAccentLabel', 'General American')}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-black/20 px-2 py-1 rounded-md inline-block border border-slate-100 dark:border-slate-700/50">
                                {t('settings.general.usEnglishDesc', 'Rhotic accent · energetic and expressive')}
                            </div>
                        </div>
                        {accent === 'us' && (
                            <div className="absolute top-4 right-4 text-white bg-primary-500 rounded-full p-1 shadow-sm animate-scale-in">
                                <Check size={14} strokeWidth={3} />
                            </div>
                        )}
                    </button>

                    {/* UK Accent Card */}
                    <button
                        onClick={() => setAccent('uk')}
                        className={`relative group flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all duration-300 ${accent === 'uk'
                            ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10 ring-4 ring-primary-500/10 shadow-lg shadow-primary-500/10'
                            : 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md'
                            }`}
                    >
                        <div className={`text-4xl w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border transition-colors ${
                            accent === 'uk'
                                ? 'bg-white dark:bg-slate-800 border-primary-200 dark:border-primary-800'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 group-hover:bg-white'
                        }`}>
                            <span className="transform group-hover:scale-110 transition-transform duration-300">🇬🇧</span>
                        </div>
                        <div>
                            <div className={`font-bold text-lg mb-1 transition-colors ${accent === 'uk' ? 'text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200'}`}>{t('settings.general.ukEnglish', 'British English')}</div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('settings.general.ukAccentLabel', 'Received Pronunciation')}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-black/20 px-2 py-1 rounded-md inline-block border border-slate-100 dark:border-slate-700/50">
                                {t('settings.general.ukEnglishDesc', 'Clear articulation · elegant and restrained')}
                            </div>
                        </div>
                        {accent === 'uk' && (
                            <div className="absolute top-4 right-4 text-white bg-primary-500 rounded-full p-1 shadow-sm animate-scale-in">
                                <Check size={14} strokeWidth={3} />
                            </div>
                        )}
                    </button>
                </div>
            </div>

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    {t('shortcuts.title', '⌨️ Keyboard Shortcuts')}
                </h3>

                <div className="space-y-4">
                    <div>
                        <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                            {t('shortcuts.global', 'Global')}
                        </h4>
                        <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50">
                            <span className="text-slate-700 dark:text-slate-300">{t('shortcuts.showHideWindow', 'Show / Hide Window')}</span>
                            <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500 dark:text-slate-400">
                                Ctrl + Alt + V
                            </kbd>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                            {t('shortcuts.reviewMode', 'Review Mode')}
                        </h4>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50">
                                <span className="text-slate-700 dark:text-slate-300">{t('shortcuts.flipCardDetailed', 'Reveal Answer / Flip Card')}</span>
                                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500 dark:text-slate-400">
                                    Space
                                </kbd>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50">
                                <span className="text-slate-700 dark:text-slate-300">{t('shortcuts.rateMemory', 'Rate Memory Strength')}</span>
                                <div className="flex gap-1">
                                    <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500 dark:text-slate-400">1</kbd>
                                    <span className="text-slate-400 text-xs flex items-center">-</span>
                                    <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500 dark:text-slate-400">5</kbd>
                                </div>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50">
                                <span className="text-slate-700 dark:text-slate-300">{t('shortcuts.playPronunciation', 'Play Pronunciation')}</span>
                                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500 dark:text-slate-400">
                                    P
                                </kbd>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                            {t('shortcuts.common', 'Common')}
                        </h4>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50">
                                <span className="text-slate-700 dark:text-slate-300">{t('shortcuts.searchConfirm', 'Search / Confirm')}</span>
                                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-mono text-slate-500 dark:text-slate-400">
                                    Enter
                                </kbd>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50">
                                <span className="text-slate-700 dark:text-slate-300">{t('shortcuts.closeModal', 'Close Dialog')}</span>
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
