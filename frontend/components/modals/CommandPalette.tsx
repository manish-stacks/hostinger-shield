'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Globe, ShieldAlert, Lock, Flame, Settings,
  Activity, Zap, Database, X, ArrowRight,
} from 'lucide-react';
import { websitesApi, systemApi } from '@/lib/api';
import { useDebounce } from '@/lib/useDebounce';
import { toast } from '@/components/ui/Toaster';

const QUICK_LINKS = [
  { label: 'Command Center Dashboard', href: '/dashboard', icon: Activity },
  { label: 'All Monitored Websites', href: '/websites', icon: Globe },
  { label: 'Down Websites Only', href: '/websites?status=down', icon: Globe },
  { label: 'Threat Center', href: '/threat-center', icon: ShieldAlert },
  { label: 'Open Incidents', href: '/incidents', icon: Flame },
  { label: 'SSL Certificate Monitor', href: '/ssl-monitor', icon: Lock },
  { label: 'Public Live Status Page', href: '/status', icon: Activity },
  { label: 'Database Storage & Settings', href: '/settings#db-storage', icon: Settings },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 200);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const { data: siteRes } = useQuery({
    queryKey: ['cmd-sites', debounced],
    queryFn: () => websitesApi.list({ search: debounced, limit: 8 }).then((r) => r.data.data),
    enabled: open && debounced.length >= 1,
  });

  if (!open) return null;

  const sites = siteRes || [];
  const filteredLinks = QUICK_LINKS.filter((l) =>
    !query.trim() || l.label.toLowerCase().includes(query.toLowerCase())
  );

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const runAction = async (type: 'scan' | 'cleanup') => {
    onClose();
    try {
      if (type === 'scan') {
        const res = await websitesApi.fullScan();
        toast.success(`Full scan started for ${res.data.started ?? ''} sites`);
      } else {
        const res = await systemApi.cleanup('normal');
        toast.success(res.data.message || 'Database optimized');
      }
    } catch {
      toast.error('Action failed');
    }
  };

  return (
    <div className="modal-overlay items-start pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200">
          <Search size={17} className="text-slate-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any domain, page, or quick action..."
            className="flex-1 text-sm text-slate-900 placeholder-slate-400 focus:outline-none bg-transparent"
            autoFocus
          />
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X size={15} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-3">
          {sites.length > 0 && (
            <div>
              <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Websites
              </p>
              {sites.map((s: Record<string, unknown>) => (
                <button
                  key={s._id as string}
                  onClick={() => go(`/websites/${s._id as string}`)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-indigo-50 text-left transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    s.status === 'healthy' ? 'bg-emerald-500'
                    : s.status === 'down' ? 'bg-rose-500'
                    : s.status === 'hacked' ? 'bg-orange-500'
                    : 'bg-slate-400'
                  }`} />
                  <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{s.domain as string}</span>
                  <span className="text-xs text-slate-500 capitalize">{s.status as string}</span>
                  {s.responseTime ? (
                    <span className="text-xs text-slate-400 tabular-nums">{s.responseTime as number}ms</span>
                  ) : null}
                  <ArrowRight size={13} className="text-slate-400" />
                </button>
              ))}
            </div>
          )}

          {!query.trim() && (
            <div>
              <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Instant Actions
              </p>
              <button
                onClick={() => runAction('scan')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-indigo-50 text-left transition-colors"
              >
                <Zap size={15} className="text-indigo-600 shrink-0" />
                <span className="text-sm font-medium text-slate-800 flex-1">Run Full Server Scan Now</span>
                <span className="text-[11px] text-slate-400">Action</span>
              </button>
              <button
                onClick={() => runAction('cleanup')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-indigo-50 text-left transition-colors"
              >
                <Database size={15} className="text-sky-600 shrink-0" />
                <span className="text-sm font-medium text-slate-800 flex-1">Optimize &amp; Clean MongoDB Now</span>
                <span className="text-[11px] text-slate-400">Action</span>
              </button>
            </div>
          )}

          {filteredLinks.length > 0 && (
            <div>
              <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Navigation
              </p>
              {filteredLinks.map(({ label, href, icon: Icon }) => (
                <button
                  key={href}
                  onClick={() => go(href)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-100 text-left transition-colors"
                >
                  <Icon size={15} className="text-slate-500 shrink-0" />
                  <span className="text-sm text-slate-700 flex-1">{label}</span>
                  <ArrowRight size={13} className="text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span>Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px]">⌘K</kbd> anytime to search</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
}
