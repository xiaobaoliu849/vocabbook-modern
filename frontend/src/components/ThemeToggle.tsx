
import { useTheme } from '../context/ThemeContext'

interface ThemeToggleProps {
    className?: string
    collapsed?: boolean
}

export default function ThemeToggle({ className = '', collapsed = false }: ThemeToggleProps) {
    const { isDark, toggleTheme } = useTheme()

    return (
        <button
            onClick={toggleTheme}
            className={`relative flex items-center gap-3 p-2 rounded-xl 
        text-slate-600 dark:text-slate-400 
        hover:bg-slate-100 dark:hover:bg-slate-800 
        border border-transparent hover:border-slate-200 dark:hover:border-slate-700
        transition-all duration-300
        ${className}`}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
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
                    {isDark ? '深色模式' : '浅色模式'}
                </span>
            )}
        </button>
    )
}
