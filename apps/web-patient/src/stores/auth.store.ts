import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: { id: string; role: string; email?: string } | null;
  isAuthenticated: boolean;
  setAuth: (accessToken: string, refreshToken: string) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      setAuth: (accessToken, refreshToken) => {
        let user = null;
        try {
          const payload = JSON.parse(atob(accessToken.split('.')[1]));
          user = { id: payload.sub, role: payload.role };
        } catch { /* ignore */ }
        set({ accessToken, refreshToken, user, isAuthenticated: true });
      },
      setAccessToken: (accessToken) => set({ accessToken }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false }),
    }),
    {
      name: 'mediflow-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ refreshToken: state.refreshToken, user: state.user }),
    },
  ),
);
