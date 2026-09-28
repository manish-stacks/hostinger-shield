'use client';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  // Expose globally
  useEffect(() => {
    (window as Window & { __toast?: (m: string, t?: ToastType) => void }).__toast = (message, type = 'info') => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
      setTimeout(() => remove(id), 4000);
    };
  }, [remove]);

  const icons = {
    success: <CheckCircle size={16} className="text-emerald-400 shrink-0" />,
    error: <AlertCircle size={16} className="text-red-400 shrink-0" />,
    warning: <AlertCircle size={16} className="text-yellow-400 shrink-0" />,
    info: <Info size={16} className="text-blue-400 shrink-0" />,
  };

  const colors = {
    success: 'border-emerald-500/30 bg-emerald-500/10',
    error: 'border-red-500/30 bg-red-500/10',
    warning: 'border-yellow-500/30 bg-yellow-500/10',
    info: 'border-blue-500/30 bg-blue-500/10',
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 p-3 rounded-lg border ${colors[t.type]} backdrop-blur-sm animate-in slide-in-from-right`}
        >
          {icons[t.type]}
          <p className="text-sm text-[#e6edf3] flex-1">{t.message}</p>
          <button onClick={() => remove(t.id)} className="text-[#8b949e] hover:text-white">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// Helper to fire toasts from anywhere
export const toast = {
  success: (msg: string) => (window as Window & { __toast?: (m: string, t?: ToastType) => void }).__toast?.(msg, 'success'),
  error: (msg: string) => (window as Window & { __toast?: (m: string, t?: ToastType) => void }).__toast?.(msg, 'error'),
  warning: (msg: string) => (window as Window & { __toast?: (m: string, t?: ToastType) => void }).__toast?.(msg, 'warning'),
  info: (msg: string) => (window as Window & { __toast?: (m: string, t?: ToastType) => void }).__toast?.(msg, 'info'),
};
