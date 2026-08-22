import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../context/ToastContext'
import { SESSION_EXPIRED_EVENT } from '../utils/authEvents'

/**
 * Renders nothing; listens for the cloud session-expired event and shows a
 * toast. Must be mounted inside ToastProvider (see main.tsx).
 */
export default function SessionExpiryToaster() {
    const { t } = useTranslation()
    const { toast } = useToast()

    useEffect(() => {
        const handleExpired = () => {
            toast(t('errors.sessionExpired', 'Your session has expired. Please sign in again.'), 'warning')
        }
        window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired)
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired)
    }, [toast, t])

    return null
}
