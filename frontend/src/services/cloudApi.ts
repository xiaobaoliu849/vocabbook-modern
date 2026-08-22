import { useAuthStore } from '../stores/useAuthStore';

const DEFAULT_CLOUD_API_URL = 'http://localhost:8001';
const envUrl = import.meta.env.VITE_CLOUD_API_URL;
const API_URL = (envUrl && !envUrl.includes('historyai.fun')) ? envUrl : DEFAULT_CLOUD_API_URL;

function getToken(): string | null {
    return useAuthStore.getState().token;
}

/** Error with an HTTP status attached so callers can tell auth failures
 *  (401/403) from network/server problems. Network errors (fetch rejects)
 *  carry no status and must NOT be treated as "token expired". */
export class CloudApiError extends Error {
    status?: number

    constructor(message: string, status?: number) {
        super(message)
        this.name = 'CloudApiError'
        this.status = status
    }
}

function isAuthError(error: unknown): boolean {
    return error instanceof CloudApiError && (error.status === 401 || error.status === 403);
}

export { isAuthError };

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

    let resp: Response;
    try {
        resp = await fetch(`${API_URL}${path}`, {
            ...options,
            headers,
        });
    } catch (err) {
        // Network-level failure (offline, DNS, refused). Re-wrap without a
        // status so callers never mistake it for an auth rejection.
        throw new CloudApiError(`Cloud API network error: ${(err as Error)?.message ?? err}`);
    }

    if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new CloudApiError(`Cloud API ${resp.status}: ${body}`, resp.status);
    }
    return resp.json();
}

/**
 * Admin endpoints are gated by a static X-Admin-Token instead of user JWTs.
 * Kept separate from `request` so the user token is never mixed in.
 */
export async function adminRequest<T = any>(
    path: string,
    adminToken: string,
    options: RequestInit = {},
): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken,
        ...(options.headers as Record<string, string> || {}),
    };

    const resp = await fetch(`${API_URL}${path}`, { ...options, headers });

    if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(body || `Admin request failed: ${resp.status}`);
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
