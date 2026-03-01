import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Mail, Lock, Loader2, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login, register } = useAuth();

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isLogin) {
                await login(email, password);
            } else {
                await register(email, password);
                // Auto login after register
                await login(email, password);
            }
            onClose();
        } catch (err: any) {
            console.error(err);
            let errorMsg = '认证失败';
            if (err.response?.data?.detail) {
                const detail = err.response.data.detail;
                // Handle FastAPI validation errors (array of objects)
                if (Array.isArray(detail)) {
                    errorMsg = detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
                } else if (typeof detail === 'object') {
                    errorMsg = detail.msg || JSON.stringify(detail);
                } else {
                    errorMsg = String(detail);
                }
            } else if (err.message) {
                 errorMsg = `请求失败: ${err.message}. 请确保云服务已启动。`;
            }
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-md bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ring-black/5">

                {/* Decorative Elements - Simplified */}
                <div className="absolute top-0 left-0 w-full h-1 bg-primary-500 opacity-80" />

                <div className="relative p-8">
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="text-center mb-8">
                        <div className="w-12 h-12 bg-primary-50 dark:bg-primary-900/20 rounded-xl mx-auto mb-4 flex items-center justify-center text-primary-600 dark:text-primary-400 border border-primary-100 dark:border-primary-800/50">
                            {isLogin ? <Lock className="w-6 h-6" /> : <User className="w-6 h-6" />}
                        </div>
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                            {isLogin ? '欢迎回来' : '加入 VocabBook'}
                        </h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
                            {isLogin ? '登录以访问您的云端同步' : '创建账户以开启云端同步'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 ml-1">邮箱</label>
                            <div className="relative group">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-primary-500 transition-colors" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-50/50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all placeholder:text-zinc-400"
                                    placeholder="name@example.com"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 ml-1">密码</label>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-primary-500 transition-colors" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-50/50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all placeholder:text-zinc-400"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg animate-in slide-in-from-top-2">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold shadow-lg shadow-primary-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? '登录' : '注册账户')}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-zinc-200 dark:border-white/10"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white dark:bg-zinc-900 text-zinc-500">或</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="mt-4 text-sm text-zinc-600 dark:text-zinc-300 hover:text-primary-600 dark:hover:text-primary-400 font-medium transition-colors"
                        >
                            {isLogin ? "还没有账户？立即注册" : "已有账户？立即登录"}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
