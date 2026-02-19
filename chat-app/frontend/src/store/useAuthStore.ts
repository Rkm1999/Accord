import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/lib/api';

interface AuthState {
  username: string | null;
  displayName: string | null;
  avatarKey: string | null;
  fcmToken: string | null;
  token: string | null;
  setAuth: (data: { username: string; displayName: string; avatarKey?: string; token?: string }) => void;
  setFcmToken: (token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      username: null,
      displayName: null,
      avatarKey: null,
      fcmToken: null,
      token: null,
      setAuth: (data) => set({
        username: data.username,
        displayName: data.displayName,
        avatarKey: data.avatarKey || null,
        token: data.token || null,
      }),
      setFcmToken: (token) => set({ fcmToken: token }),
      logout: () => {
        apiClient.logout().catch(() => {}); // Fire and forget
        set({
          username: null,
          displayName: null,
          avatarKey: null,
          fcmToken: null,
          token: null,
        });
      },
    }),
    {
      name: 'accord-auth',
    }
  )
);
