'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDebounce } from '@/lib/useDebounce';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Globe, Plus, Search, Scan, Trash2, ExternalLink, Loader2,
  Filter, Upload, Zap, PauseCircle, PlayCircle,
} from 'lucide-react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Pagination } from '@/components/ui/Pagination';
import { websitesApi, accountsApi } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import { AddWebsiteModal } from '@/components/modals/AddWebsiteModal';
import { BulkImportModal } from '@/components/modals/BulkImportModal';
import { formatDistanceToNow } from 'date-fns';

const STATUS_BADGE: Record<string, string> = {
  healthy: 'badge-success',
  hacked: 'badge-danger',
  down: 'badge-danger',
  critical: 'badge-danger',
  warning: 'badge-warning',
  restoring: 'badge-info',
  unknown: 'badge-neutral',
};

const QUICK_FILTERS = [
  { value: '', label: 'All' },
  { value: 'down', label: '🔴 Down' },
  { value: 'hacked', label: '🚨 Hacked' },
  { value: 'warning', label: '⚠️ Warning' },
  { value: 'healthy', label: '✅ Healthy' },
  { value: 'slow', label: '🐢 Slow (>3s)' },
  { value: 'ssl_expiring', label: '🔒 SSL Expiring' },
];

const LIMIT = 25;

function WebsitesContent() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [accountId, setAccountId] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [selected, setSelected] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  useEffect(() => {
    const s = searchParams.get('status');
    if (s !== null) setStatusFilter(s);
  }, [searchParams]);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });
  const accounts = accountsData || [];

  const { data, isLoading } = useQuery({
    queryKey: ['websites', page, debouncedSearch, accountId, statusFilter],
    queryFn: () =>
      websitesApi
        .list({
          page,
          limit: LIMIT,
          search: debouncedSearch || undefined,
          accountId: accountId || undefined,
          status: statusFilter || undefined,
        })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const websites = data?.data || [];
  const pagination = data?.pagination || { total: 0, pages: 0 };

  const resetPage = () => setPage(1);

  const pingMutation = useMutation({
    mutationFn: (id: string) => websitesApi.ping(id),
    onSuccess: (res) => {
      const r = res.data.data;
      if (r.isUp) toast.success(`${r.domain} UP · HTTP ${r.httpsStatus || r.httpStatus} · ${r.responseTime}ms`);
      else toast.error(`${r.domain} DOWN · ${r.error || 'Unreachable'}`);
      qc.invalidateQueries({ queryKey: ['websites'] });
      qc.invalidateQueries({ queryKey: ['website-stats'] });
    },
    onError: () => toast.error('Ping failed'),
  });

  const scanMutation = useMutation({
    mutationFn: (id: string) => websitesApi.scan(id),
    onSuccess: () => {
      toast.success('Full site scan complete');
      qc.invalidateQueries({ queryKey: ['websites'] });
      qc.invalidateQueries({ queryKey: ['website-stats'] });
    },
    onError: () => toast.error('Scan failed'),
  });

  const toggleMonMutation = useMutation({
    mutationFn: (id: string) => websitesApi.toggleMonitoring(id),
    onSuccess: (res) => {
      const enabled = res.data.data?.isMonitoringEnabled;
      toast.info(enabled ? 'Monitoring resumed' : 'Monitoring paused');
      qc.invalidateQueries({ queryKey: ['websites'] });
    },
    onError: () => toast.error('Failed to update'),
  });

  const bulkScanMutation = useMutation({
    mutationFn: () => websitesApi.bulkScan(selected),
    onSuccess: () => {
      toast.success(`Scanning ${selected.length} websites in background`);
      setSelected([]);
    },
    onError: () => toast.error('Bulk scan failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => websitesApi.delete(id),
    onSuccess: () => {
      toast.success('Website deleted');
      qc.invalidateQueries({ queryKey: ['websites'] });
      qc.invalidateQueries({ queryKey: ['website-stats'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  const toggleSelect = (id: string) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleAll = () =>
    setSelected((p) => (p.length === websites.length ? [] : websites.map((w: Record<string, unknown>) => w._id as string)));

  return (
    <DashboardLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Websites</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor uptime, response latency, SSL expiry &amp; security threats across all server domains
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected.length > 0 && (
            <button
              onClick={() => bulkScanMutation.mutate()}
              disabled={bulkScanMutation.isPending}
              className="btn-secondary text-xs"
            >
              {bulkScanMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Scan size={13} />}
              Scan Selected ({selected.length})
            </button>
          )}
          <button onClick={() => setShowBulk(true)} className="btn-secondary text-xs">
            <Upload size={14} /> Bulk Import
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs">
            <Plus size={14} /> Add Website
          </button>
        </div>
      </div>

      {/* Quick Status Chips */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => { setStatusFilter(f.value); resetPage(); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
              statusFilter === f.value
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search & Account Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9 w-60"
            placeholder="Search domain, IP, server..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400 shrink-0" />
          <select
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); resetPage(); }}
            className="input w-48 py-2 text-sm"
          >
            <option value="">All Accounts</option>
            {accounts.map((a: Record<string, unknown>) => (
              <option key={a._id as string} value={a._id as string}>
                {(a.accountName || a.label) as string}
              </option>
            ))}
          </select>
        </div>

        {(accountId || statusFilter || search) && (
          <button
            onClick={() => { setAccountId(''); setStatusFilter(''); setSearch(''); resetPage(); }}
            className="text-xs text-slate-500 hover:text-rose-600 font-medium"
          >
            Clear filters
          </button>
        )}

        {pagination.total > 0 && (
          <span className="ml-auto text-xs text-slate-500 font-medium tabular-nums">{pagination.total} websites</span>
        )}
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  checked={selected.length === websites.length && websites.length > 0}
                  onChange={toggleAll}
                  className="rounded"
                />
              </th>
              <th>Domain</th>
              <th>Server / Account</th>
              <th>Status</th>
              <th>Speed / Uptime</th>
              <th>SSL</th>
              <th>Threat</th>
              <th>Checked</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-slate-500">
                  <Loader2 size={20} className="animate-spin mx-auto text-indigo-600" />
                </td>
              </tr>
            ) : websites.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-14 text-slate-500">
                  <Globe size={34} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-semibold text-slate-700">
                    {search || accountId || statusFilter ? 'No websites match these filters' : 'No websites monitored yet'}
                  </p>
                  {!search && !accountId && !statusFilter && (
                    <button onClick={() => setShowBulk(true)} className="btn-primary text-xs mt-3">
                      <Upload size={13} /> Bulk Import Server Domains
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              websites.map((w: Record<string, unknown>) => {
                const acct = w.hostingerAccount as { accountName?: string } | null;
                const resp = w.responseTime as number | null;
                const uptime = w.uptime24h as number | null;
                const sslDays = w.sslDaysLeft as number | null;
                const paused = w.isMonitoringEnabled === false;

                return (
                  <tr key={w._id as string} className={paused ? 'opacity-55' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(w._id as string)}
                        onChange={() => toggleSelect(w._id as string)}
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          paused ? 'bg-slate-400'
                          : w.status === 'healthy' ? 'bg-emerald-500'
                          : w.status === 'down' ? 'bg-rose-500 animate-pulse'
                          : w.status === 'hacked' || w.status === 'critical' ? 'bg-orange-500 animate-pulse'
                          : w.status === 'warning' ? 'bg-amber-500'
                          : 'bg-slate-400'
                        }`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/websites/${w._id as string}`} className="font-semibold text-slate-900 hover:text-indigo-600 truncate">
                              {w.domain as string}
                            </Link>
                            <a
                              href={`https://${w.domain as string}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-indigo-600"
                            >
                              <ExternalLink size={11} />
                            </a>
                          </div>
                          {w.ipAddress ? (
                            <p className="text-[10px] text-slate-400 font-mono">{w.ipAddress as string}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {acct?.accountName && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
                            {acct.accountName}
                          </span>
                        )}
                        {w.serverName ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-200">
                            {w.serverName as string}
                          </span>
                        ) : null}
                        {!acct?.accountName && !w.serverName && <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </td>
                    <td>
                      <span className={STATUS_BADGE[w.status as string] || 'badge-neutral'}>
                        {paused ? 'paused' : ((w.status as string) || 'unknown')}
                      </span>
                      {w.httpStatus ? (
                        <span className="ml-1.5 text-[10px] text-slate-500 font-mono">{w.httpStatus as number}</span>
                      ) : null}
                    </td>
                    <td className="tabular-nums">
                      <div className="text-xs">
                        <span className={
                          !resp ? 'text-slate-400'
                          : resp > 3000 ? 'text-rose-600 font-semibold'
                          : resp > 1500 ? 'text-amber-600 font-semibold'
                          : 'text-emerald-700 font-medium'
                        }>
                          {resp ? `${resp}ms` : '—'}
                        </span>
                        {uptime !== null && uptime !== undefined && (
                          <span className="block text-[10px] text-slate-500">{uptime}% (24h)</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge tabular-nums ${
                        (w.sslStatus as string) === 'valid' ? 'badge-success'
                        : (w.sslStatus as string) === 'expiring' ? 'badge-warning'
                        : (w.sslStatus as string) === 'expired' || (w.sslStatus as string) === 'invalid' ? 'badge-danger'
                        : 'badge-neutral'
                      }`}>
                        {sslDays !== null && sslDays !== undefined ? `${sslDays}d` : ((w.sslStatus as string) || '—')}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              (w.threatScore as number) >= 75 ? 'bg-rose-500'
                              : (w.threatScore as number) >= 40 ? 'bg-amber-500'
                              : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.max(4, (w.threatScore as number) || 0)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-600 tabular-nums">{(w.threatScore as number) || 0}</span>
                      </div>
                    </td>
                    <td className="text-slate-500 text-xs whitespace-nowrap">
                      {w.lastHealthCheck
                        ? formatDistanceToNow(new Date(w.lastHealthCheck as string), { addSuffix: true })
                        : 'Never'}
                    </td>
                    <td>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => pingMutation.mutate(w._id as string)}
                          disabled={pingMutation.isPending && pingMutation.variables === (w._id as string)}
                          className="btn-ghost py-1 px-2 text-xs text-indigo-600 hover:text-indigo-700"
                          title="Instant live ping"
                        >
                          {pingMutation.isPending && pingMutation.variables === (w._id as string)
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Zap size={12} />}
                        </button>
                        <button
                          onClick={() => scanMutation.mutate(w._id as string)}
                          disabled={scanMutation.isPending && scanMutation.variables === (w._id as string)}
                          className="btn-ghost py-1 px-2 text-xs"
                          title="Deep scan (Health + Threat + SSL + DNS)"
                        >
                          {scanMutation.isPending && scanMutation.variables === (w._id as string)
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Scan size={12} />}
                        </button>
                        <button
                          onClick={() => toggleMonMutation.mutate(w._id as string)}
                          className="btn-ghost py-1 px-2 text-xs"
                          title={paused ? 'Resume monitoring' : 'Pause monitoring'}
                        >
                          {paused ? <PlayCircle size={13} className="text-emerald-600" /> : <PauseCircle size={13} />}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete ${w.domain}?`)) deleteMutation.mutate(w._id as string);
                          }}
                          className="btn-ghost py-1 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={pagination.total} limit={LIMIT} onChange={setPage} />

      {showAdd && <AddWebsiteModal onClose={() => setShowAdd(false)} />}
      {showBulk && <BulkImportModal onClose={() => setShowBulk(false)} />}
    </DashboardLayout>
  );
}

export default function WebsitesPage() {
  return (
    <Suspense fallback={<DashboardLayout><div className="py-16 text-center"><Loader2 size={22} className="animate-spin mx-auto text-indigo-400" /></div></DashboardLayout>}>
      <WebsitesContent />
    </Suspense>
  );
}
