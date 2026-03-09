import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGoToPay?: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const { login, register } = useAuth();

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (isLogin) {
                await login(email, password);
                onClose();
            } else {
                await register(email, password);

                // Switch to login automatically
                setIsLogin(true);
                setError('注册成功！请登录。');
            }
        } catch (err: any) {
            let errorMsg = err?.message || '发生错误';
            if (err?.response?.data?.detail) {
                const detail = err.response.data.detail;
                if (Array.isArray(detail)) {
                    errorMsg = detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
                } else if (typeof detail === 'object') {
                    errorMsg = detail.msg || JSON.stringify(detail);
                } else {
                    errorMsg = String(detail);
                }
            }
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-white/10 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border border-white/20 dark:border-white/10 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <h2 className="text-2xl font-semibold mb-6 text-center text-gray-900 dark:text-white">
                    {isLogin ? '欢迎回来' : '创建账户'}
                </h2>

                {error && (
                    <div className={`p-3 rounded-xl mb-4 text-sm ${error.includes('成功') ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            type="email"
                            placeholder="邮箱"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="密码"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl font-medium transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
                    >
                        {loading ? '处理中...' : (isLogin ? '登录' : '注册')}
                    </button>

                    <p className="text-center text-sm text-gray-400 mt-4">
                        {isLogin ? "还没有账户？ " : "已有账户？ "}
                        <button
                            type="button"
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-blue-400 hover:text-blue-300 ml-1"
                        >
                            {isLogin ? '立即注册' : '立即登录'}
                        </button>
                    </p>
                </form>
            </div>
        </div>,
        document.body
    );
}
