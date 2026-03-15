import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { payService } from '../services/cloudApi';
import { QRCodeSVG } from 'qrcode.react';

interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SubscriptionModal({ isOpen, onClose }: SubscriptionModalProps) {
    const { t } = useTranslation();
    const { user, token, checkAuth } = useAuth();
    const [loading, setLoading] = useState(false);
    const [mockLoading, setMockLoading] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
    const [orderNo, setOrderNo] = useState<string | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setQrCodeUrl(null);
            setOrderNo(null);
            setError('');
        }
    }, [isOpen]);

    useEffect(() => {
        let interval: number | undefined;
        if (isOpen && token && orderNo && qrCodeUrl) {
            interval = window.setInterval(async () => {
                try {
                    const order = await payService.getOrderStatus(orderNo);
                    if (order.status === 'SUCCESS') {
                        await checkAuth(token);
                        onClose();
                    }
                } catch (err) {
                    console.error('Failed to poll subscription order status', err);
                }
            }, 3000);
        }

        return () => {
            if (interval) window.clearInterval(interval);
        };
    }, [isOpen, token, orderNo, qrCodeUrl, checkAuth, onClose]);

    if (!isOpen) return null;

    const handleSubscribe = async () => {
        if (!user || !token) {
            setError(t('subscription.errors.loginRequired', 'Please sign in before subscribing.'));
            return;
        }

        setLoading(true);
        setError('');
        try {
            const data = await payService.createNativeOrder(2900, 'VocabBook Modern Premium - 1 Month');
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

            await checkAuth(token);
            onClose();
        } catch (err: any) {
            console.error(err);
            const message = err?.response?.data?.detail || err.message;
            setError(message || t('subscription.errors.checkStatusFailed', 'Failed to check payment status.'));
        } finally {
            setLoading(false);
        }
    };

    const handleMockPayment = async () => {
        if (!token) return;
        if (!orderNo) {
            setError(t('subscription.errors.noPendingOrder', 'No pending order found. Please create a payment order first.'));
            return;
        }
        setMockLoading(true);
        try {
            await payService.mockSuccess(orderNo);
            await handleCheckStatus();
        } catch (err: any) {
            setError(t('subscription.errors.mockPaymentError', {
                defaultValue: 'Mock payment error: {{message}}',
                message: err?.response?.data?.detail || err.message
            }));
        } finally {
            setMockLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
            <div className="bg-white/10 dark:bg-[#1C1C1E]/90 backdrop-blur-xl border border-white/20 dark:border-white/10 p-8 rounded-3xl w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto flex flex-col">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="text-center mb-10">
                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400 mb-2">
                        {t('subscription.title', 'Upgrade to Premium')}
                    </h2>
                    <p className="text-gray-400 text-lg">{t('subscription.subtitle', 'Unlock the full potential of vocabulary learning.')}</p>
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
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-600 text-white text-xs px-3 py-1 rounded-full font-medium">
                                        {t('subscription.currentPlan', 'Current plan')}
                                    </div>
                                )}
                                <h3 className="text-xl font-semibold text-white mb-2">{t('subscription.free.name', 'Free')}</h3>
                                <div className="text-3xl font-bold text-white mb-6">¥0 <span className="text-sm text-gray-400 font-normal">{t('subscription.free.priceSuffix', '/ lifetime')}</span></div>
                                <ul className="space-y-3 text-gray-300">
                                    <li className="flex items-center"><span className="text-green-400 mr-2">✓</span> {t('subscription.free.features.basicSync', 'Basic vocabulary sync')}</li>
                                    <li className="flex items-center"><span className="text-green-400 mr-2">✓</span> {t('subscription.free.features.sm2', 'SM-2 spaced repetition')}</li>
                                    <li className="flex items-center"><span className="text-gray-500 mr-2 border rounded-full px-1 text-xs">!</span> {t('subscription.free.features.aiChatLimit', 'AI chat (10/day)')}</li>
                                    <li className="flex items-center"><span className="text-gray-500 mr-2 border rounded-full px-1 text-xs">!</span> {t('subscription.free.features.edgeTtsLimit', 'Edge TTS (30/day)')}</li>
                                    <li className="flex items-center"><span className="text-gray-500 mr-2 border rounded-full px-1 text-xs">!</span> {t('subscription.free.features.aiGenerationLimit', 'AI sentence generation (15/day)')}</li>
                                </ul>
                            </div>

                            {/* Premium Tier */}
                            <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border border-blue-500/30 rounded-2xl p-6 relative transform md:-translate-y-2 shadow-xl shadow-blue-500/10">
                                {user?.tier === 'premium' && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs px-3 py-1 rounded-full font-bold shadow-lg">
                                        {t('subscription.currentActive', 'Currently active')}
                                    </div>
                                )}
                                <h3 className="text-xl font-semibold text-blue-300 mb-2">{t('subscription.premium.name', 'Premium')}</h3>
                                <div className="text-3xl font-bold text-white mb-6">¥29 <span className="text-sm text-blue-200/50 font-normal">{t('subscription.premium.priceSuffix', '/ month')}</span></div>
                                <ul className="space-y-3 text-blue-100">
                                    <li className="flex items-center"><span className="text-blue-400 mr-2">★</span> {t('subscription.premium.features.unlimitedAiChat', 'Unlimited AI chat')}</li>
                                    <li className="flex items-center"><span className="text-blue-400 mr-2">★</span> {t('subscription.premium.features.unlimitedEdgeTts', 'Unlimited Edge TTS')}</li>
                                    <li className="flex items-center"><span className="text-blue-400 mr-2">★</span> {t('subscription.premium.features.unlimitedAiGeneration', 'Unlimited AI generation')}</li>
                                    <li className="flex items-center"><span className="text-blue-400 mr-2">★</span> {t('subscription.premium.features.prioritySupport', 'Priority support')}</li>
                                    <li className="flex items-center"><span className="text-blue-400 mr-2">★</span> {t('subscription.premium.features.deviceSync', 'Multi-device sync')}</li>
                                </ul>
                            </div>
                        </div>

                        <div className="text-center">
                            <button
                                onClick={handleSubscribe}
                                disabled={loading || user?.tier === 'premium'}
                                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 px-12 rounded-2xl transition-all shadow-lg shadow-blue-500/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                            >
                                {loading
                                    ? t('subscription.actions.processing', 'Processing...')
                                    : (user?.tier === 'premium'
                                        ? t('subscription.actions.alreadyPremium', 'Already Premium')
                                        : t('subscription.actions.subscribeWithAlipay', 'Subscribe with Alipay'))}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="bg-white rounded-2xl p-8 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
                        <h3 className="text-gray-800 font-bold mb-4 text-xl">{t('subscription.actions.scanWithAlipay', 'Scan with Alipay')}</h3>
                        <div className="p-4 bg-gray-50 rounded-xl mb-4 border">
                            <QRCodeSVG value={qrCodeUrl} size={200} />
                        </div>
                        <p className="text-sm text-gray-500 mb-6 font-mono text-center">
                            {t('subscription.payment.sandbox', 'Sandbox test')}<br />
                            {t('subscription.payment.orderNo', {
                                defaultValue: 'Order No: {{orderNo}}',
                                orderNo: orderNo || ''
                            })}
                        </p>
                        <button
                            onClick={handleCheckStatus}
                            disabled={loading || mockLoading}
                            className="text-blue-600 font-medium hover:bg-blue-50 py-2 px-6 rounded-lg transition-colors"
                        >
                            {loading
                                ? t('subscription.actions.checking', 'Checking...')
                                : t('subscription.actions.checkStatus', 'I have completed payment')}
                        </button>

                        <div className="flex gap-4 mt-3">
                            <button
                                onClick={handleMockPayment}
                                disabled={loading || mockLoading}
                                className="text-emerald-600 text-sm hover:text-emerald-700 transition-colors bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-200"
                            >
                                {mockLoading
                                    ? t('subscription.actions.mocking', 'Mocking...')
                                    : t('subscription.actions.mockSuccess', '🔧 [Dev] Simulate success')}
                            </button>
                            <button
                                onClick={() => { setQrCodeUrl(null); setOrderNo(null); setError(''); }}
                                className="text-gray-400 text-sm hover:text-gray-600 transition-colors py-1.5"
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
