'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, Globe, Database, ShieldAlert, Flame, Lock, Network,
  HardDrive, RotateCcw, Download, FileText, Camera, Bell, Settings,
  LogOut, ChevronLeft, ChevronRight, Menu, User,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { notificationsApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

const NAV_ITEMS = [
  { href: '/dashboard',          icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/websites',           icon: Globe,           label: 'Websites' },
  { href: '/accounts',           icon: Database,        label: 'Accounts' },
  { href: '/threat-center',      icon: ShieldAlert,     label: 'Threats' },
  { href: '/incidents',          icon: Flame,           label: 'Incidents' },
  { href: '/ssl-monitor',        icon: Lock,            label: 'SSL Monitor' },
  { href: '/dns-monitor',        icon: Network,         label: 'DNS Monitor' },
  { href: '/backup-center',      icon: HardDrive,       label: 'Backups' },
  { href: '/restore-center',     icon: RotateCcw,       label: 'Restore' },
  { href: '/screenshot-monitor', icon: Camera,          label: 'Screenshots' },
  { href: '/export-center',      icon: Download,        label: 'Export' },
  { href: '/reports',            icon: FileText,        label: 'Reports' },
  { href: '/alerts',             icon: Bell,            label: 'Alerts' },
  { href: '/settings',           icon: Settings,        label: 'Settings' },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, loadUser, isAuthenticated, isLoading, _initialized } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // loadUser fires ONCE per mount — checks cookie → validates token → sets state
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    loadUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Only redirect AFTER initialization is complete AND user is not authenticated.
  // This prevents redirect on initial render before the token check finishes.
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

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  // Show spinner while checking auth (prevents flash of login page)
  if (isLoading || !_initialized) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0d1117]">
        <div className="w-8 h-8 border-2 border-[#3b5bdb] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Still not authenticated after init → redirect triggered above, render null
  if (!isAuthenticated) return null;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-[#21262d]">
        <div className="w-8 h-8 rounded-lg bg-[#3b5bdb] flex items-center justify-center shrink-0">
          <ShieldAlert size={16} className="text-white" />
        </div>
        {!collapsed && <span className="font-bold text-sm text-[#e6edf3] truncate">Shield Pro</span>}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                active
                  ? 'bg-[#3b5bdb]/20 text-[#3b5bdb] font-medium'
                  : 'text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]'
              }`}
            >
              <div className="relative">
                <Icon size={16} className="shrink-0" />
                {label === 'Alerts' && unreadCount && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
                
              </div>
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={`border-t border-[#21262d] p-3 ${collapsed ? 'flex flex-col gap-2 items-center' : ''}`}>
        {!collapsed && (
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <div className="w-7 h-7 rounded-full bg-[#3b5bdb]/20 flex items-center justify-center shrink-0">
              <User size={13} className="text-[#3b5bdb]" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#e6edf3] truncate">{user?.name}</p>
              <p className="text-[10px] text-[#8b949e] truncate">{user?.role}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-2 text-xs text-[#8b949e] hover:text-red-400 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-500/10 w-full ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={14} />
          {!collapsed && 'Logout'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#0d1117] overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-[#161b22] border-r border-[#21262d] transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        } shrink-0 relative`}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-20 w-6 h-6 bg-[#21262d] border border-[#30363d] rounded-full flex items-center justify-center text-[#8b949e] hover:text-white z-10"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-56 bg-[#161b22] border-r border-[#21262d] flex flex-col">
            <SidebarContent />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-[#21262d] bg-[#161b22] flex items-center px-4 gap-3 shrink-0">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden btn-ghost p-1.5">
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          <Link href="/alerts" className="relative btn-ghost p-1.5">
            <Bell size={18} />
            {unreadCount && unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </Link>
          <Link href="/settings" className="btn-ghost p-1.5">
            <Settings size={18} />
          </Link>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}