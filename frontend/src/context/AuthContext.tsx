import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authService } from '../services/cloudApi';
import { useAuthStore } from '../stores/useAuthStore';

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
    checkAuth: (tokenOverride?: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('vocab_token'));
    const [isLoading, setIsLoading] = useState(true);
    const setStoreToken = useAuthStore((state) => state.setToken);
    const setStoreUser = useAuthStore((state) => state.setUser);
    const clearStoreAuth = useAuthStore((state) => state.logout);

    const checkAuth = useCallback(async (tokenOverride?: string | null) => {
        try {
            const token = tokenOverride ?? localStorage.getItem('vocab_token');
            if (token) {
                setToken(token);
                setStoreToken(token);
                // If we have a token, fetch user details
                try {
                    const userData = await authService.getCurrentUser(token ?? undefined);
                    setUser(userData);
                    setStoreUser(userData);
                } catch (e) {
                     // Token might be expired
                     console.warn("Token expired or invalid", e);
                     localStorage.removeItem('vocab_token');
                     setToken(null);
                     setUser(null);
                     clearStoreAuth();
                }
            } else {
                setToken(null);
                setUser(null);
                clearStoreAuth();
            }
        } catch (error) {
            console.error("Auth check failed:", error);
        } finally {
            setIsLoading(false);
        }
    }, [clearStoreAuth, setStoreToken, setStoreUser]);

    useEffect(() => {
        void checkAuth();
    }, [checkAuth]);

    const login = async (email: string, password: string) => {
        const loginResult = await authService.login(email, password);
        if (loginResult?.access_token) {
            setToken(loginResult.access_token);
            setStoreToken(loginResult.access_token);
        }
        await checkAuth(loginResult?.access_token ?? null);
    };

    const register = async (email: string, password: string) => {
        await authService.register(email, password);
        // Optional: Auto login after register?
        // await login(email, password); 
    };

    const logout = () => {
        authService.logout();
        setToken(null);
        setUser(null);
        clearStoreAuth();
    };

    return (
        <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, checkAuth }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
