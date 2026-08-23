import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { payService } from '../services/cloudApi';
import { QRCodeSVG } from 'qrcode.react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SubscriptionModal({ isOpen, onClose }: SubscriptionModalProps) {
    const { t } = useTranslation();
    const trapRef = useFocusTrap(isOpen);
    const { user, token, checkAuth } = useAuth();
    const [loading, setLoading] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
    const [orderNo, setOrderNo] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [wechatCopied, setWechatCopied] = useState(false);

    // Reset only transient UI state on close. The pending order + QR are kept
    // so reopening the modal resumes polling and can still detect a payment
    // the user completed while the modal was shut — otherwise the order would
    // be lost client-side and the user might pay again on a second QR code.
    useEffect(() => {
        if (!isOpen) {
            setError('');
            setWechatCopied(false);
        }
    }, [isOpen]);

    useEffect(() => {
        let interval: number | undefined;
        let pollBusy = false;
        if (isOpen && token && orderNo && qrCodeUrl) {
            interval = window.setInterval(async () => {
                if (pollBusy) return; // server slower than the 3s tick → skip, don't pile up
                pollBusy = true;
                try {
                    const order = await payService.getOrderStatus(orderNo);
                    if (order.status === 'SUCCESS') {
                        await checkAuth();
                        onClose();
                    } else if (order.status === 'EXPIRED' || order.status === 'FAIL') {
                        // Terminal state: stop polling by dropping the order.
                        setQrCodeUrl(null);
                        setOrderNo(null);
                        setError(t('subscription.errors.orderExpired', 'This payment code has expired. Please create a new order.'));
                    }
                } catch (err) {
                    console.error('Failed to poll subscription order status', err);
                } finally {
                    pollBusy = false;
                }
            }, 3000);
        }

        return () => {
            if (interval) window.clearInterval(interval);
        };
    }, [isOpen, token, orderNo, qrCodeUrl, checkAuth, onClose, t]);

    if (!isOpen) return null;

    const handleSubscribe = async () => {
        if (!user || !token) {
            setError(t('subscription.errors.loginRequired', 'Please sign in before subscribing.'));
            return;
        }

        setLoading(true);
        setError('');
        try {
            const data = await payService.createNativeOrder('premium_monthly');
            setQrCodeUrl(data.code_url);
            setOrderNo(data.out_trade_no);
        } catch (err: any) {
            const message = err?.response?.data?.detail || err.message;
            setError(message || t('subscription.errors.generic', 'Something went wrong'));
        } finally {
            setLoading(false);
        }
    };

    const handleCheckStatus = async () => {
        if (!token) return;
        setLoading(true);
        try {
            if (orderNo) {
                const order = await payService.getOrderStatus(orderNo);
                if (order.status !== 'SUCCESS') {
                    setError(t('subscription.errors.paymentPending', 'Payment has not been received yet. Please wait a moment and try again.'));
                    return;
                }
            }

            await checkAuth();
            onClose();
        } catch (err: any) {
            console.error(err);
            const message = err?.response?.data?.detail || err.message;
            setError(message || t('subscription.errors.checkStatusFailed', 'Failed to check payment status.'));
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
            <div ref={trapRef} role="dialog" aria-modal="true" className="bg-white/10 dark:bg-warm-800/90 backdrop-blur-xl border border-white/20 dark:border-white/10 p-8 rounded-3xl w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto flex flex-col">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-warm-400 hover:text-white transition-colors z-10"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="text-center mb-10">
                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-primary-400 mb-2">
                        {t('subscription.title', 'Upgrade to Premium')}
                    </h2>
                    <p className="text-warm-400 text-lg">{t('subscription.subtitle', 'Unlock the full potential of vocabulary learning.')}</p>
                </div>

                {error && (
                    <div className="p-4 rounded-xl mb-6 bg-red-500/20 text-red-400 border border-red-500/30 text-center">
                        {error}
                    </div>
                )}

                {!qrCodeUrl ? (
                    <>
                        <div className="grid md:grid-cols-2 gap-6 mb-8">
                            {/* Free Tier */}
                            <div className="bg-black/20 border border-white/5 rounded-2xl p-6 relative">
                                {user?.tier === 'free' && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-warm-600 text-white text-xs px-3 py-1 rounded-full font-medium">
                                        {t('subscription.currentPlan', 'Current plan')}
                                    </div>
                                )}
                                <h3 className="text-xl font-semibold text-white mb-2">{t('subscription.free.name', 'Free')}</h3>
                                <div className="text-3xl font-bold text-white mb-6">¥0 <span className="text-sm text-warm-400 font-normal">{t('subscription.free.priceSuffix', '/ lifetime')}</span></div>
                                <ul className="space-y-3 text-warm-300">
                                    <li className="flex items-center"><span className="text-green-400 mr-2">✓</span> {t('subscription.free.features.basicSync', 'Basic vocabulary sync')}</li>
                                    <li className="flex items-center"><span className="text-green-400 mr-2">✓</span> {t('subscription.free.features.sm2', 'SM-2 spaced repetition')}</li>
                                    <li className="flex items-center"><span className="text-warm-500 mr-2 border rounded-full px-1 text-xs">!</span> {t('subscription.free.features.aiChatLimit', 'AI chat (10/day)')}</li>
                                    <li className="flex items-center"><span className="text-warm-500 mr-2 border rounded-full px-1 text-xs">!</span> {t('subscription.free.features.edgeTtsLimit', 'Edge TTS (30/day)')}</li>
                                    <li className="flex items-center"><span className="text-warm-500 mr-2 border rounded-full px-1 text-xs">!</span> {t('subscription.free.features.aiGenerationLimit', 'AI sentence generation (15/day)')}</li>
                                </ul>
                            </div>

                            {/* Premium Tier */}
                            <div className="bg-gradient-to-br from-primary-900/40 to-primary-900/40 border border-primary-500/30 rounded-2xl p-6 relative transform md:-translate-y-2 shadow-xl shadow-primary-500/10">
                                {user?.tier === 'premium' && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary-500 to-primary-500 text-white text-xs px-3 py-1 rounded-full font-bold shadow-lg">
                                        {t('subscription.currentActive', 'Currently active')}
                                    </div>
                                )}
                                <h3 className="text-xl font-semibold text-primary-300 mb-2">{t('subscription.premium.name', 'Premium')}</h3>
                                <div className="text-3xl font-bold text-white mb-6">¥29 <span className="text-sm text-primary-200/50 font-normal">{t('subscription.premium.priceSuffix', '/ month')}</span></div>
                                <ul className="space-y-3 text-primary-100">
                                    <li className="flex items-center"><span className="text-primary-400 mr-2">★</span> {t('subscription.premium.features.unlimitedAiChat', 'Unlimited AI chat')}</li>
                                    <li className="flex items-center"><span className="text-primary-400 mr-2">★</span> {t('subscription.premium.features.unlimitedEdgeTts', 'Unlimited Edge TTS')}</li>
                                    <li className="flex items-center"><span className="text-primary-400 mr-2">★</span> {t('subscription.premium.features.unlimitedAiGeneration', 'Unlimited AI generation')}</li>
                                    <li className="flex items-center"><span className="text-primary-400 mr-2">★</span> {t('subscription.premium.features.prioritySupport', 'Priority support')}</li>
                                    <li className="flex items-center"><span className="text-primary-400 mr-2">★</span> {t('subscription.premium.features.deviceSync', 'Multi-device sync')}</li>
                                </ul>
                            </div>
                        </div>

                        <div className="text-center">
                            <button
                                onClick={handleSubscribe}
                                disabled={loading || user?.tier === 'premium'}
                                className="bg-gradient-to-r from-primary-600 to-primary-600 hover:from-primary-500 hover:to-primary-500 text-white font-bold py-4 px-12 rounded-2xl transition-all shadow-lg shadow-primary-500/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                            >
                                {loading
                                    ? t('subscription.actions.processing', 'Processing...')
                                    : (user?.tier === 'premium'
                                        ? t('subscription.actions.alreadyPremium', 'Already Premium')
                                        : t('subscription.actions.subscribeWithAlipay', 'Subscribe with Alipay'))}
                            </button>
                        </div>

                        {/* Alternative: Contact Admin */}
                        <div className="mt-6 pt-5 border-t border-white/10">
                            <p className="text-warm-400 text-sm mb-3 text-center">
                                {t('subscription.altMethods.title', '其他开通方式')}
                            </p>
                            <div className="flex flex-col sm:flex-row justify-center gap-3">
                                <a
                                    href="mailto:381450393@qq.com"
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-warm-300 text-sm hover:bg-white/10 transition-colors"
                                >
                                    <span>📧</span>
                                    {t('subscription.altMethods.email', '邮件联系管理员')}
                                </a>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText('xiaobaoliu849');
                                        setWechatCopied(true);
                                        setTimeout(() => setWechatCopied(false), 2000);
                                    }}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-warm-300 text-sm hover:bg-white/10 transition-colors"
                                >
                                    <span>💬</span>
                                    <span>{wechatCopied ? t('subscription.altMethods.copied', '已复制!') : t('subscription.altMethods.wechat', '微信: xiaobaoliu849')}</span>
                                </button>
                            </div>
                            <p className="text-warm-500 text-xs mt-3 text-center">
                                {t('subscription.altMethods.hint', '联系管理员后，将在 24 小时内为您开通会员权限')}
                            </p>
                        </div>
                    </>
                ) : (
                    <div className="bg-white rounded-2xl p-8 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
                        <h3 className="text-warm-800 font-bold mb-4 text-xl">{t('subscription.actions.scanWithAlipay', 'Scan with Alipay')}</h3>
                        <div className="p-4 bg-warm-50 rounded-xl mb-4 border">
                            <QRCodeSVG value={qrCodeUrl} size={200} />
                        </div>
                        <p className="text-sm text-warm-500 mb-6 font-mono text-center">
                            {t('subscription.payment.orderNo', {
                                defaultValue: 'Order No: {{orderNo}}',
                                orderNo: orderNo || ''
                            })}
                        </p>
                        <button
                            onClick={handleCheckStatus}
                            disabled={loading}
                            className="text-primary-600 font-medium hover:bg-primary-50 py-2 px-6 rounded-lg transition-colors"
                        >
                            {loading
                                ? t('subscription.actions.checking', 'Checking...')
                                : t('subscription.actions.checkStatus', 'I have completed payment')}
                        </button>

                        <div className="flex gap-4 mt-3">
                            <button
                                onClick={() => { setQrCodeUrl(null); setOrderNo(null); setError(''); }}
                                className="text-warm-400 text-sm hover:text-warm-600 transition-colors py-1.5"
                            >
                                {t('subscription.actions.cancelPayment', 'Cancel payment')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
