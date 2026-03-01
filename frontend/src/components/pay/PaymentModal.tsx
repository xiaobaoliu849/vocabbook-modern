import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, CheckCircle2 } from 'lucide-react';
import QRCode from 'react-qr-code';
import { payService } from '../../services/cloudApi';
import { useAuth } from '../../context/AuthContext';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function PaymentModal({ isOpen, onClose }: PaymentModalProps) {
    const [loading, setLoading] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [outTradeNo, setOutTradeNo] = useState('');
    const [status, setStatus] = useState<'pending' | 'success' | 'fail'>('pending');

    const { user, checkAuth } = useAuth();

    useEffect(() => {
        if (isOpen && user) {
            initPayment();
        }
    }, [isOpen]);

    // Simple Polling Mock 
    // In real app, you'd poll backend /api/order/{outTradeNo} 
    // Here we just re-check user profile every 3s to see if 'tier' changed (since cloud server updates user tier on success)
    useEffect(() => {
        let interval: any;
        if (isOpen && status === 'pending' && outTradeNo) {
            interval = setInterval(async () => {
                await checkAuth();
                if (user?.tier === 'premium') {
                    setStatus('success');
                    clearInterval(interval);
                }
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [isOpen, status, outTradeNo, user]);

    const initPayment = async () => {
        setLoading(true);
        setStatus('pending');
        try {
            const res = await payService.createNativeOrder(2900, "VocabBook Pro Subscription");
            setQrCode(res.code_url);
            setOutTradeNo(res.out_trade_no);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in duration-200">
                <div className="relative p-6 text-center">
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <h3 className="text-xl font-bold mb-2">Upgrade to Pro</h3>
                    <p className="text-zinc-500 mb-6">Scan with WeChat to Pay</p>

                    <div className="flex flex-col items-center justify-center min-h-[250px] bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4">
                        {loading ? (
                            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                        ) : status === 'success' ? (
                            <div className="text-center text-green-500 fade-in zoom-in">
                                <CheckCircle2 className="w-16 h-16 mx-auto mb-2" />
                                <p className="font-bold">Payment Successful!</p>
                            </div>
                        ) : qrCode ? (
                            <div className="bg-white p-2 rounded-lg">
                                <QRCode value={qrCode} size={200} />
                            </div>
                        ) : (
                            <p className="text-red-500">Failed to load QR Code</p>
                        )}
                    </div>

                    <div className="mt-4 text-zinc-400 text-sm">
                        Total: <span className="text-zinc-900 dark:text-zinc-100 font-bold text-lg">¥29.00</span>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
