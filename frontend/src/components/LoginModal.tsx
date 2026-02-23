import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { API_PATHS } from '../utils/api';

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

    const setToken = useAuthStore(state => state.setToken);
    const setUser = useAuthStore(state => state.setUser);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (isLogin) {
                // Login Request
                const params = new URLSearchParams();
                params.append('username', email);
                params.append('password', password);

                const res = await fetch(API_PATHS.CLOUD_LOGIN, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params
                });

                if (!res.ok) throw new Error(await res.text() || 'Login failed');
                const data = await res.json();

                setToken(data.access_token);
                await fetchUserMe(data.access_token);
            } else {
                // Register Request
                const res = await fetch(API_PATHS.CLOUD_REGISTER, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                if (!res.ok) throw new Error(await res.text() || 'Registration failed');

                // Switch to login automatically
                setIsLogin(true);
                setError('Registration successful! Please login.');
            }
        } catch (err: any) {
            // Check if it's a detail format from FastAPI
            try {
                const msg = JSON.parse(err.message).detail;
                setError(typeof msg === 'string' ? msg : 'Error occurred');
            } catch {
                setError(err.message || 'Error occurred');
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchUserMe = async (token: string) => {
        const res = await fetch(API_PATHS.CLOUD_ME, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const userData = await res.json();
            setUser(userData);
            onClose();
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
                    {isLogin ? 'Welcome Back' : 'Create Account'}
                </h2>

                {error && (
                    <div className={`p-3 rounded-xl mb-4 text-sm ${error.includes('successful') ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="Password"
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
                        {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
                    </button>

                    <p className="text-center text-sm text-gray-400 mt-4">
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        <button
                            type="button"
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-blue-400 hover:text-blue-300 ml-1"
                        >
                            {isLogin ? 'Sign up' : 'Login'}
                        </button>
                    </p>
                </form>
            </div>
        </div>,
        document.body
    );
}
