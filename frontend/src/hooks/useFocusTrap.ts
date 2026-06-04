import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(isOpen: boolean) {
    const containerRef = useRef<HTMLDivElement>(null)
    const previousFocusRef = useRef<HTMLElement | null>(null)

    useEffect(() => {
        if (!isOpen) return

        previousFocusRef.current = document.activeElement as HTMLElement

        const timer = setTimeout(() => {
            const container = containerRef.current
            if (!container) return

            const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
            if (focusable.length > 0) {
                focusable[0].focus()
            }
        }, 50)

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return
            const container = containerRef.current
            if (!container) return

            const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
            if (focusable.length === 0) return

            const first = focusable[0]
            const last = focusable[focusable.length - 1]

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault()
                    last.focus()
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault()
                    first.focus()
                }
            }
        }

        document.addEventListener('keydown', handleKeyDown)

        return () => {
            clearTimeout(timer)
            document.removeEventListener('keydown', handleKeyDown)
            if (previousFocusRef.current) {
                previousFocusRef.current.focus()
            }
        }
    }, [isOpen])

    return containerRef
}
