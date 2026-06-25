import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
    id: string;
    email: string;
    tier: 'free' | 'premium';
    is_active: boolean;
}

interface AuthState {
    token: string | null;
    user: User | null;
    setToken: (token: string) => void;
    setUser: (user: User) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            token: null,
            user: null,
            setToken: (token) => set({ token }),
            setUser: (user) => set({ user }),
            logout: () => set({ token: null, user: null }),
        }),
        {
            name: 'vocab-modern-auth',
            // Migrate legacy token from old localStorage key on first load
            onRehydrateStorage: () => (state) => {
                if (state && !state.token) {
                    const legacy = localStorage.getItem('vocab_token');
                    if (legacy) {
                        state.setToken(legacy);
                        localStorage.removeItem('vocab_token');
                    }
                }
            },
        }
    )
);
