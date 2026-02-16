import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

interface Props {
  children: ReactNode;
}

export const ProtectedRoute = ({ children }: Props) => {
  const username = useAuthStore((state) => state.username);

  if (!username) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
