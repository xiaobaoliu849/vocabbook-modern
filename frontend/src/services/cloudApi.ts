import axios from 'axios';

// Cloud Server URL (Change to production URL when deployed)
const API_URL = import.meta.env.VITE_CLOUD_API_URL || 'http://localhost:8001';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add a request interceptor to attach the JWT token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('vocab_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

export const authService = {
    login: async (username: string, password: string) => {
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);
        const response = await api.post('/token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        if (response.data.access_token) {
            localStorage.setItem('vocab_token', response.data.access_token);
        }
        return response.data;
    },

    register: async (email: string, password: string) => {
        const response = await api.post('/register', { email, password });
        return response.data;
    },

    logout: () => {
        localStorage.removeItem('vocab_token');
    },

    getCurrentUser: async () => {
        const response = await api.get('/users/me');
        return response.data;
    }
};

export const payService = {
    createNativeOrder: async (amountFen = 2900, description = "VocabBook Pro") => {
        const response = await api.post('/api/pay/native', { amount_fen: amountFen, description });
        return response.data; // { code_url, out_trade_no }
    }
};

export default api;
