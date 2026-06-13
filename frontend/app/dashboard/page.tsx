'use client';
import { useQuery } from '@tanstack/react-query';
import {
  Globe, ShieldAlert, Lock, AlertTriangle, CheckCircle,
  Flame, Network, TrendingUp, RefreshCw,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { websitesApi, monitoringApi } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b949e'];
const REFETCH_MS  = 60_000;

// ── tiny helpers ──────────────────────────────────────────────────────────────
const severityColor = (s: string) => {
  if (s === 'critical' || s === 'high') return 'text-red-400';
  if (s === 'medium') return 'text-yellow-400';
  return 'text-blue-400';
};

const sslColor = (days: number) => {
  if (days <= 3)  return 'badge-danger';
  if (days <= 7)  return 'badge-danger';
  if (days <= 30) return 'badge-warning';
  return 'badge-success';
};

export default function DashboardPage() {

  // ── stats ──────────────────────────────────────────────────────────────────
  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['website-stats'],
    queryFn: () => websitesApi.stats().then((r) => r.data.data),
    refetchInterval: REFETCH_MS,
  });
  const stats = statsData || {};

  // ── recent threats (latest 6) ──────────────────────────────────────────────
  const { data: threatsData } = useQuery({
    queryKey: ['threats-dashboard'],
    queryFn: () =>
      monitoringApi.getThreats({ limit: 6, sort: '-detectedAt' }).then((r) => r.data),
    refetchInterval: REFETCH_MS,
  });
  const threats = threatsData?.data || [];

  // ── ssl expiring ───────────────────────────────────────────────────────────
  const { data: sslData } = useQuery({
    queryKey: ['ssl-expiring'],
    queryFn: () => monitoringApi.getSSLExpiring().then((r) => r.data.data),
    refetchInterval: REFETCH_MS,
  });
  const expiring = sslData || [];

  // ── recent incidents ───────────────────────────────────────────────────────
  const { data: incidentsData } = useQuery({
    queryKey: ['incidents-dashboard'],
    queryFn: () =>
      monitoringApi.getIncidents({ limit: 5, status: 'open', sort: '-detectionTime' }).then((r) => r.data),
    refetchInterval: REFETCH_MS,
  });
  const incidents = incidentsData?.data || [];

  // ── dns changes ────────────────────────────────────────────────────────────
  const { data: dnsData } = useQuery({
    queryKey: ['dns-changed'],
    queryFn: () =>
      monitoringApi.getDNS({ hasChanged: 'true', limit: 5 }).then((r) => r.data),
    refetchInterval: REFETCH_MS,
  });
  const dnsChanges = dnsData?.data || [];

  // ── pie chart data ─────────────────────────────────────────────────────────
  const pieData = [
    { name: 'Healthy', value: stats.healthy  || 0 },
    { name: 'Warning', value: stats.warning  || 0 },
    { name: 'Hacked',  value: stats.hacked   || 0 },
    { name: 'Down',    value: stats.down     || 0 },
    { name: 'Unknown', value: stats.unknown  || 0 },
  ].filter((d) => d.value > 0);

  // ── threat trend (last 7 days from threats) ────────────────────────────────
  const trendMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    trendMap[d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })] = 0;
  }
  threats.forEach((t: Record<string, unknown>) => {
    const date = t.detectedAt || t.createdAt;
    if (!date) return;
    const key = new Date(date as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    if (key in trendMap) trendMap[key]++;
  });
  const trendData = Object.entries(trendMap).map(([date, count]) => ({ date, count }));

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-xs text-[#8b949e] mt-0.5">
            Last updated {new Date().toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={() => refetchStats()}
          className="btn-secondary text-xs"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* ── Stat Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Total Websites',
            value: statsLoading ? '…' : (stats.total ?? 0),
            icon: Globe,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            href: '/websites',
          },
          {
            label: 'Healthy',
            value: statsLoading ? '…' : (stats.healthy ?? 0),
            icon: CheckCircle,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            href: '/websites?status=healthy',
          },
          {
            label: 'Active Threats',
            value: statsLoading ? '…' : (stats.activeThreats ?? 0),
            icon: ShieldAlert,
            color: 'text-red-400',
            bg: 'bg-red-500/10',
            href: '/threat-center',
            alert: (stats.activeThreats ?? 0) > 0,
          },
          {
            label: 'SSL Expiring',
            value: statsLoading ? '…' : (stats.sslExpiring ?? expiring.length),
            icon: Lock,
            color: 'text-yellow-400',
            bg: 'bg-yellow-500/10',
            href: '/ssl-monitor',
            alert: (stats.sslExpiring ?? 0) > 0,
          },
        ].map(({ label, value, icon: Icon, color, bg, href, alert }) => (
          <Link key={label} href={href} className="stat-card hover:border-[#3b5bdb]/40 transition-colors group">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
              <Icon size={18} className={color} />
            </div>
            <p className={`text-2xl font-bold ${alert ? 'text-red-400' : 'text-[#e6edf3]'}`}>
              {value}
            </p>
            <p className="text-xs text-[#8b949e] group-hover:text-[#e6edf3] transition-colors">{label}</p>
          </Link>
        ))}
      </div>

      {/* ── Row 2: Status breakdown + Threat trend ────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">

        {/* Pie chart */}
        <div className="card">
          <p className="section-title mb-3">Website Status</p>
          {pieData.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-[#8b949e] text-sm gap-2">
              <Globe size={28} className="opacity-30" />
              No websites yet
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={45} outerRadius={70}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: '#8b949e' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-1">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs text-[#8b949e]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i] }} />
                    {d.name}: <span className="text-[#e6edf3] font-medium">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Threat trend (area chart) — spans 2 cols */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">Threat Activity (7 days)</p>
            <TrendingUp size={14} className="text-[#8b949e]" />
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="threatGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8b949e' }} />
              <YAxis tick={{ fontSize: 10, fill: '#8b949e' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }}
                itemStyle={{ color: '#8b949e' }}
              />
              <Area
                type="monotone"
                dataKey="count"
                name="Threats"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#threatGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Row 3: Recent Threats + SSL Expiring + Incidents/DNS ──────────── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Recent Threats */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">Recent Threats</p>
            <Link href="/threat-center" className="text-xs text-[#3b5bdb] hover:underline">View all</Link>
          </div>
          {threats.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-[#8b949e] text-sm">
              <CheckCircle size={14} className="mr-2 text-emerald-400" /> No active threats
            </div>
          ) : (
            <div className="space-y-2.5">
              {threats.map((t: Record<string, unknown>) => (
                <div key={t._id as string} className="flex items-start gap-2 py-1.5 border-b border-[#21262d] last:border-0">
                  <AlertTriangle size={13} className={`mt-0.5 shrink-0 ${severityColor(t.severity as string)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[#e6edf3] truncate">
                      {((t.threatType || t.type) as string)?.replace(/_/g, ' ') || '—'}
                    </p>
                    <p className="text-[10px] text-[#8b949e] truncate">
                      {(t.website as { domain?: string })?.domain || '—'}
                    </p>
                    <p className="text-[10px] text-[#8b949e]">
                      {(t.detectedAt || t.createdAt)
                        ? formatDistanceToNow(new Date((t.detectedAt || t.createdAt) as string), { addSuffix: true })
                        : ''}
                    </p>
                  </div>
                  {t.isResolved
                    ? <span className="badge-success text-[10px]">Resolved</span>
                    : <span className="badge-danger text-[10px]">Active</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SSL Expiring */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">SSL Expiring Soon</p>
            <Link href="/ssl-monitor" className="text-xs text-[#3b5bdb] hover:underline">View all</Link>
          </div>
          {expiring.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-[#8b949e] text-sm">
              <CheckCircle size={14} className="mr-2 text-emerald-400" /> All certs valid
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {expiring.slice(0, 8).map((s: Record<string, unknown>) => {
                const days = s.daysUntilExpiry as number;
                const site = s.website as { domain?: string } | null;
                return (
                  <div key={s._id as string} className="flex items-center justify-between py-1.5 border-b border-[#21262d] last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#e6edf3] truncate max-w-[140px]">
                        {site?.domain || '—'}
                      </p>
                      <p className="text-[10px] text-[#8b949e]">
                        {s.validTo ? `Expires ${new Date(s.validTo as string).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <span className={`badge ${sslColor(days)}`}>
                      {days != null ? `${days}d` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Open Incidents + DNS Changes stacked */}
        <div className="flex flex-col gap-4">

          {/* Open Incidents */}
          <div className="card flex-1">
            <div className="flex items-center justify-between mb-3">
              <p className="section-title">Open Incidents</p>
              <Link href="/incidents" className="text-xs text-[#3b5bdb] hover:underline">View all</Link>
            </div>
            {incidents.length === 0 ? (
              <div className="h-20 flex items-center justify-center text-[#8b949e] text-sm">
                <CheckCircle size={13} className="mr-2 text-emerald-400" /> None open
              </div>
            ) : (
              <div className="space-y-2">
                {incidents.map((i: Record<string, unknown>) => (
                  <div key={i._id as string} className="flex items-center gap-2 py-1 border-b border-[#21262d] last:border-0">
                    <Flame size={12} className="text-orange-400 shrink-0" />
                    <p className="text-xs text-[#e6edf3] truncate flex-1">{i.title as string}</p>
                    <span className={`text-[10px] font-medium ${severityColor(i.severity as string)}`}>
                      {i.severity as string}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* DNS Changes */}
          <div className="card flex-1">
            <div className="flex items-center justify-between mb-3">
              <p className="section-title">DNS Changes</p>
              <Link href="/dns-monitor" className="text-xs text-[#3b5bdb] hover:underline">View all</Link>
            </div>
            {dnsChanges.length === 0 ? (
              <div className="h-20 flex items-center justify-center text-[#8b949e] text-sm">
                <CheckCircle size={13} className="mr-2 text-emerald-400" /> No changes
              </div>
            ) : (
              <div className="space-y-2">
                {dnsChanges.map((d: Record<string, unknown>) => {
                  const site = d.website as { domain?: string } | null;
                  return (
                    <div key={d._id as string} className="flex items-center gap-2 py-1 border-b border-[#21262d] last:border-0">
                      <Network size={12} className="text-purple-400 shrink-0" />
                      <p className="text-xs text-[#e6edf3] truncate flex-1">{site?.domain || '—'}</p>
                      <span className="text-[10px] text-[#8b949e]">
                        {d.checkedAt
                          ? formatDistanceToNow(new Date(d.checkedAt as string), { addSuffix: true })
                          : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}