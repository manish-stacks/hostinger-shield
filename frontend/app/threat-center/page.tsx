'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDebounce } from '@/lib/useDebounce';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ShieldAlert, CheckCircle, Loader2, Filter, Download, Search, CheckCheck } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Pagination } from '@/components/ui/Pagination';
import { monitoringApi, exportApi, downloadBlob, accountsApi } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import { formatDistanceToNow } from 'date-fns';

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'badge-danger',
  high:     'badge-danger',
  medium:   'badge-warning',
  low:      'badge-info',
};
const LIMIT = 25;

function ThreatCenterContent() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState('');
  const [accountId, setAccountId]       = useState('');
  const [websiteId, setWebsiteId]       = useState(searchParams.get('websiteId') || '');
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const [selected, setSelected]         = useState<string[]>([]);
  const [exporting, setExporting]       = useState(false);

  useEffect(() => {
    const wid = searchParams.get('websiteId');
    if (wid !== null) setWebsiteId(wid);
  }, [searchParams]);

  const resetPage = () => setPage(1);
  const debouncedSearch = useDebounce(search);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });
  const accounts = accountsData || [];

  const { data, isLoading } = useQuery({
    queryKey: ['threats', statusFilter, accountId, websiteId, debouncedSearch, page],
    queryFn: () =>
      monitoringApi
        .getThreats({
          status:    statusFilter || undefined,
          accountId: accountId   || undefined,
          websiteId: websiteId   || undefined,
          search:    debouncedSearch || undefined,
          page,
          limit: LIMIT,
        })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const threats    = data?.data       || [];
  const pagination = data?.pagination || { total: 0, pages: 0 };

  const resolveMutation = useMutation({
    mutationFn: (id: string) => monitoringApi.resolveThreat(id),
    onSuccess: () => {
      toast.success('Threat resolved & site status recalculated');
      qc.invalidateQueries({ queryKey: ['threats'] });
      qc.invalidateQueries({ queryKey: ['website-stats'] });
      qc.invalidateQueries({ queryKey: ['websites'] });
    },
    onError: () => toast.error('Failed to resolve'),
  });

  const bulkResolveMutation = useMutation({
    mutationFn: () => monitoringApi.bulkResolveThreats(selected),
    onSuccess: () => {
      toast.success(`Resolved ${selected.length} threats`);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ['threats'] });
      qc.invalidateQueries({ queryKey: ['website-stats'] });
      qc.invalidateQueries({ queryKey: ['websites'] });
    },
    onError: () => toast.error('Bulk resolve failed'),
  });

  const handleExport = async (fmt: 'xlsx' | 'csv' | 'pdf') => {
    setExporting(true);
    try {
      const res = await exportApi.threats(fmt, accountId || undefined);
      downloadBlob(res.data, `threats-export.${fmt}`);
      toast.success('Download started');
    } catch { toast.error('Export failed'); }
    finally  { setExporting(false); }
  };

  const activeRows = threats.filter((t: Record<string, unknown>) => !t.isResolved);
  const toggleSelect = (id: string) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleAll = () =>
    setSelected((p) => (p.length === activeRows.length ? [] : activeRows.map((t: Record<string, unknown>) => t._id as string)));

  const hasFilters = statusFilter || accountId || websiteId || search;

  return (
    <DashboardLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Threat Center</h1>
          <p className="text-xs text-slate-400 mt-0.5">Malware, SEO spam, hidden injections, cloaking &amp; vulnerability detections</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <button
              onClick={() => bulkResolveMutation.mutate()}
              disabled={bulkResolveMutation.isPending}
              className="btn-primary text-xs"
            >
              {bulkResolveMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={13} />}
              Resolve Selected ({selected.length})
            </button>
          )}
          {(['xlsx', 'csv', 'pdf'] as const).map((fmt) => (
            <button key={fmt} onClick={() => handleExport(fmt)} disabled={exporting} className="btn-secondary text-xs uppercase">
              {exporting ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-8 w-52 text-sm"
            placeholder="Search domain..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={13} className="text-slate-500" />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }} className="input w-36 py-2 text-sm">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <select value={accountId} onChange={(e) => { setAccountId(e.target.value); resetPage(); }} className="input w-44 py-2 text-sm">
          <option value="">All Accounts</option>
          {accounts.map((a: Record<string, unknown>) => (
            <option key={a._id as string} value={a._id as string}>
              {(a.accountName || a.label) as string}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setStatusFilter(''); setAccountId(''); setWebsiteId(''); resetPage(); }}
            className="text-xs text-slate-400 hover:text-rose-400"
          >
            Clear all
          </button>
        )}

        {pagination.total > 0 && (
          <span className="ml-auto text-xs text-slate-400 tabular-nums">{pagination.total} threats</span>
        )}
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  checked={activeRows.length > 0 && selected.length === activeRows.length}
                  onChange={toggleAll}
                  className="rounded"
                />
              </th>
              <th>Type &amp; Details</th><th>Website</th><th>Account</th><th>Severity</th>
              <th>Score</th><th>Status</th><th>Detected</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="text-center py-10"><Loader2 size={20} className="animate-spin mx-auto" /></td></tr>
            ) : threats.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-slate-400">
                <CheckCircle size={32} className="mx-auto mb-2 opacity-30 text-emerald-400" />
                {hasFilters ? 'No threats match filters' : 'No threats found — all sites clean'}
              </td></tr>
            ) : threats.map((t: Record<string, unknown>) => {
              const site = t.website as { domain?: string; hostingerAccount?: { accountName?: string } } | null;
              const isResolved = Boolean(t.isResolved || t.status === 'resolved');
              return (
                <tr key={t._id as string}>
                  <td>
                    {!isResolved && (
                      <input
                        type="checkbox"
                        checked={selected.includes(t._id as string)}
                        onChange={() => toggleSelect(t._id as string)}
                      />
                    )}
                  </td>
                  <td>
                    <div className="flex items-start gap-2 max-w-xs">
                      <ShieldAlert size={14} className="text-rose-600 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900 capitalize block">
                          {(t.threatType as string || t.type as string)?.replace(/_/g, ' ')}
                        </span>
                        {t.description ? (
                          <span className="text-[11px] text-slate-500 line-clamp-1">{t.description as string}</span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="text-slate-800 text-xs font-semibold">{site?.domain || '—'}</td>
                  <td className="text-xs">
                    {site?.hostingerAccount?.accountName ? (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
                        {site.hostingerAccount.accountName}
                      </span>
                    ) : '—'}
                  </td>
                  <td><span className={SEVERITY_BADGE[t.severity as string] || 'badge-neutral'}>{t.severity as string}</span></td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${(t.score as number) >= 75 ? 'bg-rose-500' : (t.score as number) >= 50 ? 'bg-amber-500' : 'bg-sky-500'}`}
                          style={{ width: `${t.score as number}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-600 tabular-nums">{t.score as number}</span>
                    </div>
                  </td>
                  <td>
                    {isResolved
                      ? <span className="badge-success">Resolved</span>
                      : <span className="badge-danger">Active</span>}
                  </td>
                  <td className="text-xs text-slate-500">
                    {(t.detectedAt || t.createdAt)
                      ? formatDistanceToNow(new Date((t.detectedAt || t.createdAt) as string), { addSuffix: true })
                      : '—'}
                  </td>
                  <td>
                    {!isResolved && (
                      <button
                        onClick={() => resolveMutation.mutate(t._id as string)}
                        disabled={resolveMutation.isPending && resolveMutation.variables === (t._id as string)}
                        className="btn-secondary py-1 px-2.5 text-xs"
                      >
                        {resolveMutation.isPending && resolveMutation.variables === (t._id as string) ? <Loader2 size={12} className="animate-spin" /> : 'Resolve'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={pagination.total} limit={LIMIT} onChange={setPage} />
    </DashboardLayout>
  );
}

export default function ThreatCenterPage() {
  return (
    <Suspense fallback={<DashboardLayout><div className="py-16 text-center"><Loader2 size={22} className="animate-spin mx-auto text-indigo-400" /></div></DashboardLayout>}>
      <ThreatCenterContent />
    </Suspense>
  );
}
