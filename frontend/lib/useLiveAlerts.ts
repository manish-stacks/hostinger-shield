import { useEffect } from 'react';
import { io } from 'socket.io-client';
import Cookies from 'js-cookie';
import { toast } from '@/components/ui/Toaster';
import { useQueryClient } from '@tanstack/react-query';

const API = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || '';

function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.value = 0.15;
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15);
    });
  } catch {}
}

function browserNotify(title: string, body: string) {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') new Notification(title, { body });
    else if (Notification.permission === 'default') Notification.requestPermission();
  } catch {}
}

// Real-time hack / down alerts while the dashboard is open
export function useLiveAlerts(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const socket = io(API || undefined, {
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: Cookies.get('access_token') }),
      reconnectionDelayMax: 15000,
    });

    const refresh = () => {
      ['incidents', 'threats', 'notifications', 'unread-count', 'websites', 'dashboard'].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }));
    };

    socket.on('website:hacked', (d: { domain: string; reminder?: boolean; primaryThreat?: string }) => {
      const msg = `${d.domain} — ${(d.primaryThreat || 'threat').replace(/_/g, ' ')}`;
      toast.error(`${d.reminder ? 'REMINDER: ' : 'HACKED: '}${msg}`);
      browserNotify('Website hacked', msg);
      beep();
      refresh();
    });
    socket.on('website:down', (d: { domain: string }) => {
      toast.error(`DOWN: ${d.domain}`);
      browserNotify('Website down', d.domain);
      refresh();
    });
    socket.on('website:restored', (d: { domain: string }) => {
      toast.success(`Recovered: ${d.domain}`);
      refresh();
    });

    return () => { socket.disconnect(); };
  }, [enabled, qc]);
}
