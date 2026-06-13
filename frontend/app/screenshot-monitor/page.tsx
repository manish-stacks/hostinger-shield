'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Camera, Loader2, Filter, AlertTriangle, CheckCircle,
  Eye, RefreshCw, X, Search,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Pagination } from '@/components/ui/Pagination';
import { monitoringApi, accountsApi, api } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import { formatDistanceToNow } from 'date-fns';

const LIMIT = 20;

function PreviewModal({ src, domain, onClose }: { src: string; domain: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-[#0d1117] p-4 rounded-xl max-w-4xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between mb-3">
          <p>{domain}</p>
          <button onClick={onClose}>✕</button>
        </div>

        <img src={src} alt={domain} className="w-full rounded-lg" />
      </div>
    </div>
  );
}

export default function ScreenshotMonitorPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [accountId, setAccountId] = useState('');
  const [search, setSearch] = useState('');
  const [changedOnly, setChanged] = useState(false);
  const [defacedOnly, setDefaced] = useState(false);
  const [preview, setPreview] = useState<{ src: string; domain: string } | null>(null);

  const resetPage = () => setPage(1);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });
  const accounts = accountsData || [];

  const { data: statsData } = useQuery({
    queryKey: ['screenshot-stats'],
    queryFn: () => api.get('/screenshots/stats').then((r) => r.data.data),
    refetchInterval: 60000,
  });
  const stats = statsData || {};

  const { data, isLoading } = useQuery({
    queryKey: ['screenshots', page, accountId, search, changedOnly, defacedOnly],
    queryFn: () =>
      monitoringApi.getScreenshots({
        page,
        limit: LIMIT,
        accountId: accountId || undefined,
        search: search || undefined,
        hasChanged: changedOnly ? 'true' : undefined,
        isDefaced: defacedOnly ? 'true' : undefined,
      }).then((r) => r.data),
    keepPreviousData: true,
  });

  const logs = data?.data || [];
  const pagination = data?.pagination || { total: 0 };

  const captureMutation = useMutation({
    mutationFn: (websiteId: string) => api.post(`/screenshots/${websiteId}/capture`),
    onSuccess: () => {
      toast.success('Screenshot captured');
      qc.invalidateQueries({ queryKey: ['screenshots'] });
      qc.invalidateQueries({ queryKey: ['screenshot-stats'] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Capture failed');
    },
  });

  const captureAllMutation = useMutation({
    mutationFn: () => api.post('/screenshots/capture-all'),
    onSuccess: () => toast.success('Capture started — check back in a few minutes'),
    onError: () => toast.error('Failed to start capture'),
  });

  const hasFilters = accountId || search || changedOnly || defacedOnly;

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1 className="page-title">Screenshot Monitor</h1>
        <button
          onClick={() => captureAllMutation.mutate()}
          disabled={captureAllMutation.isPending}
          className="btn-primary"
        >
          {captureAllMutation.isPending
            ? <Loader2 size={14} className="animate-spin" />
            : <RefreshCw size={14} />}
          Capture All
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Sites', value: stats.total ?? '—', alert: false },
          { label: 'Captured', value: stats.captured ?? '—', alert: false },
          { label: 'Visual Changes', value: stats.changed ?? '—', alert: (stats.changed || 0) > 0 },
          { label: 'Defaced', value: stats.defaced ?? '—', alert: (stats.defaced || 0) > 0 },
        ].map(({ label, value, alert }) => (
          <div key={label} className="stat-card">
            <p className={`text-2xl font-bold ${alert ? 'text-red-400' : 'text-[#e6edf3]'}`}>{value}</p>
            <p className="text-xs text-[#8b949e]">{label}</p>
          </div>
        ))}
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-[#161b22] border border-[#21262d] text-xs text-[#8b949e]">
        <Camera size={13} />
        Stored in <code className="bg-[#21262d] px-1 rounded mx-1">backend/screenshots/</code>
        — latest 3 kept per site · files older than 30 days auto-deleted
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]" />
          <input
            className="input pl-8 w-52 text-sm"
            placeholder="Search domain..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          />
        </div>

        {/* Account filter */}
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-[#8b949e]" />
          <select
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); resetPage(); }}
            className="input w-44 py-1.5 text-sm"
          >
            <option value="">All Accounts</option>
            {accounts.map((a: Record<string, unknown>) => (
              <option key={a._id as string} value={a._id as string}>
                {(a.accountName || a.label) as string}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-[#8b949e]">
          <input type="checkbox" checked={changedOnly} onChange={(e) => { setChanged(e.target.checked); resetPage(); }} className="rounded" />
          Changed only
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-red-400">
          <input type="checkbox" checked={defacedOnly} onChange={(e) => { setDefaced(e.target.checked); resetPage(); }} className="rounded" />
          Defaced only
        </label>

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setAccountId(''); setChanged(false); setDefaced(false); resetPage(); }}
            className="text-xs text-[#8b949e] hover:text-red-400"
          >
            Clear all
          </button>
        )}

        {pagination.total > 0 && (
          <span className="ml-auto text-xs text-[#8b949e]">{pagination.total} sites</span>
        )}
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Domain</th>
              <th>Account</th>
              <th>Screenshot</th>
              <th>Status</th>
              <th>Last Captured</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-12">
                <Loader2 size={20} className="animate-spin mx-auto text-[#8b949e]" />
              </td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-[#8b949e]">
                <Camera size={32} className="mx-auto mb-2 opacity-30" />
                {hasFilters ? 'No results match filters' : 'No screenshots yet — click "Capture All" to start'}
              </td></tr>
            ) : logs.map((l: Record<string, unknown>) => {
              const site = l.website as { _id?: string; domain?: string; hostingerAccount?: { accountName?: string } } | null;
              const isFallback = l._isFallback as boolean;
              const isDefaced = l.isDefaced as boolean;
              const hasChanged = l.hasChanged as boolean;
              const imgSrc = l.screenshotUrl as string | null; // base64 data URI

              return (
                <tr key={(l._id || site?._id) as string} className={isDefaced ? 'bg-red-500/5' : ''}>
                  <td className="font-medium text-[#e6edf3]">{site?.domain || '—'}</td>

                  <td className="text-xs">
                    {site?.hostingerAccount?.accountName ? (
                      <span className="px-2 py-0.5 rounded-full bg-[#3b5bdb]/15 text-[#3b5bdb]">
                        {site.hostingerAccount.accountName}
                      </span>
                    ) : '—'}
                  </td>

                  {/* Thumbnail */}
                  <td>
                    {imgSrc ? (
                      <button
                        onClick={() => setPreview({ src: imgSrc, domain: site?.domain || '' })}
                        className="w-24 h-14 rounded border border-[#21262d] overflow-hidden hover:border-[#3b5bdb] transition-colors"
                      >
                        <img
                          src={imgSrc}
                          alt="screenshot"
                          className="w-full h-full object-cover object-top"
                        />
                      </button>
                    ) : (
                      <div className="w-24 h-14 rounded border border-[#21262d] flex items-center justify-center">
                        <Camera size={16} className="text-[#8b949e] opacity-30" />
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td>
                    {isFallback ? (
                      <span className="badge-neutral">Not captured</span>
                    ) : l.error ? (
                      <span className="badge-danger" title={l.error as string}>Error</span>
                    ) : isDefaced ? (
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle size={12} className="text-red-400 shrink-0" />
                        <span className="badge-danger">Defaced</span>
                      </div>
                    ) : hasChanged ? (
                      <span className="badge-warning">Changed</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle size={12} className="text-emerald-400 shrink-0" />
                        <span className="badge-success">Normal</span>
                      </div>
                    )}
                  </td>

                  <td className="text-xs text-[#8b949e]">
                    {l.capturedAt
                      ? formatDistanceToNow(new Date(l.capturedAt as string), { addSuffix: true })
                      : <span className="italic">Never</span>}
                  </td>

                  <td>
                    <div className="flex items-center gap-1.5">
                      {imgSrc && (
                        <button
                          onClick={() => setPreview({ src: imgSrc, domain: site?.domain || '' })}
                          className="btn-ghost py-1 px-2 text-xs"
                          title="Preview"
                        >
                          <Eye size={12} />
                        </button>
                      )}
                      <button
                        onClick={() => captureMutation.mutate(site?._id as string)}
                        disabled={captureMutation.isPending}
                        className="btn-secondary py-1 px-2 text-xs"
                        title="Capture now"
                      >
                        {captureMutation.isPending
                          ? <Loader2 size={11} className="animate-spin" />
                          : <Camera size={11} />}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={pagination.total} limit={LIMIT} onChange={setPage} />

      {preview && (
        <PreviewModal src={preview.src} domain={preview.domain} onClose={() => setPreview(null)} />
      )}
    </DashboardLayout>
  );
}