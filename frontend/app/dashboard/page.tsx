'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe, ShieldAlert, Lock, AlertTriangle, CheckCircle,
  Flame, Network, TrendingUp, RefreshCw, Activity, Zap,
  WifiOff, Gauge, Database, ArrowUpRight, Loader2,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { websitesApi, monitoringApi, systemApi } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

const PIE_COLORS: Record<string, string> = {
  Healthy: '#10b981',
  Warning: '#f59e0b',
  Hacked:  '#f97316',
  Down:    '#ef4444',
  Unknown: '#64748b',
};

const REFETCH_MS = 30_000;

const severityColor = (s: string) => {
  if (s === 'critical' || s === 'high') return 'text-rose-400';
  if (s === 'medium') return 'text-amber-400';
  return 'text-sky-400';
};

const sslColor = (days: number) => {
  if (days <= 0)  return 'badge-danger';
  if (days <= 7)  return 'badge-danger';
  if (days <= 30) return 'badge-warning';
  return 'badge-success';
};

const tileStatusClass = (status: string, enabled?: boolean) => {
  if (enabled === false) return 'bg-slate-800/70 border-slate-700/60 text-slate-400';
  if (status === 'down') return 'bg-rose-500/15 border-rose-500/50 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.2)]';
  if (status === 'hacked' || status === 'critical') return 'bg-orange-500/15 border-orange-500/50 text-orange-300';
  if (status === 'warning') return 'bg-amber-500/15 border-amber-500/40 text-amber-300';
  if (status === 'healthy') return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300 hover:border-emerald-400/60';
  return 'bg-slate-800/60 border-slate-700/70 text-slate-400';
};

const dotStatusClass = (status: string, enabled?: boolean) => {
  if (enabled === false) return 'bg-slate-500';
  if (status === 'down') return 'bg-rose-500 animate-ping';
  if (status === 'hacked' || status === 'critical') return 'bg-orange-500 animate-pulse';
  if (status === 'warning') return 'bg-amber-400';
  if (status === 'healthy') return 'bg-emerald-400';
  return 'bg-slate-500';
};

export default function DashboardPage() {
  const qc = useQueryClient();

  const { data: statsData, isLoading: statsLoading, isFetching, refetch: refetchStats } = useQuery({
    queryKey: ['website-stats'],
    queryFn: () => websitesApi.stats().then((r) => r.data.data),
    refetchInterval: REFETCH_MS,
  });
  const stats = statsData || {};

  const { data: threatsData } = useQuery({
    queryKey: ['threats-dashboard'],
    queryFn: () => monitoringApi.getThreats({ limit: 6, sort: '-detectedAt' }).then((r) => r.data),
    refetchInterval: REFETCH_MS,
  });
  const threats = threatsData?.data || [];

  const { data: sslData } = useQuery({
    queryKey: ['ssl-expiring'],
    queryFn: () => monitoringApi.getSSLExpiring().then((r) => r.data.data),
    refetchInterval: REFETCH_MS,
  });
  const expiring = sslData || [];

  const { data: incidentsData } = useQuery({
    queryKey: ['incidents-dashboard'],
    queryFn: () => monitoringApi.getIncidents({ limit: 5, status: 'open' }).then((r) => r.data),
    refetchInterval: REFETCH_MS,
  });
  const incidents = incidentsData?.data || [];

  const { data: dnsData } = useQuery({
    queryKey: ['dns-changed'],
    queryFn: () => monitoringApi.getDNS({ hasChanged: 'true', limit: 5 }).then((r) => r.data),
    refetchInterval: REFETCH_MS,
  });
  const dnsChanges = dnsData?.data || [];

  const { data: dbData } = useQuery({
    queryKey: ['db-stats'],
    queryFn: () => systemApi.dbStats().then((r) => r.data.data?.db),
    refetchInterval: 120_000,
  });

  const fullScanMutation = useMutation({
    mutationFn: () => websitesApi.fullScan(),
    onSuccess: (res) => toast.success(`Full scan started for ${res.data.started ?? ''} sites`),
    onError: () => toast.error('Failed to start scan'),
  });

  const pingMutation = useMutation({
    mutationFn: (id: string) => websitesApi.ping(id),
    onSuccess: (res) => {
      const r = res.data.data;
      if (r.isUp) toast.success(`${r.domain} is UP (${r.responseTime}ms)`);
      else toast.error(`${r.domain} still DOWN (${r.error || 'unreachable'})`);
      qc.invalidateQueries({ queryKey: ['website-stats'] });
    },
    onError: () => toast.error('Ping failed'),
  });

  const pieData = [
    { name: 'Healthy', value: stats.healthy || 0 },
    { name: 'Warning', value: stats.warning || 0 },
    { name: 'Hacked',  value: stats.hacked  || 0 },
    { name: 'Down',    value: stats.down    || 0 },
    { name: 'Unknown', value: stats.unknown || 0 },
  ].filter((d) => d.value > 0);

  const trendData = stats.trend7d || [];
  const downSites = stats.downSites || [];
  const hackedSites = stats.hackedSites || [];
  const liveMatrix = stats.liveMatrix || [];

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2.5">
            Command Center
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
              Real-Time
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Server-wide uptime, security threat radar, SSL &amp; DNS telemetry · Auto-refresh 30s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fullScanMutation.mutate()}
            disabled={fullScanMutation.isPending}
            className="btn-primary text-xs"
          >
            {fullScanMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Scan All Sites
          </button>
          <button onClick={() => refetchStats()} className="btn-secondary text-xs">
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Top KPI Grid (6 high-signal cards) ─────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {[
          {
            label: 'Total Monitored',
            value: statsLoading ? '…' : (stats.total ?? 0),
            sub: `${stats.avgUptime ?? 100}% uptime`,
            icon: Globe,
            color: 'text-indigo-400',
            bg: 'bg-indigo-500/15',
            href: '/websites',
          },
          {
            label: 'Healthy Online',
            value: statsLoading ? '…' : (stats.healthy ?? 0),
            sub: stats.total ? `${Math.round(((stats.healthy || 0) / stats.total) * 100)}% of fleet` : '—',
            icon: CheckCircle,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/15',
            href: '/websites?status=healthy',
          },
          {
            label: 'Sites Down',
            value: statsLoading ? '…' : (stats.down ?? 0),
            sub: (stats.down ?? 0) > 0 ? 'Action required!' : 'All responding',
            icon: WifiOff,
            color: 'text-rose-400',
            bg: 'bg-rose-500/15',
            href: '/websites?status=down',
            alert: (stats.down ?? 0) > 0,
          },
          {
            label: 'Active Threats',
            value: statsLoading ? '…' : (stats.activeThreats ?? 0),
            sub: `${stats.hacked ?? 0} compromised`,
            icon: ShieldAlert,
            color: 'text-orange-400',
            bg: 'bg-orange-500/15',
            href: '/threat-center',
            alert: (stats.activeThreats ?? 0) > 0,
          },
          {
            label: 'SSL Alerts',
            value: statsLoading ? '…' : ((stats.sslExpiring ?? 0) + (stats.sslExpired ?? 0)),
            sub: `${stats.sslExpired ?? 0} expired · ${stats.sslExpiring ?? 0} soon`,
            icon: Lock,
            color: 'text-amber-400',
            bg: 'bg-amber-500/15',
            href: '/ssl-monitor',
            alert: (stats.sslExpired ?? 0) > 0,
          },
          {
            label: 'Avg Response',
            value: statsLoading ? '…' : (stats.avgResponseTime ? `${stats.avgResponseTime}ms` : '—'),
            sub: `${stats.slowSites ?? 0} slow (>3s)`,
            icon: Gauge,
            color: 'text-cyan-400',
            bg: 'bg-cyan-500/15',
            href: '/websites?status=slow',
          },
        ].map(({ label, value, sub, icon: Icon, color, bg, href, alert }) => (
          <Link
            key={label}
            href={href}
            className={`stat-card group ${
              alert ? 'border-rose-500/40 bg-rose-950/15 hover:border-rose-500/70' : 'hover:border-indigo-500/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={17} className={color} />
              </div>
              <ArrowUpRight size={14} className="text-slate-600 group-hover:text-slate-300 transition-colors" />
            </div>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${alert ? 'text-rose-400' : 'text-slate-50'}`}>
              {value}
            </p>
            <div>
              <p className="text-xs font-medium text-slate-300">{label}</p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Urgent Action Cards (Down / Hacked Sites) ─────────────────────── */}
      {(downSites.length > 0 || hackedSites.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          {downSites.length > 0 && (
            <div className="card border-rose-500/35 bg-rose-950/15">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <WifiOff size={15} className="text-rose-400" />
                  <p className="section-title text-rose-300">Currently Down ({downSites.length})</p>
                </div>
                <Link href="/websites?status=down" className="text-xs text-rose-300 hover:underline">View all</Link>
              </div>
              <div className="space-y-2">
                {downSites.map((s: Record<string, unknown>) => (
                  <div key={s._id as string} className="flex items-center gap-3 p-2.5 rounded-xl bg-[#070b14]/70 border border-rose-500/20">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/websites/${s._id as string}`} className="text-sm font-semibold text-slate-100 hover:text-indigo-300 truncate block">
                        {s.domain as string}
                      </Link>
                      <p className="text-[11px] text-rose-300/80 truncate">
                        {(s.lastError as string) || `HTTP ${s.httpStatus || 'timeout'}`}
                        {s.downSince ? ` · down ${formatDistanceToNow(new Date(s.downSince as string), { addSuffix: true })}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => pingMutation.mutate(s._id as string)}
                      disabled={pingMutation.isPending && pingMutation.variables === (s._id as string)}
                      className="btn-secondary py-1 px-2.5 text-xs shrink-0"
                    >
                      {pingMutation.isPending && pingMutation.variables === (s._id as string)
                        ? <Loader2 size={12} className="animate-spin" />
                        : 'Re-check'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hackedSites.length > 0 && (
            <div className="card border-orange-500/35 bg-orange-950/15">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={15} className="text-orange-400" />
                  <p className="section-title text-orange-300">Compromised / Hacked ({hackedSites.length})</p>
                </div>
                <Link href="/threat-center" className="text-xs text-orange-300 hover:underline">Threat Center</Link>
              </div>
              <div className="space-y-2">
                {hackedSites.map((s: Record<string, unknown>) => (
                  <Link
                    key={s._id as string}
                    href={`/websites/${s._id as string}`}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-[#070b14]/70 border border-orange-500/20 hover:border-orange-500/50 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shrink-0" />
                    <span className="text-sm font-semibold text-slate-100 truncate flex-1">{s.domain as string}</span>
                    <span className="badge-danger tabular-nums">Score {s.threatScore as number}/100</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Live Server Status Wall (Quick Fleet Overview) ─────────────────── */}
      {liveMatrix.length > 0 && (
        <div className="card mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-cyan-400" />
              <p className="section-title">Live Server Fleet Matrix</p>
              <span className="text-[11px] text-slate-500">({liveMatrix.length} shown)</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Healthy</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Down</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" /> Hacked</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> Warning</span>
              <Link href="/websites" className="text-indigo-400 hover:underline ml-2">Manage all →</Link>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {liveMatrix.map((site: Record<string, unknown>) => (
              <Link
                key={site._id as string}
                href={`/websites/${site._id as string}`}
                title={`${site.domain} · ${site.status} · ${site.responseTime ? `${site.responseTime}ms` : 'N/A'} · SSL: ${site.sslDaysLeft ?? '—'}d`}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs transition-all hover:scale-[1.01] ${tileStatusClass(site.status as string, site.isMonitoringEnabled as boolean)}`}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className={`inline-flex rounded-full h-2 w-2 ${dotStatusClass(site.status as string, site.isMonitoringEnabled as boolean)}`} />
                </span>
                <span className="truncate font-medium flex-1">{site.domain as string}</span>
                {site.responseTime ? (
                  <span className="text-[10px] opacity-70 tabular-nums shrink-0">{site.responseTime as number}ms</span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Row 2: Status Donut + Real 7-Day Threat Activity + DB Storage ──── */}
      <div className="grid lg:grid-cols-12 gap-6 mb-6">
        {/* Pie chart */}
        <div className="card lg:col-span-3">
          <p className="section-title mb-3">Fleet Health Split</p>
          {pieData.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
              <Globe size={28} className="opacity-30" />
              No websites yet
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={46} outerRadius={70} dataKey="value" paddingAngle={3}>
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={PIE_COLORS[d.name] || '#64748b'} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#0d1321', border: '1px solid #334155', borderRadius: 10, fontSize: 12 }}
                    itemStyle={{ color: '#e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
                {pieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[d.name] || '#64748b' }} />
                    {d.name}: <span className="text-slate-100 font-semibold tabular-nums">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Threat trend (7 days real aggregation) */}
        <div className="card lg:col-span-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="section-title">Threat Activity (Last 7 Days)</p>
              <p className="text-[11px] text-slate-500 mt-0.5">All detected threats aggregated daily</p>
            </div>
            <TrendingUp size={15} className="text-rose-400" />
          </div>
          <ResponsiveContainer width="100%" height={175}>
            <AreaChart data={trendData} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="threatGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#0d1321', border: '1px solid #334155', borderRadius: 10, fontSize: 12 }}
                itemStyle={{ color: '#f8fafc' }}
              />
              <Area type="monotone" dataKey="count" name="Threats" stroke="#f43f5e" strokeWidth={2.5} fill="url(#threatGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Database Health & Quota Guard Card */}
        <div className="card lg:col-span-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="section-title flex items-center gap-1.5">
                <Database size={13} className="text-cyan-400" /> DB Storage Guard
              </p>
              <Link href="/settings#db-storage" className="text-xs text-indigo-400 hover:underline">Manage</Link>
            </div>
            {dbData?.connected ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-slate-50 tabular-nums">{dbData.usedMB} <span className="text-xs font-normal text-slate-400">MB</span></span>
                  <span className="text-xs text-slate-400 tabular-nums">/ {dbData.limitMB} MB cap</span>
                </div>
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      dbData.usagePercent >= 85 ? 'bg-rose-500' : dbData.usagePercent >= 65 ? 'bg-amber-500' : 'bg-gradient-to-r from-indigo-500 to-cyan-400'
                    }`}
                    style={{ width: `${Math.max(4, dbData.usagePercent)}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-slate-500 block">Data</span>
                    <span className="text-slate-200 font-semibold tabular-nums">{dbData.dataSizeMB} MB</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-slate-500 block">Indexes</span>
                    <span className="text-slate-200 font-semibold tabular-nums">{dbData.indexSizeMB} MB</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-8 text-center">Loading DB telemetry…</p>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-3 pt-2.5 border-t border-slate-800/80">
            Auto-prunes every 30m if over {dbData?.limitMB || 380}MB · Capped per site
          </p>
        </div>
      </div>

      {/* ── Row 3: Recent Threats + SSL Expiring + Incidents/DNS ──────────── */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Threats */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">Recent Threats</p>
            <Link href="/threat-center" className="text-xs text-indigo-400 hover:underline">View all</Link>
          </div>
          {threats.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-slate-500 text-sm">
              <CheckCircle size={15} className="mr-2 text-emerald-400" /> All sites clean
            </div>
          ) : (
            <div className="space-y-2">
              {threats.map((t: Record<string, unknown>) => (
                <div key={t._id as string} className="flex items-start gap-2.5 py-2 border-b border-slate-800/60 last:border-0">
                  <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${severityColor(t.severity as string)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-100 truncate capitalize">
                      {((t.threatType || t.type) as string)?.replace(/_/g, ' ') || '—'}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {(t.website as { domain?: string })?.domain || '—'}
                    </p>
                    <p className="text-[10px] text-slate-500">
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

        {/* SSL Expiring Soon */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">SSL Expiring Soon</p>
            <Link href="/ssl-monitor" className="text-xs text-indigo-400 hover:underline">View all</Link>
          </div>
          {expiring.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-slate-500 text-sm">
              <CheckCircle size={15} className="mr-2 text-emerald-400" /> All certs healthy
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {expiring.slice(0, 8).map((s: Record<string, unknown>) => {
                const days = s.daysUntilExpiry as number;
                const site = s.website as { _id?: string; domain?: string } | null;
                return (
                  <div key={s._id as string} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
                    <div className="min-w-0">
                      <Link
                        href={site?._id ? `/websites/${site._id}` : '/ssl-monitor'}
                        className="text-xs font-semibold text-slate-100 hover:text-indigo-300 truncate block max-w-[180px]"
                      >
                        {site?.domain || '—'}
                      </Link>
                      <p className="text-[10px] text-slate-500">
                        {s.validTo ? `Expires ${new Date(s.validTo as string).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <span className={`badge tabular-nums ${sslColor(days)}`}>
                      {days != null ? (days <= 0 ? 'Expired' : `${days}d`) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Open Incidents + DNS Changes */}
        <div className="flex flex-col gap-4">
          <div className="card flex-1">
            <div className="flex items-center justify-between mb-3">
              <p className="section-title">Open Incidents</p>
              <Link href="/incidents" className="text-xs text-indigo-400 hover:underline">View all</Link>
            </div>
            {incidents.length === 0 ? (
              <div className="h-20 flex items-center justify-center text-slate-500 text-sm">
                <CheckCircle size={14} className="mr-2 text-emerald-400" /> No open incidents
              </div>
            ) : (
              <div className="space-y-2">
                {incidents.map((i: Record<string, unknown>) => (
                  <div key={i._id as string} className="flex items-center gap-2 py-1.5 border-b border-slate-800/60 last:border-0">
                    <Flame size={13} className="text-orange-400 shrink-0" />
                    <p className="text-xs font-medium text-slate-200 truncate flex-1">{i.title as string}</p>
                    <span className={`text-[10px] font-semibold uppercase ${severityColor(i.severity as string)}`}>
                      {i.severity as string}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card flex-1">
            <div className="flex items-center justify-between mb-3">
              <p className="section-title">DNS Changes</p>
              <Link href="/dns-monitor" className="text-xs text-indigo-400 hover:underline">View all</Link>
            </div>
            {dnsChanges.length === 0 ? (
              <div className="h-20 flex items-center justify-center text-slate-500 text-sm">
                <CheckCircle size={14} className="mr-2 text-emerald-400" /> All DNS stable
              </div>
            ) : (
              <div className="space-y-2">
                {dnsChanges.map((d: Record<string, unknown>) => {
                  const site = d.website as { domain?: string } | null;
                  return (
                    <div key={d._id as string} className="flex items-center gap-2 py-1.5 border-b border-slate-800/60 last:border-0">
                      <Network size={13} className="text-purple-400 shrink-0" />
                      <p className="text-xs font-medium text-slate-200 truncate flex-1">{site?.domain || '—'}</p>
                      <span className="text-[10px] text-slate-500">
                        {d.checkedAt ? formatDistanceToNow(new Date(d.checkedAt as string), { addSuffix: true }) : ''}
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
