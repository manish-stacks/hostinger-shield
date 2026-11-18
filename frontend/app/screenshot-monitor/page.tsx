'use client';
import { useState } from 'react';
import { useDebounce } from '@/lib/useDebounce';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal max-w-4xl w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200">
          <p className="font-bold text-slate-900">{domain}</p>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <img src={src} alt={domain} className="w-full rounded-xl border border-slate-200" />
      </div>
    </div>
  );
}

export default function ScreenshotMonitorPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [accountId, setAccountId] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
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
    queryKey: ['screenshots', page, accountId, debouncedSearch, changedOnly, defacedOnly],
    queryFn: () =>
      monitoringApi.getScreenshots({
        page,
        limit: LIMIT,
        accountId: accountId || undefined,
        search: debouncedSearch || undefined,
        hasChanged: changedOnly ? 'true' : undefined,
        isDefaced: defacedOnly ? 'true' : undefined,
      }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const logs = data?.data || [];
  const pagination = data?.pagination || { total: 0 };

  const captureMutation = useMutation({
    mutationFn: (websiteId: string) => api.post(`/screenshots/${websiteId}/capture`, {}, { timeout: 120000 }),
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
            <p className={`text-2xl font-bold ${alert ? 'text-rose-600' : 'text-slate-900'}`}>{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-400">
        <Camera size={13} className="text-indigo-600 shrink-0" />
        Stored on disk — latest 2 screenshots kept per site · orphan &amp; old captures auto-pruned to protect storage
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-8 w-52 text-sm"
            placeholder="Search domain..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          />
        </div>

        {/* Account filter */}
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-slate-500" />
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

        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-500">
          <input type="checkbox" checked={changedOnly} onChange={(e) => { setChanged(e.target.checked); resetPage(); }} className="rounded" />
          Changed only
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-rose-600">
          <input type="checkbox" checked={defacedOnly} onChange={(e) => { setDefaced(e.target.checked); resetPage(); }} className="rounded" />
          Defaced only
        </label>

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setAccountId(''); setChanged(false); setDefaced(false); resetPage(); }}
            className="text-xs text-slate-500 hover:text-rose-600"
          >
            Clear all
          </button>
        )}

        {pagination.total > 0 && (
          <span className="ml-auto text-xs text-slate-500">{pagination.total} sites</span>
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
                <Loader2 size={20} className="animate-spin mx-auto text-slate-500" />
              </td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-slate-500">
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
                <tr key={(l._id || site?._id) as string} className={isDefaced ? 'bg-rose-50/70' : ''}>
                  <td className="font-medium text-slate-900">{site?.domain || '—'}</td>

                  <td className="text-xs">
                    {site?.hostingerAccount?.accountName ? (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
                        {site.hostingerAccount.accountName}
                      </span>
                    ) : '—'}
                  </td>

                  {/* Thumbnail */}
                  <td>
                    {imgSrc ? (
                      <button
                        onClick={() => setPreview({ src: imgSrc, domain: site?.domain || '' })}
                        className="w-24 h-14 rounded border border-slate-200 overflow-hidden hover:border-indigo-400 transition-colors"
                      >
                        <img
                          src={imgSrc}
                          alt="screenshot"
                          className="w-full h-full object-cover object-top"
                        />
                      </button>
                    ) : (
                      <div className="w-24 h-14 rounded border border-slate-200 flex items-center justify-center">
                        <Camera size={16} className="text-slate-500 opacity-30" />
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
                        <AlertTriangle size={12} className="text-rose-600 shrink-0" />
                        <span className="badge-danger">Defaced</span>
                      </div>
                    ) : hasChanged ? (
                      <span className="badge-warning">Changed</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle size={12} className="text-emerald-600 shrink-0" />
                        <span className="badge-success">Normal</span>
                      </div>
                    )}
                  </td>

                  <td className="text-xs text-slate-500">
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
                        disabled={captureMutation.isPending && captureMutation.variables === (site?._id as string)}
                        className="btn-secondary py-1 px-2 text-xs"
                        title="Capture now"
                      >
                        {captureMutation.isPending && captureMutation.variables === (site?._id as string)
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