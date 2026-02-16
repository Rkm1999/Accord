import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  username: string | null;
  displayName: string | null;
  avatarKey: string | null;
  fcmToken: string | null;
  setAuth: (data: { username: string; displayName: string; avatarKey?: string }) => void;
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
      setAuth: (data) => set({
        username: data.username,
        displayName: data.displayName,
        avatarKey: data.avatarKey || null,
      }),
      setFcmToken: (token) => set({ fcmToken: token }),
      logout: () => set({
        username: null,
        displayName: null,
        avatarKey: null,
        fcmToken: null,
      }),
    }),
    {
      name: 'accord-auth',
    }
  )
);
