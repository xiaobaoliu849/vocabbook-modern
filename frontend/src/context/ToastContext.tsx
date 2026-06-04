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
    info: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400',
    warning: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400',
}

const iconColors: Record<ToastType, string> = {
    success: 'text-emerald-500',
    error: 'text-red-500',
    info: 'text-blue-500',
    warning: 'text-amber-500',
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])
    const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
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
            setConfirmState({ message, resolve })
        })
    }, [])

    const handleConfirm = useCallback((result: boolean) => {
        if (confirmState) {
            confirmState.resolve(result)
            setConfirmState(null)
        }
    }, [confirmState])

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
                            <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 max-w-sm w-full animate-scale-in">
                                <div className="flex items-start gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                                        <AlertTriangle size={20} className="text-amber-500" />
                                    </div>
                                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed pt-2">
                                        {confirmState.message}
                                    </p>
                                </div>
                                <div className="flex gap-3 justify-end">
                                    <button
                                        onClick={() => handleConfirm(false)}
                                        className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
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
