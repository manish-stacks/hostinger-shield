'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ShieldAlert, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  Search, Lock, Gauge, Globe, ArrowLeft, Clock,
} from 'lucide-react';
import { publicApi } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

interface PublicSite {
  domain: string;
  status: string;
  responseTime: number | null;
  uptime24h: number | null;
  sslOk: boolean;
  group: string;
  lastChecked: string | null;
}

export default function PublicStatusPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['public-status'],
    queryFn: () => publicApi.status().then((r) => r.data.data),
    refetchInterval: 30_000,
  });

  const summary = data?.summary || { total: 0, operational: 0, down: 0, issues: 0, avgResponseTime: 0, overallUptime: 100 };
  const systemStatus: string = data?.systemStatus || 'operational';
  const sites: PublicSite[] = (data?.sites || []).filter((s: PublicSite) =>
    !search.trim() || s.domain.toLowerCase().includes(search.toLowerCase()) || s.group.toLowerCase().includes(search.toLowerCase())
  );

  // Group sites by server group
  const grouped: Record<string, PublicSite[]> = {};
  for (const s of sites) {
    if (!grouped[s.group]) grouped[s.group] = [];
    grouped[s.group].push(s);
  }

  const banner =
    systemStatus === 'major_outage'
      ? { bg: 'bg-rose-600', text: 'Major Outage Detected', sub: `${summary.down} site(s) currently unreachable`, icon: XCircle }
      : systemStatus === 'partial_outage'
      ? { bg: 'bg-rose-500', text: 'Partial System Outage', sub: `${summary.down} site(s) currently down`, icon: XCircle }
      : systemStatus === 'degraded'
      ? { bg: 'bg-amber-500', text: 'Degraded Performance / Warnings', sub: `${summary.issues} site(s) reporting warnings`, icon: AlertTriangle }
      : { bg: 'bg-emerald-600', text: 'All Systems Operational', sub: `All ${summary.total} monitored websites are responding normally`, icon: CheckCircle2 };

  const BannerIcon = banner.icon;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 flex items-center justify-center shadow-sm">
              <ShieldAlert size={18} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 text-sm sm:text-base leading-tight">Shield Pro Status</h1>
              <p className="text-[11px] text-slate-500">Live Server &amp; Website Telemetry</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="btn-secondary text-xs py-1.5 px-3">
              <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
            <Link href="/dashboard" className="btn-primary text-xs py-1.5 px-3">
              <ArrowLeft size={13} /> Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Overall System Banner */}
        <div className={`${banner.bg} text-white rounded-2xl p-6 shadow-lg flex flex-wrap items-center justify-between gap-4`}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <BannerIcon size={26} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">{banner.text}</h2>
              <p className="text-sm text-white/85 mt-0.5">{banner.sub}</p>
            </div>
          </div>
          {data?.updatedAt && (
            <div className="text-xs text-white/85 flex items-center gap-1.5 bg-black/15 px-3 py-1.5 rounded-full">
              <Clock size={12} /> Updated {formatDistanceToNow(new Date(data.updatedAt), { addSuffix: true })}
            </div>
          )}
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1.5"><Globe size={13} className="text-indigo-600" /> Monitored</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{summary.total}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-600" /> 24h Uptime</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1 tabular-nums">{summary.overallUptime}%</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1.5"><Gauge size={13} className="text-sky-600" /> Avg Latency</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{summary.avgResponseTime ? `${summary.avgResponseTime}ms` : '—'}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1.5"><XCircle size={13} className="text-rose-600" /> Down Now</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${summary.down > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{summary.down}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter websites or server group..."
            className="input pl-9"
          />
        </div>

        {/* Grouped Sites List */}
        {isLoading ? (
          <div className="card py-16 text-center text-slate-500 text-sm">Loading live server status…</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="card py-16 text-center text-slate-500 text-sm">No websites match your filter</div>
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped).map(([group, list]) => (
              <div key={group} className="card p-0 overflow-hidden">
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-800">{group}</h3>
                  <span className="text-xs text-slate-500 tabular-nums">{list.length} sites</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {list.map((s) => (
                    <div key={s.domain} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          s.status === 'healthy' ? 'bg-emerald-500'
                          : s.status === 'down' ? 'bg-rose-500 animate-pulse'
                          : s.status === 'degraded' || s.status === 'warning' ? 'bg-amber-500'
                          : 'bg-slate-400'
                        }`} />
                        <span className="font-semibold text-sm text-slate-900 truncate">{s.domain}</span>
                        {s.sslOk && (
                          <span title="SSL Valid" className="text-emerald-600"><Lock size={12} /></span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs tabular-nums">
                        {s.responseTime ? (
                          <span className={`font-medium ${s.responseTime > 3000 ? 'text-rose-600' : s.responseTime > 1500 ? 'text-amber-600' : 'text-slate-600'}`}>
                            {s.responseTime}ms
                          </span>
                        ) : null}
                        {s.uptime24h !== null && (
                          <span className="text-slate-500">{s.uptime24h}% up</span>
                        )}
                        <span className={
                          s.status === 'healthy' ? 'badge-success'
                          : s.status === 'down' ? 'badge-danger'
                          : s.status === 'degraded' || s.status === 'warning' ? 'badge-warning'
                          : 'badge-neutral'
                        }>
                          {s.status === 'healthy' ? 'Operational' : s.status === 'down' ? 'Down' : s.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-slate-400 pt-4">
          Powered by Hostinger Shield Pro · Auto-refreshes every 30 seconds
        </p>
      </main>
    </div>
  );
}
