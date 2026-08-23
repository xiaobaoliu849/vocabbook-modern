import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
    id: number
    message: string
    type: ToastType
}

interface ConfirmState {
    message: string
    resolve: (value: boolean) => void
}

interface ToastContextValue {
    toast: (message: string, type?: ToastType) => void
    confirmDialog: (message: string) => Promise<boolean>
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
    const ctx = useContext(ToastContext)
    if (!ctx) throw new Error('useToast must be used within ToastProvider')
    return ctx
}

const icons: Record<ToastType, typeof CheckCircle> = {
    success: CheckCircle,
    error: XCircle,
    info: Info,
    warning: AlertTriangle,
}

const colors: Record<ToastType, string> = {
    success: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
    error: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400',
    info: 'bg-primary-50 dark:bg-primary-500/10 border-primary-200 dark:border-primary-500/30 text-primary-700 dark:text-primary-400',
    warning: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400',
}

const iconColors: Record<ToastType, string> = {
    success: 'text-emerald-500',
    error: 'text-red-500',
    info: 'text-primary-500',
    warning: 'text-amber-500',
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])
    const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
    // Mirror of confirmState so a second confirmDialog can resolve the
    // previous one without depending on async state updates.
    const confirmStateRef = useRef<ConfirmState | null>(null)
    const nextId = useRef(0)

    const toast = useCallback((message: string, type: ToastType = 'info') => {
        const id = nextId.current++
        setToasts(prev => [...prev, { id, message, type }])
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 3000)
    }, [])

    const dismissToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const confirmDialog = useCallback((message: string): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            // A new dialog replaces any pending one; resolve the old promise
            // as "dismissed" so its awaiting caller never hangs forever.
            const previous = confirmStateRef.current
            if (previous) {
                previous.resolve(false)
            }
            const next: ConfirmState = { message, resolve }
            confirmStateRef.current = next
            setConfirmState(next)
        })
    }, [])

    const handleConfirm = useCallback((result: boolean) => {
        if (confirmStateRef.current) {
            confirmStateRef.current.resolve(result)
            confirmStateRef.current = null
        }
        setConfirmState(null)
    }, [])

    return (
        <ToastContext.Provider value={{ toast, confirmDialog }}>
            {children}
            {createPortal(
                <>
                    {/* Toast stack */}
                    <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2 max-w-sm pointer-events-none">
                        {toasts.map(t => {
                            const Icon = icons[t.type]
                            return (
                                <div
                                    key={t.id}
                                    className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg animate-slide-in-right backdrop-blur-sm ${colors[t.type]}`}
                                >
                                    <Icon size={18} className={`shrink-0 mt-0.5 ${iconColors[t.type]}`} />
                                    <p className="text-sm font-medium flex-1">{t.message}</p>
                                    <button
                                        onClick={() => dismissToast(t.id)}
                                        className="shrink-0 p-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            )
                        })}
                    </div>

                    {/* Confirm dialog */}
                    {confirmState && (
                        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
                            <div
                                className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                                onClick={() => handleConfirm(false)}
                            />
                            <div className="relative bg-white dark:bg-warm-900 rounded-2xl shadow-2xl border border-warm-200 dark:border-warm-700 p-6 max-w-sm w-full animate-scale-in">
                                <div className="flex items-start gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                                        <AlertTriangle size={20} className="text-amber-500" />
                                    </div>
                                    <p className="text-sm text-warm-700 dark:text-warm-200 leading-relaxed pt-2">
                                        {confirmState.message}
                                    </p>
                                </div>
                                <div className="flex gap-3 justify-end">
                                    <button
                                        onClick={() => handleConfirm(false)}
                                        className="px-4 py-2 text-sm font-medium text-warm-600 dark:text-warm-300 bg-warm-100 dark:bg-warm-800 hover:bg-warm-200 dark:hover:bg-warm-700 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => handleConfirm(true)}
                                        className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-sm"
                                    >
                                        Confirm
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>,
                document.body
            )}
        </ToastContext.Provider>
    )
}
