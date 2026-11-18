'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, Globe, Database, ShieldAlert, Flame, Lock, Network,
  HardDrive, RotateCcw, Download, FileText, Camera, Bell, Settings,
  LogOut, ChevronLeft, ChevronRight, Menu, User, Volume2, VolumeX,
  Activity, AlertOctagon, Server,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { notificationsApi, websitesApi, systemApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useLiveAlerts } from '@/lib/useLiveAlerts';

const NAV_GROUPS = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Command Center' },
      { href: '/websites',  icon: Globe,           label: 'Websites' },
      { href: '/accounts',  icon: Server,          label: 'Hostinger Accounts' },
    ],
  },
  {
    title: 'Security',
    items: [
      { href: '/threat-center',      icon: ShieldAlert, label: 'Threat Center' },
      { href: '/incidents',          icon: Flame,       label: 'Incidents' },
      { href: '/ssl-monitor',        icon: Lock,        label: 'SSL Monitor' },
      { href: '/dns-monitor',        icon: Network,     label: 'DNS Monitor' },
      { href: '/screenshot-monitor', icon: Camera,      label: 'Screenshots' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/backup-center',  icon: HardDrive, label: 'Backups' },
      { href: '/restore-center', icon: RotateCcw, label: 'Restore' },
      { href: '/export-center',  icon: Download,  label: 'Export Center' },
      { href: '/reports',        icon: FileText,  label: 'Reports' },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/alerts',   icon: Bell,     label: 'Alerts' },
      { href: '/settings', icon: Settings, label: 'Settings & DB' },
    ],
  },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, loadUser, isAuthenticated, isLoading, _initialized } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);

  const { connected } = useLiveAlerts(!!isAuthenticated);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSoundMuted(localStorage.getItem('shield_sound_muted') === '1');
    }
  }, []);

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('shield_sound_muted', next ? '1' : '0');
    }
  };

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    loadUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (_initialized && !isAuthenticated) {
      router.replace('/login');
    }
  }, [_initialized, isAuthenticated, router]);

  const { data: unreadCount } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.unreadCount().then((r) => r.data.data?.count ?? 0),
    refetchInterval: 30000,
    enabled: isAuthenticated,
  });

  const { data: liveStats } = useQuery({
    queryKey: ['website-stats'],
    queryFn: () => websitesApi.stats().then((r) => r.data.data),
    refetchInterval: 60000,
    enabled: isAuthenticated,
  });

  const { data: dbStats } = useQuery({
    queryKey: ['db-stats'],
    queryFn: () => systemApi.dbStats().then((r) => r.data.data?.db),
    refetchInterval: 120000,
    enabled: isAuthenticated,
  });

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (isLoading || !_initialized) {
    return (
      <div className="h-screen flex flex-col gap-3 items-center justify-center bg-[#070b14]">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse">
          <ShieldAlert size={20} className="text-white" />
        </div>
        <p className="text-xs text-slate-400">Loading Shield Pro…</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const downCount = liveStats?.down || 0;
  const hackedCount = liveStats?.hacked || 0;
  const dbPct = dbStats?.usagePercent ?? null;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800/80">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-cyan-500 flex items-center justify-center shrink-0 shadow-[0_4px_16px_rgba(99,102,241,0.4)]">
          <ShieldAlert size={18} className="text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <span className="font-bold text-sm text-slate-50 tracking-tight block truncate">Shield Pro</span>
            <span className="text-[10px] text-cyan-400/90 font-medium tracking-wider uppercase block">Server Guard</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ href, icon: Icon, label }) => {
                const active = pathname === href || pathname.startsWith(href + '/');
                const badgeCount =
                  label === 'Alerts' ? (unreadCount ?? 0)
                  : label === 'Threat Center' ? (liveStats?.activeThreats ?? 0)
                  : label === 'Incidents' ? (liveStats?.openIncidents ?? 0)
                  : 0;

                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? label : undefined}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] transition-all ${
                      active
                        ? 'bg-gradient-to-r from-indigo-500/20 to-cyan-500/10 text-indigo-300 font-semibold ring-1 ring-indigo-500/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <Icon size={16} className={active ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'} />
                      {collapsed && badgeCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-[#0b101d]" />
                      )}
                    </div>
                    {!collapsed && <span className="truncate flex-1">{label}</span>}
                    {!collapsed && badgeCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30 tabular-nums">
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Mini DB Quota Bar inside Sidebar */}
      {!collapsed && dbStats?.connected && (
        <Link
          href="/settings#db-storage"
          className="mx-3 mb-2 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 transition-colors"
        >
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="flex items-center gap-1.5 text-slate-400 font-medium">
              <Database size={11} className="text-cyan-400" /> DB Storage
            </span>
            <span className={`font-semibold tabular-nums ${
              dbPct >= 85 ? 'text-rose-400' : dbPct >= 65 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {dbStats.usedMB} / {dbStats.limitMB} MB
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                dbPct >= 85 ? 'bg-rose-500' : dbPct >= 65 ? 'bg-amber-500' : 'bg-gradient-to-r from-indigo-500 to-cyan-400'
              }`}
              style={{ width: `${Math.max(3, dbPct)}%` }}
            />
          </div>
        </Link>
      )}

      {/* User & Logout */}
      <div className={`border-t border-slate-800/80 p-3 ${collapsed ? 'flex flex-col gap-2 items-center' : ''}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1.5 rounded-xl bg-slate-900/60">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-cyan-500/20 ring-1 ring-indigo-500/30 flex items-center justify-center shrink-0">
              <User size={14} className="text-indigo-300" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100 truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-400 truncate capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-2 text-xs text-slate-400 hover:text-rose-400 transition-colors px-2.5 py-2 rounded-xl hover:bg-rose-500/10 w-full ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={14} />
          {!collapsed && 'Sign Out'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#070b14] overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-[#0b101d]/95 backdrop-blur-xl border-r border-slate-800/80 transition-all duration-200 ${
          collapsed ? 'w-[72px]' : 'w-60'
        } shrink-0 relative`}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label="Toggle sidebar"
          className="absolute -right-3 top-16 w-6 h-6 bg-[#131c2e] border border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:border-indigo-500/60 z-10 shadow-md transition-colors"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-[#0b101d] border-r border-slate-800 flex flex-col shadow-2xl">
            <SidebarContent />
          </div>
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Command Bar */}
        <header className="h-14 border-b border-slate-800/80 bg-[#0b101d]/80 backdrop-blur-xl flex items-center px-4 lg:px-6 gap-3 shrink-0">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden btn-ghost p-2">
            <Menu size={18} />
          </button>

          {/* Live Telemetry Pill */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs">
            <span className="relative flex h-2 w-2">
              {connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            </span>
            <span className="text-slate-300 font-medium">{connected ? 'Live Monitor' : 'Connecting…'}</span>
            {liveStats?.total !== undefined && (
              <span className="hidden sm:inline text-slate-500 border-l border-slate-700 pl-2 tabular-nums">
                {liveStats.total} sites · {liveStats.avgUptime ?? 100}% up
              </span>
            )}
          </div>

          <div className="flex-1" />

          {/* Sound Alarm Toggle */}
          <button
            onClick={toggleSound}
            title={soundMuted ? 'Alert alarm muted — click to unmute' : 'Alert alarm active — click to mute'}
            className={`btn-ghost p-2 rounded-xl ${soundMuted ? 'text-slate-500' : 'text-cyan-400'}`}
          >
            {soundMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>

          {/* DB Quick Status Pill */}
          {dbPct !== null && (
            <Link
              href="/settings#db-storage"
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-colors tabular-nums ${
                dbPct >= 85
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : dbPct >= 65
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
              title="MongoDB Storage Usage"
            >
              <Database size={12} />
              <span>DB {dbPct}%</span>
            </Link>
          )}

          {/* Notifications */}
          <Link href="/alerts" className="relative btn-ghost p-2 rounded-xl" title="Alerts">
            <Bell size={18} />
            {(unreadCount ?? 0) > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-rose-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                {(unreadCount ?? 0) > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>

          <Link href="/settings" className="btn-ghost p-2 rounded-xl" title="Settings">
            <Settings size={18} />
          </Link>
        </header>

        {/* Global Instant Emergency Strip (shows immediately when ANY site is down or hacked!) */}
        {(downCount > 0 || hackedCount > 0) && (
          <div className="bg-gradient-to-r from-rose-600/20 via-red-600/15 to-orange-600/20 border-b border-rose-500/30 px-4 lg:px-6 py-2 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2 text-rose-300 font-semibold">
              <AlertOctagon size={15} className="text-rose-400 animate-pulse shrink-0" />
              <span>IMMEDIATE ATTENTION:</span>
            </div>
            {downCount > 0 && (
              <Link
                href="/websites?status=down"
                className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 font-semibold transition-colors"
              >
                🔴 {downCount} site{downCount > 1 ? 's' : ''} DOWN
              </Link>
            )}
            {hackedCount > 0 && (
              <Link
                href="/websites?status=hacked"
                className="px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 font-semibold transition-colors"
              >
                🚨 {hackedCount} site{hackedCount > 1 ? 's' : ''} HACKED
              </Link>
            )}
            <Link href="/incidents" className="ml-auto text-rose-300 hover:text-white underline font-medium flex items-center gap-1">
              <Activity size={12} /> Open Incident Response
            </Link>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
