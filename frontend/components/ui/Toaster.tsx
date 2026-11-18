'use client';
import { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    (window as Window & { __toast?: (m: string, t?: ToastType) => void }).__toast = (message, type = 'info') => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
      setTimeout(() => remove(id), 4500);
    };
  }, [remove]);

  const icons = {
    success: <CheckCircle size={16} className="text-emerald-600 shrink-0 mt-0.5" />,
    error:   <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />,
    warning: <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />,
    info:    <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />,
  };

  const styles = {
    success: 'border-emerald-200 bg-white border-l-4 border-l-emerald-500',
    error:   'border-rose-200 bg-white border-l-4 border-l-rose-500',
    warning: 'border-amber-200 bg-white border-l-4 border-l-amber-500',
    info:    'border-indigo-200 bg-white border-l-4 border-l-indigo-500',
  };

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2.5 w-80">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 p-3.5 rounded-xl border ${styles[t.type]} shadow-lg shadow-slate-900/10`}
        >
          {icons[t.type]}
          <p className="text-sm text-slate-800 font-medium flex-1 leading-snug">{t.message}</p>
          <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export const toast = {
  success: (msg: string) => (window as Window & { __toast?: (m: string, t?: ToastType) => void }).__toast?.(msg, 'success'),
  error:   (msg: string) => (window as Window & { __toast?: (m: string, t?: ToastType) => void }).__toast?.(msg, 'error'),
  warning: (msg: string) => (window as Window & { __toast?: (m: string, t?: ToastType) => void }).__toast?.(msg, 'warning'),
  info:    (msg: string) => (window as Window & { __toast?: (m: string, t?: ToastType) => void }).__toast?.(msg, 'info'),
};
