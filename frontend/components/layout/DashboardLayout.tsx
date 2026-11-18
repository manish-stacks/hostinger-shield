'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, Globe, Database, ShieldAlert, Flame, Lock, Network,
  HardDrive, RotateCcw, Download, FileText, Camera, Bell, Settings,
  LogOut, ChevronLeft, ChevronRight, Menu, User, Volume2, VolumeX,
  Activity, AlertOctagon, Server, Search, Radio,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { notificationsApi, websitesApi, systemApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useLiveAlerts } from '@/lib/useLiveAlerts';
import { CommandPalette } from '@/components/modals/CommandPalette';

const NAV_GROUPS = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Command Center' },
      { href: '/websites',  icon: Globe,           label: 'Websites' },
      { href: '/accounts',  icon: Server,          label: 'Hostinger Accounts' },
      { href: '/status',    icon: Radio,           label: 'Live Status Page' },
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
  const [cmdOpen, setCmdOpen] = useState(false);

  const { connected } = useLiveAlerts(!!isAuthenticated);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSoundMuted(localStorage.getItem('shield_sound_muted') === '1');
    }
  }, []);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      <div className="h-screen flex flex-col gap-3 items-center justify-center bg-[#f8fafc]">
        <div className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/25 animate-pulse">
          <ShieldAlert size={22} className="text-white" />
        </div>
        <p className="text-xs font-medium text-slate-500">Loading Shield Pro…</p>
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
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-200/80">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 flex items-center justify-center shrink-0 shadow-[0_4px_14px_rgba(79,70,229,0.3)]">
          <ShieldAlert size={18} className="text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <span className="font-bold text-sm text-slate-900 tracking-tight block truncate">Shield Pro</span>
            <span className="text-[10px] text-indigo-600 font-semibold tracking-wider uppercase block">Server Guard</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
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
                        ? 'bg-indigo-50 text-indigo-700 font-semibold ring-1 ring-indigo-200/80'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <Icon size={16} className={active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-700'} />
                      {collapsed && badgeCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
                      )}
                    </div>
                    {!collapsed && <span className="truncate flex-1">{label}</span>}
                    {!collapsed && badgeCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 ring-1 ring-rose-200 tabular-nums">
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
          className="mx-3 mb-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-indigo-300 transition-colors"
        >
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="flex items-center gap-1.5 text-slate-600 font-medium">
              <Database size={11} className="text-indigo-600" /> DB Storage
            </span>
            <span className={`font-semibold tabular-nums ${
              dbPct >= 85 ? 'text-rose-600' : dbPct >= 65 ? 'text-amber-600' : 'text-emerald-600'
            }`}>
              {dbStats.usedMB} / {dbStats.limitMB} MB
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                dbPct >= 85 ? 'bg-rose-500' : dbPct >= 65 ? 'bg-amber-500' : 'bg-indigo-600'
              }`}
              style={{ width: `${Math.max(3, dbPct)}%` }}
            />
          </div>
        </Link>
      )}

      {/* User & Logout */}
      <div className={`border-t border-slate-200/80 p-3 ${collapsed ? 'flex flex-col gap-2 items-center' : ''}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-2.5 py-2 mb-1.5 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
              <User size={14} className="text-indigo-700" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-500 truncate capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-rose-600 transition-colors px-2.5 py-2 rounded-xl hover:bg-rose-50 w-full ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={14} />
          {!collapsed && 'Sign Out'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-white border-r border-slate-200/90 transition-all duration-200 ${
          collapsed ? 'w-[72px]' : 'w-60'
        } shrink-0 relative`}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label="Toggle sidebar"
          className="absolute -right-3 top-16 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-300 z-10 shadow-sm transition-colors"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-2xl">
            <SidebarContent />
          </div>
          <div className="flex-1 bg-slate-900/35 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Command Bar */}
        <header className="h-14 border-b border-slate-200/90 bg-white/90 backdrop-blur-md flex items-center px-4 lg:px-6 gap-3 shrink-0">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden btn-ghost p-2">
            <Menu size={18} />
          </button>

          {/* Live Telemetry Pill */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs">
            <span className="relative flex h-2 w-2">
              {connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            </span>
            <span className="text-slate-700 font-semibold">{connected ? 'Live' : 'Connecting…'}</span>
            {liveStats?.total !== undefined && (
              <span className="hidden sm:inline text-slate-500 border-l border-slate-200 pl-2 tabular-nums">
                {liveStats.total} sites · {liveStats.avgUptime ?? 100}% up
              </span>
            )}
          </div>

          {/* Quick Search / Command Palette Trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs text-slate-500 transition-colors w-64"
          >
            <Search size={13} className="text-slate-400" />
            <span className="flex-1 text-left">Jump to site or action…</span>
            <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] text-slate-500">⌘K</kbd>
          </button>

          <div className="flex-1" />

          {/* Sound Alarm Toggle */}
          <button
            onClick={toggleSound}
            title={soundMuted ? 'Alert alarm muted — click to unmute' : 'Alert alarm active — click to mute'}
            className={`btn-ghost p-2 rounded-xl ${soundMuted ? 'text-slate-400' : 'text-indigo-600'}`}
          >
            {soundMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>

          {/* DB Quick Status Pill */}
          {dbPct !== null && (
            <Link
              href="/settings#db-storage"
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-colors tabular-nums ${
                dbPct >= 85
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : dbPct >= 65
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300'
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
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-rose-600 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                {(unreadCount ?? 0) > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>

          <Link href="/settings" className="btn-ghost p-2 rounded-xl" title="Settings">
            <Settings size={18} />
          </Link>
        </header>

        {/* Global Instant Emergency Strip */}
        {(downCount > 0 || hackedCount > 0) && (
          <div className="bg-rose-50 border-b border-rose-200 px-4 lg:px-6 py-2 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2 text-rose-700 font-bold">
              <AlertOctagon size={15} className="text-rose-600 animate-pulse shrink-0" />
              <span>IMMEDIATE ATTENTION:</span>
            </div>
            {downCount > 0 && (
              <Link
                href="/websites?status=down"
                className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white hover:bg-rose-700 font-semibold transition-colors"
              >
                {downCount} site{downCount > 1 ? 's' : ''} DOWN
              </Link>
            )}
            {hackedCount > 0 && (
              <Link
                href="/websites?status=hacked"
                className="px-2.5 py-0.5 rounded-full bg-orange-600 text-white hover:bg-orange-700 font-semibold transition-colors"
              >
                {hackedCount} site{hackedCount > 1 ? 's' : ''} HACKED
              </Link>
            )}
            <Link href="/incidents" className="ml-auto text-rose-700 hover:text-rose-900 underline font-semibold flex items-center gap-1">
              <Activity size={12} /> Open Incident Response
            </Link>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
