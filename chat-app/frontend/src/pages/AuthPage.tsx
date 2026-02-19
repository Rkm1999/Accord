import React, { useState } from 'react';
import { LogIn, UserPlus, MessageSquare } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { RecoveryModal } from '@/components/modals/RecoveryModal';
import { ResetPasswordModal } from '@/components/modals/ResetPasswordModal';

export const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setIsLoading(true);
    try {
      if (isLogin) {
        const data = await apiClient.login(username, password);
        setAuth({
          username: data.username,
          displayName: data.displayName,
          avatarKey: data.avatarKey,
          token: data.token
        });
      } else {
        const data = (await apiClient.register(username, password)) as any;
        if (data.recoveryKey) {
          window.dispatchEvent(new CustomEvent('accord-show-recovery', { detail: data.recoveryKey }));
          if (data.token) {
            setAuth({
              username,
              displayName: username,
              token: data.token
            });
          }
        } else {
          alert('Registration successful! Please login.');
          setIsLogin(true);
        }
      }
    } catch (error: any) {
      alert(error.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-[#667eea] to-[#764ba2]">
      <div className="bg-accord-dark-300 text-white rounded-lg shadow-2xl max-w-md w-full overflow-hidden transition-all">
        <div className="p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="w-20 h-20 bg-accord-blurple rounded-full flex items-center justify-center">
              <MessageSquare className="w-10 h-10 text-white" />
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-center mb-2">
            {isLogin ? 'Welcome back!' : 'Create an account'}
          </h1>
          <p className="text-accord-text-muted text-center mb-8">
            {isLogin ? "We're so excited to see you again!" : 'Join the conversation today'}
          </p>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-2">USERNAME</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username" 
                required
                className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accord-blurple transition-all"
                autoComplete="username" 
                maxLength={30}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-accord-text-muted uppercase mb-2">PASSWORD</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password" 
                required
                className="w-full bg-accord-dark-600 text-accord-text-normal rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accord-blurple transition-all"
                autoComplete="current-password"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={isLoading}
              className="btn-ripple w-full bg-accord-blurple hover:bg-[#4752C4] text-white font-semibold py-2.5 rounded transition-colors flex items-center justify-center gap-2 mt-6 disabled:opacity-50"
            >
              {isLogin ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              <span>{isLoading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}</span>
            </button>
          </form>
          
          <p className="text-sm text-accord-text-muted mt-4 text-center">
            {isLogin ? 'Need an account?' : 'Already have an account?'}
            <button 
              className="text-accord-text-link hover:underline ml-1" 
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? 'Register' : 'Login'}
            </button>
          </p>

          <p className="text-xs text-accord-text-muted mt-2 text-center">
            <button 
              className="hover:underline text-accord-text-muted" 
              onClick={() => window.dispatchEvent(new CustomEvent('accord-open-reset'))}
            >
              Forgot your password?
            </button>
          </p>
        </div>
        <div className="bg-accord-dark-500 px-4 py-3 text-center">
          <p className="text-xs text-accord-text-muted">Real-time chat with channels, file sharing, and more!</p>
        </div>
      </div>

      <RecoveryModal />
      <ResetPasswordModal />
    </div>
  );
};

