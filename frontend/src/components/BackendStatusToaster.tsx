import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../context/ToastContext'

/**
 * Renders nothing; listens for the Electron main-process backend-status event
 * (preload dispatches it as a window CustomEvent) and toasts when the local
 * backend exhausts its restart attempts. Without this consumer the main
 * process's "UI 反应后端挂死" broadcast never reached the interface.
 * Must be mounted inside ToastProvider (see main.tsx).
 */
export default function BackendStatusToaster() {
    const { t } = useTranslation()
    const { toast } = useToast()

    useEffect(() => {
        const handleStatus = (event: Event) => {
            const status = (event as CustomEvent).detail
            if (status === 'down') {
                toast(t('errors.backendDown', 'The local backend stopped responding. Please restart the app.'), 'error')
            }
        }
        window.addEventListener('backend-status', handleStatus)
        return () => window.removeEventListener('backend-status', handleStatus)
    }, [toast, t])

    return null
}
