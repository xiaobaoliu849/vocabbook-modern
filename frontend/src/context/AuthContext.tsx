import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/cloudApi';

interface User {
    id: string;
    email: string;
    tier: string;
    is_active: boolean;
}

interface AuthContextType {
    user: User | null;
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

    const checkAuth = async () => {
        try {
            const token = localStorage.getItem('vocab_token');
            if (token) {
                const userData = await authService.getCurrentUser();
                setUser(userData);
            }
        } catch (error) {
            console.error("Auth check failed:", error);
            localStorage.removeItem('vocab_token'); // Clear invalid token
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (email: string, password: string) => {
        checkAuth();
    }, []);

    const login = async (email, password) => {
    const register = async (email: string, password: string) => {
        await checkAuth();
    };

    const register = async (email, password) => {
        await authService.register(email, password);
        // Optional: Auto login after register?
        // await login(email, password); 
    };

    const logout = () => {
        authService.logout();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, login, register, logout, checkAuth }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
