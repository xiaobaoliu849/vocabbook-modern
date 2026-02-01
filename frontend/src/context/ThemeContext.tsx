import React, { createContext, useContext, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'

type Theme = 'light' | 'dark'

interface ThemeContextType {
    theme: Theme
    toggleTheme: (e?: React.MouseEvent) => Promise<void>
    isDark: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem('theme')
        if (saved === 'dark' || saved === 'light') return saved
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    })


    // Use useLayoutEffect to ensure the class is added/removed synchronously after render
    // This allows flushSync to trigger the class update before the browser captures the new snapshot
    useLayoutEffect(() => {
        const root = document.documentElement
        if (theme === 'dark') {
            root.classList.add('dark')
        } else {
            root.classList.remove('dark')
        }
        localStorage.setItem('theme', theme)
    }, [theme])

    const toggleTheme = async (e?: React.MouseEvent) => {
        const newTheme = theme === 'light' ? 'dark' : 'light'

        // 如果浏览器不支持 View Transition API，直接切换
        if (!document.startViewTransition || !e) {
            setTheme(newTheme)
            return
        }

        // 添加类以禁用默认动画，启用手动圆圈动画
        document.documentElement.classList.add('circular-transition')

        // 获取点击位置
        const x = e.clientX
        const y = e.clientY

        // 计算圆的半径（从点击点到最远角落的距离）
        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
        ) * 1.2 // Add buffer to ensure full coverage

        // 开始 View Transition
        // @ts-ignore
        const transition = document.startViewTransition(() => {
            // Use flushSync to force React to update the DOM immediately
            // This ensures both the component tree AND the class (via useLayoutEffect) 
            // are updated before the browser captures the "New" snapshot.
            flushSync(() => {
                setTheme(newTheme)
            })
        })

        await transition.ready

        // 执行自定义动画
        const animation = document.documentElement.animate(
            {
                clipPath: [
                    `circle(25px at ${x}px ${y}px)`,
                    `circle(${endRadius}px at ${x}px ${y}px)`,
                ],
            },
            {
                duration: 750,
                easing: 'ease-in-out',
                // 指定伪元素进行动画
                pseudoElement: '::view-transition-new(root)',
                fill: 'forwards' // Keep the final state until the snapshot is removed
            }
        )

        // 确保动画持续期间拥有该类
        try {
            // Wait for the animation to finish
            await animation.finished
            // Also wait for the transition to completely finish (overlay removed)
            // before re-enabling CSS transitions on the real DOM.
            // This prevents any "snap" if the DOM is revealed before the class is active.
            await transition.finished
        } finally {
            document.documentElement.classList.remove('circular-transition')
        }
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
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
