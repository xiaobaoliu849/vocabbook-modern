/**
 * 性能优化工具函数
 */

import { useRef, useCallback, useEffect, useState } from 'react'

/**
 * Debounce 函数
 * 延迟执行，在指定时间内只执行最后一次调用
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    return function (...args: Parameters<T>) {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
        timeoutId = setTimeout(() => {
            func(...args)
        }, wait)
    }
}

/**
 * useDebounce Hook - 对值进行防抖
 */
export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value)
        }, delay)

        return () => {
            clearTimeout(timer)
        }
    }, [value, delay])

    return debouncedValue
}

/**
 * useDebouncedCallback Hook - 对回调函数进行防抖
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
    callback: T,
    delay: number
): (...args: Parameters<T>) => void {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const callbackRef = useRef(callback)

    // 保持回调引用最新
    useEffect(() => {
        callbackRef.current = callback
    }, [callback])

    // 清理定时器
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
            }
        }
    }, [])

    return useCallback((...args: Parameters<T>) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(() => {
            callbackRef.current(...args)
        }, delay)
    }, [delay])
}

/**
 * 全局 Audio 实例池
 * 复用 Audio 对象避免频繁创建
 */
class AudioPool {
    private pool: Map<string, HTMLAudioElement> = new Map()
    private maxSize = 10

    /**
     * 获取或创建 Audio 实例
     */
    get(src: string): HTMLAudioElement {
        if (this.pool.has(src)) {
            return this.pool.get(src)!
        }

        // 如果池满了，移除最旧的
        if (this.pool.size >= this.maxSize) {
            const firstKey = this.pool.keys().next().value
            if (firstKey) {
                this.pool.delete(firstKey)
            }
        }

        const audio = new Audio(src)
        this.pool.set(src, audio)
        return audio
    }

    /**
     * 播放音频
     */
    play(src: string): Promise<void> {
        const audio = this.get(src)
        audio.currentTime = 0
        return audio.play().catch(err => {
            console.warn('Audio play failed:', err)
        })
    }

    /**
     * 清空池
     */
    clear() {
        this.pool.forEach(audio => {
            audio.pause()
            audio.src = ''
        })
        this.pool.clear()
    }
}

// 导出全局单例
export const audioPool = new AudioPool()

/**
 * useAudio Hook - 封装音频播放逻辑
 */
export function useAudio() {
    const play = useCallback((src: string) => {
        return audioPool.play(src)
    }, [])

    const playWord = useCallback((word: string, type: 1 | 2 = 2) => {
        const src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`
        return audioPool.play(src)
    }, [])

    return { play, playWord }
}
