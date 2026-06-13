'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Cookies from 'js-cookie';
import { authApi } from '@/lib/api';

interface User {
  _id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'viewer';
  isActive: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  _initialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      _initialized: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data: res } = await authApi.login(email, password);
          const payload = res.data;
          Cookies.set('access_token', payload.accessToken, { expires: 1 / 96 }); // 15 min
          Cookies.set('refresh_token', payload.refreshToken, { expires: 7 });
          set({ user: payload.user, isAuthenticated: true, _initialized: true, isLoading: false });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        const refreshToken = Cookies.get('refresh_token');
        try { await authApi.logout(refreshToken); } catch {}
        Cookies.remove('access_token');
        Cookies.remove('refresh_token');
        set({ user: null, isAuthenticated: false, _initialized: false });
      },

      loadUser: async () => {
        // Already initialized this session — skip re-validation
        if (get()._initialized) return;

        const token = Cookies.get('access_token');
        if (!token) {
          // No token at all — mark initialized so redirect fires immediately
          set({ isAuthenticated: false, isLoading: false, _initialized: true });
          return;
        }

        set({ isLoading: true });
        try {
          const { data: res } = await authApi.getMe();
          set({ user: res.data, isAuthenticated: true, isLoading: false, _initialized: true });
        } catch {
          // Token invalid or expired — clear and mark initialized
          Cookies.remove('access_token');
          Cookies.remove('refresh_token');
          set({ user: null, isAuthenticated: false, isLoading: false, _initialized: true });
        }
      },

      setUser: (user) => set({ user }),
    }),
    {
      name: 'shield-pro-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        // _initialized intentionally NOT persisted — must re-validate on each browser session
      }),
    }
  )
);