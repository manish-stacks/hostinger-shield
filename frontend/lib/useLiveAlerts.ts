import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import Cookies from 'js-cookie';
import { toast } from '@/components/ui/Toaster';
import { useQueryClient } from '@tanstack/react-query';

const API = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || '';

function beep() {
  try {
    if (typeof window !== 'undefined' && localStorage.getItem('shield_sound_muted') === '1') return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.22, 0.44].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.value = 0.14;
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.14);
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

// Real-time hack / down / recovery / DB quota alerts while the dashboard is open
export function useLiveAlerts(enabled: boolean) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const socket = io(API || undefined, {
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: Cookies.get('access_token') }),
      reconnectionDelayMax: 15000,
    });

    const refresh = () => {
      [
        'incidents', 'incidents-dashboard',
        'threats', 'threats-dashboard',
        'notifications', 'unread-count',
        'websites', 'website-stats', 'ssl-expiring', 'dns-changed', 'db-stats',
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    };

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('website:hacked', (d: { domain: string; reminder?: boolean; primaryThreat?: string }) => {
      const msg = `${d.domain} — ${(d.primaryThreat || 'threat').replace(/_/g, ' ')}`;
      toast.error(`${d.reminder ? 'REMINDER: ' : 'HACKED: '}${msg}`);
      browserNotify('🚨 Website Hacked', msg);
      beep();
      refresh();
    });

    socket.on('website:down', (d: { domain: string; error?: string }) => {
      toast.error(`SITE DOWN: ${d.domain}${d.error ? ` (${d.error})` : ''}`);
      browserNotify('🔴 Website Down', d.domain);
      beep();
      refresh();
    });

    socket.on('website:restored', (d: { domain: string }) => {
      toast.success(`Back Online: ${d.domain}`);
      refresh();
    });

    socket.on('website:updated', () => {
      refresh();
    });

    socket.on('notification:new', () => {
      qc.invalidateQueries({ queryKey: ['unread-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    });

    socket.on('scan:completed', (d: { count?: number }) => {
      toast.success(`Scan finished (${d.count || ''} sites)`);
      refresh();
    });

    socket.on('db:warning', (d: { usedMb: number; maxMb: number }) => {
      toast.warning(`Database storage at ${d.usedMb}MB / ${d.maxMb}MB — check Settings`);
      qc.invalidateQueries({ queryKey: ['db-stats'] });
    });

    return () => {
      setConnected(false);
      socket.disconnect();
    };
  }, [enabled, qc]);

  return { connected };
}
