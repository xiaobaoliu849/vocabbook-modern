import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authService, isAuthError } from '../services/cloudApi';
import { useAuthStore } from '../stores/useAuthStore';
import { SESSION_EXPIRED_EVENT } from '../utils/authEvents';

interface User {
    id: string;
    email: string;
    tier: string;
    is_active: boolean;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logout: () => void;
    checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // token comes from Zustand store (single source of truth)
    const token = useAuthStore((state) => state.token);

    const checkAuth = useCallback(async () => {
        try {
            const currentToken = useAuthStore.getState().token;
            if (currentToken) {
                try {
                    const userData = await authService.getCurrentUser();
                    setUser(userData);
                    useAuthStore.getState().setUser(userData);
                } catch (e) {
                    if (isAuthError(e)) {
                        // Token expired or revoked — clear persisted credentials.
                        console.warn("Token expired or invalid", e);
                        useAuthStore.getState().logout();
                        setUser(null);
                    } else {
                        // Network/server failure: keep the stored token so a
                        // later successful checkAuth restores the session
                        // instead of forcing a re-login on a Wi-Fi blip.
                        console.warn("Auth check unavailable (network); keeping token", e);
                        setUser(null);
                    }
                }
            } else {
                useAuthStore.getState().logout();
                setUser(null);
            }
        } catch (error) {
            console.error("Auth check failed:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void checkAuth();
    }, [checkAuth]);

    // cloudApi clears the store on any authenticated 401/403; keep the
    // context-level `user` in sync so the UI drops the stale identity too.
    useEffect(() => {
        const handleExpired = () => setUser(null);
        window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    }, []);

    const login = async (email: string, password: string) => {
        // authService.login() writes token to Zustand store
        await authService.login(email, password);
        await checkAuth();
    };

    const register = async (email: string, password: string) => {
        await authService.register(email, password);
    };

    const logout = () => {
        // authService.logout() clears Zustand store
        authService.logout();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, checkAuth }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
