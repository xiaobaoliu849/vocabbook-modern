
import { useTheme } from '../context/ThemeContext'
import { useTranslation } from 'react-i18next'

interface ThemeToggleProps {
    className?: string
    collapsed?: boolean
}

export default function ThemeToggle({ className = '', collapsed = false }: ThemeToggleProps) {
    const { t } = useTranslation()
    const { isDark, toggleTheme } = useTheme()

    return (
        <button
            onClick={toggleTheme}
            className={`relative flex items-center gap-3 p-2 rounded-xl 
        text-warm-600 dark:text-warm-400 
        hover:bg-warm-100 dark:hover:bg-warm-800 
        border border-transparent hover:border-warm-200 dark:hover:border-warm-700
        transition-all duration-300
        ${className}`}
            title={isDark ? t('settings.general.switchToLightMode') : t('settings.general.switchToDarkMode')}
        >
            <div className="relative w-6 h-6 flex items-center justify-center">
                {/* Sun Icon */}
                <span
                    className={`absolute text-xl transition-all duration-500 transform ${isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
                        }`}
                >
                    ☀️
                </span>
                {/* Moon Icon */}
                <span
                    className={`absolute text-xl transition-all duration-500 transform ${isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
                        }`}
                >
                    🌙
                </span>
            </div>

            {!collapsed && (
                <span className="font-medium animate-fade-in whitespace-nowrap">
                    {isDark ? t('settings.general.darkMode') : t('settings.general.lightMode')}
                </span>
            )}
        </button>
    )
}
