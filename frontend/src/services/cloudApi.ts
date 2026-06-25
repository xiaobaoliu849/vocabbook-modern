import { useAuthStore } from '../stores/useAuthStore';

const DEFAULT_CLOUD_API_URL = 'https://api.historyai.fun';
const API_URL = import.meta.env.VITE_CLOUD_API_URL || DEFAULT_CLOUD_API_URL;

function getToken(): string | null {
    return useAuthStore.getState().token;
}

async function request<T = any>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const resp = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
    });

    if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`Cloud API ${resp.status}: ${body}`);
    }
    return resp.json();
}

export const authService = {
    login: async (username: string, password: string) => {
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);
        const data = await request<{ access_token: string }>('/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        });
        if (data.access_token) {
            useAuthStore.getState().setToken(data.access_token);
        }
        return data;
    },

    register: async (email: string, password: string) => {
        return request('/register', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    },

    logout: () => {
        useAuthStore.getState().logout();
    },

    getCurrentUser: async () => {
        return request('/users/me');
    },
};

export const payService = {
    createNativeOrder: async (planId = 'premium_monthly') => {
        return request('/api/pay/native', {
            method: 'POST',
            body: JSON.stringify({ plan_id: planId }),
        });
    },

    getOrderStatus: async (outTradeNo: string) => {
        return request(`/api/orders/${encodeURIComponent(outTradeNo)}`);
    },
};
