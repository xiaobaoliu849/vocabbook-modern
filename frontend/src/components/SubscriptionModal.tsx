import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { API_PATHS } from '../utils/api';
import { QRCodeSVG } from 'qrcode.react';

interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SubscriptionModal({ isOpen, onClose }: SubscriptionModalProps) {
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

    if (!isOpen) return null;

    const handleSubscribe = async () => {
        if (!user || !token) {
            setError('请先登录后再订阅。');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const res = await fetch(API_PATHS.CLOUD_PAY_PRECREATE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    amount_fen: 2900, // 29 Yuan
                    description: 'VocabBook Modern Premium - 1 Month'
                })
            });

            if (!res.ok) throw new Error(await res.text() || '创建支付订单失败');

            const data = await res.json();
            setQrCodeUrl(data.code_url);
            setOrderNo(data.out_trade_no);

            // Note: In a real app, you would start polling the backend here
            // to check if the order status has changed to SUCCESS.
            // For now, we'll just show the QR code and a manual refresh button.

        } catch (err: any) {
            setError(err.message || '发生错误');
        } finally {
            setLoading(false);
        }
    };

    const handleCheckStatus = async () => {
        if (!token) return;
        setLoading(true);
        try {
            // Re-fetch user profile to see if tier changed to premium
            const res = await fetch(API_PATHS.CLOUD_ME, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const userData = await res.json();
                await checkAuth(token);
                if (userData.tier === 'premium') {
                    onClose();
                } else {
                    setError('暂未收到付款。请稍等片刻再试。');
                }
            } else {
                setError('检查支付状态失败。');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleMockPayment = async () => {
        if (!token) return;
        if (!orderNo) {
            setError('未找到待处理订单。请先创建支付订单。');
            return;
        }
        setMockLoading(true);
        try {
            // Using a hardcoded URL since this is a new endpoint only on the mock server
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8001';
            const mockUrl = apiUrl.includes('8000') ? 'http://localhost:8001' : apiUrl; // simple fallback

            const res = await fetch(`${mockUrl}/api/pay/mock_success`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ out_trade_no: orderNo })
            });
            if (res.ok) {
                await handleCheckStatus();
            } else {
                setError('模拟支付失败：' + await res.text());
            }
        } catch (err: any) {
            setError('模拟支付错误：' + err.message);
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
                        升级至专业版
                    </h2>
                    <p className="text-gray-400 text-lg">解锁词汇学习的全部潜力。</p>
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
                                        当前计划
                                    </div>
                                )}
                                <h3 className="text-xl font-semibold text-white mb-2">免费版</h3>
                                <div className="text-3xl font-bold text-white mb-6">¥0 <span className="text-sm text-gray-400 font-normal">/ 永久</span></div>
                                <ul className="space-y-3 text-gray-300">
                                    <li className="flex items-center"><span className="text-green-400 mr-2">✓</span> 基础词汇同步</li>
                                    <li className="flex items-center"><span className="text-green-400 mr-2">✓</span> SM-2 记忆算法</li>
                                    <li className="flex items-center"><span className="text-gray-500 mr-2 border rounded-full px-1 text-xs">!</span> AI 聊天 (10条/天)</li>
                                    <li className="flex items-center"><span className="text-gray-500 mr-2 border rounded-full px-1 text-xs">!</span> Edge TTS (30次/天)</li>
                                    <li className="flex items-center"><span className="text-gray-500 mr-2 border rounded-full px-1 text-xs">!</span> AI 造句 (15次/天)</li>
                                </ul>
                            </div>

                            {/* Premium Tier */}
                            <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border border-blue-500/30 rounded-2xl p-6 relative transform md:-translate-y-2 shadow-xl shadow-blue-500/10">
                                {user?.tier === 'premium' && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs px-3 py-1 rounded-full font-bold shadow-lg">
                                        当前生效
                                    </div>
                                )}
                                <h3 className="text-xl font-semibold text-blue-300 mb-2">专业版</h3>
                                <div className="text-3xl font-bold text-white mb-6">¥29 <span className="text-sm text-blue-200/50 font-normal">/ 月</span></div>
                                <ul className="space-y-3 text-blue-100">
                                    <li className="flex items-center"><span className="text-blue-400 mr-2">★</span> 无限 AI 聊天</li>
                                    <li className="flex items-center"><span className="text-blue-400 mr-2">★</span> 无限 Edge TTS</li>
                                    <li className="flex items-center"><span className="text-blue-400 mr-2">★</span> 无限 AI 生成</li>
                                    <li className="flex items-center"><span className="text-blue-400 mr-2">★</span> 优先技术支持</li>
                                    <li className="flex items-center"><span className="text-blue-400 mr-2">★</span> 全设备同步</li>
                                </ul>
                            </div>
                        </div>

                        <div className="text-center">
                            <button
                                onClick={handleSubscribe}
                                disabled={loading || user?.tier === 'premium'}
                                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 px-12 rounded-2xl transition-all shadow-lg shadow-blue-500/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                            >
                                {loading ? '处理中...' : (user?.tier === 'premium' ? '已经是专业版' : '使用支付宝订阅')}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="bg-white rounded-2xl p-8 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
                        <h3 className="text-gray-800 font-bold mb-4 text-xl">使用支付宝扫码</h3>
                        <div className="p-4 bg-gray-50 rounded-xl mb-4 border">
                            <QRCodeSVG value={qrCodeUrl} size={200} />
                        </div>
                        <p className="text-sm text-gray-500 mb-6 font-mono text-center">
                            沙盒测试<br />
                            订单号：{orderNo}
                        </p>
                        <button
                            onClick={handleCheckStatus}
                            disabled={loading || mockLoading}
                            className="text-blue-600 font-medium hover:bg-blue-50 py-2 px-6 rounded-lg transition-colors"
                        >
                            {loading ? '检查中...' : "我已完成支付"}
                        </button>

                        <div className="flex gap-4 mt-3">
                            <button
                                onClick={handleMockPayment}
                                disabled={loading || mockLoading}
                                className="text-emerald-600 text-sm hover:text-emerald-700 transition-colors bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-200"
                            >
                                {mockLoading ? '模拟中...' : '🔧 [开发] 模拟成功'}
                            </button>
                            <button
                                onClick={() => { setQrCodeUrl(null); setOrderNo(null); setError(''); }}
                                className="text-gray-400 text-sm hover:text-gray-600 transition-colors py-1.5"
                            >
                                取消支付
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
