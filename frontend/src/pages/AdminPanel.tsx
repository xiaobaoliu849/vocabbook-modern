import { safeStorage } from '../utils/safeStorage'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crown, KeyRound, RefreshCw, Search, Shield, ShoppingCart, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { adminRequest } from '../services/cloudApi'

const ADMIN_TOKEN_STORAGE_KEY = 'cloud_admin_token'

type AdminSummary = {
    total_users: number
    premium_users: number
    total_orders: number
    paid_orders: number
}

type AdminUser = {
    id: string
    email: string
    tier: 'free' | 'premium'
    is_active: boolean
    is_superuser: boolean
    license_expiry: string | null
    created_at: string
}

type AdminOrder = {
    id: string
    user_id: string
    user_email: string
    out_trade_no: string
    trade_no?: string | null
    payment_method: string
    amount_fen: number
    status: string
    description?: string | null
    created_at: string
    updated_at: string
}

type LoadingTarget = {
    type: 'user'
    id: string
} | null

function formatDateTime(value?: string | null) {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date)
}

function formatCurrencyFen(amountFen: number) {
    return `¥${(amountFen / 100).toFixed(2)}`
}

export default function AdminPanel() {
    const { t } = useTranslation()
    const [adminTokenInput, setAdminTokenInput] = useState('')
    const [activeAdminToken, setActiveAdminToken] = useState('')
    const [summary, setSummary] = useState<AdminSummary | null>(null)
    const [users, setUsers] = useState<AdminUser[]>([])
    const [orders, setOrders] = useState<AdminOrder[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [loadingTarget, setLoadingTarget] = useState<LoadingTarget>(null)
    const [errorMessage, setErrorMessage] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const searchTimeoutRef = useRef<number | undefined>(undefined)
    // The debounce timer fires with the closure from the render where the last
    // keystroke happened — before that render's state commit — so reading the
    // query from state inside searchUsers always missed the final character.
    const searchQueryRef = useRef('')
    const initializedRef = useRef(false)
    // Shared ticket across loadAdminData/searchUsers: both write the users
    // table, so only the most recently started request may commit its result.
    const reqSeqRef = useRef(0)

    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current)
        }
    }, [])

    const premiumRate = useMemo(() => {
        if (!summary?.total_users) return 0
        return Math.round((summary.premium_users / summary.total_users) * 100)
    }, [summary])

    const loadAdminData = useCallback(async (tokenOverride?: string) => {
        const token = (tokenOverride ?? activeAdminToken).trim()
        if (!token) {
            setErrorMessage(t('admin.errors.missingToken', 'Please enter your admin token first.'))
            return
        }

        const seq = ++reqSeqRef.current
        setIsLoading(true)
        setErrorMessage('')
        try {
            const [summaryData, userData, orderData] = await Promise.all([
                adminRequest<AdminSummary>('/admin/summary', token),
                adminRequest<AdminUser[]>(`/admin/users?limit=100${searchQuery.trim() ? `&search=${encodeURIComponent(searchQuery.trim())}` : ''}`, token),
                adminRequest<AdminOrder[]>('/admin/orders?limit=100', token),
            ])
            if (seq !== reqSeqRef.current) return
            setSummary(summaryData)
            setUsers(userData)
            setOrders(orderData)
        } catch (error) {
            if (seq !== reqSeqRef.current) return
            setSummary(null)
            setUsers([])
            setOrders([])
            setErrorMessage(error instanceof Error ? error.message : t('admin.errors.loadFailed', 'Failed to load admin data.'))
        } finally {
            if (seq === reqSeqRef.current) {
                setIsLoading(false)
            }
        }
    }, [activeAdminToken, searchQuery, t])

    const searchUsers = useCallback(async () => {
        if (!activeAdminToken) return
        const query = searchQueryRef.current.trim()
        const seq = ++reqSeqRef.current
        try {
            const userData = await adminRequest<AdminUser[]>(
                `/admin/users?limit=100${query ? `&search=${encodeURIComponent(query)}` : ''}`,
                activeAdminToken
            )
            if (seq !== reqSeqRef.current) return
            setUsers(userData)
        } catch (error) {
            if (seq !== reqSeqRef.current) return
            setErrorMessage(error instanceof Error ? error.message : t('admin.errors.loadFailed', 'Failed to load admin data.'))
        }
    }, [activeAdminToken, t])

    const saveTokenAndLoad = async () => {
        const token = adminTokenInput.trim()
        if (!token) {
            setErrorMessage(t('admin.errors.missingToken', 'Please enter your admin token first.'))
            return
        }
        safeStorage.set(ADMIN_TOKEN_STORAGE_KEY, token)
        setActiveAdminToken(token)
        await loadAdminData(token)
    }

    const clearToken = () => {
        safeStorage.remove(ADMIN_TOKEN_STORAGE_KEY)
        setAdminTokenInput('')
        setActiveAdminToken('')
        setSummary(null)
        setUsers([])
        setOrders([])
        setErrorMessage('')
    }

    const updateTier = async (userId: string, tier: 'free' | 'premium', days: number = 30) => {
        if (!activeAdminToken) return
        setLoadingTarget({ type: 'user', id: userId })
        setErrorMessage('')
        try {
            await adminRequest<AdminUser>(`/admin/users/${encodeURIComponent(userId)}/tier`, activeAdminToken, {
                method: 'POST',
                body: JSON.stringify(
                    tier === 'premium'
                        ? { tier: 'premium', extend_days: days }
                        : { tier: 'free' }
                ),
            })
            await loadAdminData(activeAdminToken)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : t('admin.errors.updateFailed', 'Failed to update user tier.'))
        } finally {
            setLoadingTarget(null)
        }
    }

    useEffect(() => {
        if (initializedRef.current) return
        initializedRef.current = true
        const savedToken = safeStorage.get(ADMIN_TOKEN_STORAGE_KEY) || ''
        setAdminTokenInput(savedToken)
        setActiveAdminToken(savedToken)
        if (savedToken) {
            void loadAdminData(savedToken)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">
                        {t('admin.title', 'Cloud Admin')}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm max-w-2xl">
                        {t('admin.subtitle', 'Manage registered users, premium access, and payment orders from the deployed cloud API.')}
                    </p>
                </div>

                <div className="glass-card p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
                    <div className="relative min-w-[280px]">
                        <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="password"
                            value={adminTokenInput}
                            onChange={(e) => setAdminTokenInput(e.target.value)}
                            placeholder={t('admin.token.placeholder', 'Enter admin token')}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-10 py-2.5 text-sm text-slate-700 dark:text-slate-200 shadow-sm outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/30"
                        />
                    </div>
                    <button
                        onClick={saveTokenAndLoad}
                        className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
                    >
                        {t('admin.token.connect', 'Connect')}
                    </button>
                    <button
                        onClick={() => loadAdminData()}
                        disabled={!activeAdminToken || isLoading}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <span className="inline-flex items-center gap-2">
                            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
                            {t('admin.token.refresh', 'Refresh')}
                        </span>
                    </button>
                    <button
                        onClick={clearToken}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                        {t('admin.token.clear', 'Clear')}
                    </button>
                </div>
            </div>

            {errorMessage && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                    {errorMessage}
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    icon={<Users size={18} />}
                    label={t('admin.summary.totalUsers', 'Total Users')}
                    value={summary?.total_users ?? '—'}
                    accent="text-slate-700 dark:text-slate-200"
                />
                <SummaryCard
                    icon={<Crown size={18} />}
                    label={t('admin.summary.premiumUsers', 'Premium Users')}
                    value={summary?.premium_users ?? '—'}
                    detail={summary ? `${premiumRate}%` : undefined}
                    accent="text-amber-600"
                />
                <SummaryCard
                    icon={<ShoppingCart size={18} />}
                    label={t('admin.summary.totalOrders', 'Total Orders')}
                    value={summary?.total_orders ?? '—'}
                    accent="text-primary-600"
                />
                <SummaryCard
                    icon={<Shield size={18} />}
                    label={t('admin.summary.paidOrders', 'Paid Orders')}
                    value={summary?.paid_orders ?? '—'}
                    accent="text-emerald-600"
                />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_1fr]">
                <section className="glass-card overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                                {t('admin.users.title', 'Users')}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {t('admin.users.subtitle', 'Recent registered accounts and their current membership state.')}
                            </p>
                            <div className="relative mt-2">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value)
                                        searchQueryRef.current = e.target.value
                                        if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current)
                                        searchTimeoutRef.current = window.setTimeout(() => { searchUsers() }, 500)
                                    }}
                                    placeholder={t('admin.users.searchPlaceholder', 'Search by email...')}
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none transition focus:border-primary-400 focus:ring-1 focus:ring-primary-100 dark:focus:ring-primary-900/30"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 text-left font-semibold">{t('admin.users.email', 'Email')}</th>
                                    <th className="px-5 py-3 text-left font-semibold">{t('admin.users.tier', 'Tier')}</th>
                                    <th className="px-5 py-3 text-left font-semibold">{t('admin.users.expiry', 'Expiry')}</th>
                                    <th className="px-5 py-3 text-left font-semibold">{t('admin.users.createdAt', 'Created')}</th>
                                    <th className="px-5 py-3 text-right font-semibold">{t('admin.users.actions', 'Actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-5 py-10 text-center text-slate-500 dark:text-slate-400">
                                            {activeAdminToken
                                                ? t('admin.users.empty', 'No users found yet.')
                                                : t('admin.users.locked', 'Enter an admin token to load user data.')}
                                        </td>
                                    </tr>
                                ) : (
                                    users.map((user) => {
                                        const isBusy = loadingTarget?.type === 'user' && loadingTarget.id === user.id
                                        const isPremium = user.tier === 'premium'
                                        return (
                                            <tr key={user.id} className="border-t border-slate-100 dark:border-slate-800">
                                                <td className="px-5 py-4">
                                                    <div className="font-medium text-slate-800 dark:text-slate-100">{user.email}</div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400">{user.id.slice(0, 8)}...</div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                        isPremium
                                                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                                    }`}>
                                                        {isPremium ? t('admin.users.premium', 'Premium') : t('admin.users.free', 'Free')}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{formatDateTime(user.license_expiry)}</td>
                                                <td className="px-5 py-4 text-slate-500 dark:text-slate-400">{formatDateTime(user.created_at)}</td>
                                                <td className="px-5 py-4">
                                                    <div className="flex flex-wrap justify-end gap-1.5">
                                                        <button
                                                            onClick={() => updateTier(user.id, 'premium', 30)}
                                                            disabled={isBusy}
                                                            className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            {isBusy ? t('admin.users.updating', 'Updating...') : '+30d'}
                                                        </button>
                                                        <button
                                                            onClick={() => updateTier(user.id, 'premium', 90)}
                                                            disabled={isBusy}
                                                            className="rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            +90d
                                                        </button>
                                                        <button
                                                            onClick={() => updateTier(user.id, 'premium', 365)}
                                                            disabled={isBusy}
                                                            className="rounded-lg bg-purple-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            +1{t('admin.users.year', 'yr')}
                                                        </button>
                                                        <button
                                                            onClick={() => updateTier(user.id, 'premium', 36500)}
                                                            disabled={isBusy}
                                                            className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            {t('admin.users.permanent', '∞')}
                                                        </button>
                                                        <button
                                                            onClick={() => updateTier(user.id, 'free')}
                                                            disabled={isBusy}
                                                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            {t('admin.users.setFree', 'Set Free')}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="glass-card overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                                {t('admin.orders.title', 'Orders')}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {t('admin.orders.subtitle', 'Latest payment records returned by the cloud service.')}
                            </p>
                        </div>
                    </div>
                    <div className="space-y-3 p-4">
                        {orders.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                {activeAdminToken
                                    ? t('admin.orders.empty', 'No orders yet.')
                                    : t('admin.orders.locked', 'Enter an admin token to load order data.')}
                            </div>
                        ) : (
                            orders.map((order) => (
                                <div
                                    key={order.id}
                                    className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate font-semibold text-slate-800 dark:text-slate-100">{order.user_email || order.user_id}</div>
                                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{order.out_trade_no}</div>
                                        </div>
                                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                            order.status === 'SUCCESS'
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                        }`}>
                                            {order.status}
                                        </span>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                                        <span>{formatCurrencyFen(order.amount_fen)}</span>
                                        <span>{formatDateTime(order.created_at)}</span>
                                    </div>
                                    {order.description && (
                                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{order.description}</div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    )
}

function SummaryCard({
    icon,
    label,
    value,
    detail,
    accent,
}: {
    icon: React.ReactNode
    label: string
    value: number | string
    detail?: string
    accent: string
}) {
    return (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex items-center justify-between">
                <div className="rounded-xl bg-slate-100 p-2 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    {icon}
                </div>
                {detail && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {detail}
                    </span>
                )}
            </div>
            <div className={`mt-5 text-3xl font-bold ${accent}`}>{value}</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</div>
        </div>
    )
}
