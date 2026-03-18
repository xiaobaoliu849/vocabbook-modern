import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextType {
    theme: Theme
    resolvedTheme: ResolvedTheme
    setTheme: (theme: Theme) => void
    toggleTheme: (e?: React.MouseEvent) => Promise<void>
    isDark: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)
const SETTINGS_THEME_TRANSITION_MS = 540
const QUICK_TOGGLE_THEME_TRANSITION_MS = 620

function getSystemTheme(): ResolvedTheme {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(theme: Theme, systemTheme: ResolvedTheme): ResolvedTheme {
    return theme === 'system' ? systemTheme : theme
}

function applyResolvedThemeToRoot(theme: ResolvedTheme) {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, rawSetTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem('theme')
        if (saved === 'dark' || saved === 'light' || saved === 'system') return saved
        return 'system'
    })
    const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme())
    const isTransitioningRef = useRef(false)
    const cleanupFrameRef = useRef<number | null>(null)

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        const syncTheme = () => setSystemTheme(mediaQuery.matches ? 'dark' : 'light')
        syncTheme()

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', syncTheme)
            return () => mediaQuery.removeEventListener('change', syncTheme)
        }

        mediaQuery.addListener(syncTheme)
        return () => mediaQuery.removeListener(syncTheme)
    }, [])

    const resolvedTheme: ResolvedTheme = resolveTheme(theme, systemTheme)

    const cleanupThemeSwitching = () => {
        if (cleanupFrameRef.current !== null) {
            cancelAnimationFrame(cleanupFrameRef.current)
            cleanupFrameRef.current = null
        }
        document.documentElement.classList.remove('theme-switching')
        document.documentElement.classList.remove('circular-transition')
    }

    const scheduleThemeSwitchCleanup = () => {
        if (cleanupFrameRef.current !== null) {
            cancelAnimationFrame(cleanupFrameRef.current)
            cleanupFrameRef.current = null
        }
        cleanupFrameRef.current = requestAnimationFrame(() => {
            cleanupFrameRef.current = requestAnimationFrame(() => {
                cleanupThemeSwitching()
            })
        })
    }

    const commitTheme = (nextTheme: Theme) => {
        flushSync(() => {
            rawSetTheme(nextTheme)
        })
        applyResolvedThemeToRoot(resolveTheme(nextTheme, systemTheme))
    }

    const runThemeTransition = async (
        nextTheme: Theme,
        origin?: { x: number; y: number },
    ) => {
        if (nextTheme === theme || isTransitioningRef.current) {
            return
        }

        if (!document.startViewTransition) {
            document.documentElement.classList.add('theme-switching')
            commitTheme(nextTheme)
            scheduleThemeSwitchCleanup()
            return
        }

        cleanupThemeSwitching()
        document.documentElement.classList.add('theme-switching')
        document.documentElement.classList.add('circular-transition')
        isTransitioningRef.current = true

        const transitionOrigin = origin ?? (
            nextTheme === 'dark'
                ? { x: 0, y: 0 }
                : { x: window.innerWidth, y: window.innerHeight }
        )
        const endRadius = Math.hypot(
            Math.max(transitionOrigin.x, window.innerWidth - transitionOrigin.x),
            Math.max(transitionOrigin.y, window.innerHeight - transitionOrigin.y)
        ) * 1.1

        try {
            const transition = document.startViewTransition(() => {
                commitTheme(nextTheme)
            })

            await transition.ready

            const animation = document.documentElement.animate(
                {
                    clipPath: [
                        `circle(0px at ${transitionOrigin.x}px ${transitionOrigin.y}px)`,
                        `circle(${endRadius}px at ${transitionOrigin.x}px ${transitionOrigin.y}px)`,
                    ],
                    opacity: [0.92, 1],
                },
                {
                    duration: origin ? QUICK_TOGGLE_THEME_TRANSITION_MS : SETTINGS_THEME_TRANSITION_MS,
                    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    pseudoElement: '::view-transition-new(root)',
                    fill: 'forwards',
                }
            )

            await animation.finished
            await transition.finished
        } finally {
            isTransitioningRef.current = false
            cleanupThemeSwitching()
        }
    }

    const setTheme = (nextTheme: Theme) => {
        void runThemeTransition(nextTheme)
    }


    // Use useLayoutEffect to ensure the class is added/removed synchronously after render
    // This allows flushSync to trigger the class update before the browser captures the new snapshot
    useLayoutEffect(() => {
        applyResolvedThemeToRoot(resolvedTheme)
        localStorage.setItem('theme', theme)
    }, [resolvedTheme, theme])

    useEffect(() => {
        return () => {
            cleanupThemeSwitching()
        }
    }, [])

    const toggleTheme = async (e?: React.MouseEvent) => {
        const newTheme: Theme = resolvedTheme === 'light' ? 'dark' : 'light'
        if (!e) {
            await runThemeTransition(newTheme)
            return
        }

        await runThemeTransition(newTheme, { x: e.clientX, y: e.clientY })
    }

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme, isDark: resolvedTheme === 'dark' }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}
