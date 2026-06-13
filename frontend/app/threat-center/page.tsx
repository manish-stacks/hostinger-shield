'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, CheckCircle, Loader2, Filter, Download, Search } from 'lucide-react';
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

export default function ThreatCenterPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [accountId, setAccountId]       = useState('');
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const [exporting, setExporting]       = useState(false);

  const resetPage = () => setPage(1);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });
  const accounts = accountsData || [];

  const { data, isLoading } = useQuery({
    queryKey: ['threats', statusFilter, accountId, search, page],
    queryFn: () =>
      monitoringApi
        .getThreats({
          status:    statusFilter || undefined,
          accountId: accountId   || undefined,
          search:    search      || undefined,
          page,
          limit: LIMIT,
        })
        .then((r) => r.data),
    keepPreviousData: true,
  });

  const threats    = data?.data       || [];
  const pagination = data?.pagination || { total: 0, pages: 0 };

  const resolveMutation = useMutation({
    mutationFn: (id: string) => monitoringApi.resolveThreat(id),
    onSuccess: () => { toast.success('Threat resolved'); qc.invalidateQueries({ queryKey: ['threats'] }); },
    onError:   () => toast.error('Failed to resolve'),
  });

  const handleExport = async (fmt: 'xlsx' | 'csv' | 'pdf') => {
    setExporting(true);
    try {
      const res = await exportApi.threats(fmt);
      downloadBlob(res.data, `threats-export.${fmt}`);
      toast.success('Download started');
    } catch { toast.error('Export failed'); }
    finally  { setExporting(false); }
  };

  const hasFilters = statusFilter || accountId || search;

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1 className="page-title">Threat Center</h1>
        <div className="flex items-center gap-2">
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
        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]" />
          <input
            className="input pl-8 w-48 text-sm"
            placeholder="Search domain..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={13} className="text-[#8b949e]" />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }} className="input w-36 py-1.5 text-sm">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <select value={accountId} onChange={(e) => { setAccountId(e.target.value); resetPage(); }} className="input w-44 py-1.5 text-sm">
          <option value="">All Accounts</option>
          {accounts.map((a: Record<string, unknown>) => (
            <option key={a._id as string} value={a._id as string}>
              {(a.accountName || a.label) as string}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button onClick={() => { setSearch(''); setStatusFilter(''); setAccountId(''); resetPage(); }} className="text-xs text-[#8b949e] hover:text-red-400">
            Clear all
          </button>
        )}

        {pagination.total > 0 && (
          <span className="ml-auto text-xs text-[#8b949e]">{pagination.total} threats</span>
        )}
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Type</th><th>Website</th><th>Account</th><th>Severity</th>
              <th>Score</th><th>Status</th><th>Detected</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-10"><Loader2 size={20} className="animate-spin mx-auto" /></td></tr>
            ) : threats.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-[#8b949e]">
                <CheckCircle size={32} className="mx-auto mb-2 opacity-30 text-emerald-400" />
                {hasFilters ? 'No threats match filters' : 'No threats found'}
              </td></tr>
            ) : threats.map((t: Record<string, unknown>) => {
              const site = t.website as { domain?: string; hostingerAccount?: { accountName?: string } } | null;
              return (
                <tr key={t._id as string}>
                  <td>
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={14} className="text-red-400 shrink-0" />
                      <span className="font-medium text-[#e6edf3] capitalize">
                        {(t.threatType as string || t.type as string)?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="text-[#8b949e] text-xs">{site?.domain || '—'}</td>
                  <td className="text-xs">
                    {site?.hostingerAccount?.accountName ? (
                      <span className="px-2 py-0.5 rounded-full bg-[#3b5bdb]/15 text-[#3b5bdb]">
                        {site.hostingerAccount.accountName}
                      </span>
                    ) : '—'}
                  </td>
                  <td><span className={SEVERITY_BADGE[t.severity as string] || 'badge-neutral'}>{t.severity as string}</span></td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${(t.score as number) >= 75 ? 'bg-red-500' : (t.score as number) >= 50 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                          style={{ width: `${t.score as number}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#8b949e]">{t.score as number}</span>
                    </div>
                  </td>
                  <td>
                    {(t.isResolved || t.status === 'resolved')
                      ? <span className="badge-success">Resolved</span>
                      : <span className="badge-danger">Active</span>}
                  </td>
                  <td className="text-xs text-[#8b949e]">
                    {(t.detectedAt || t.createdAt)
                      ? formatDistanceToNow(new Date((t.detectedAt || t.createdAt) as string), { addSuffix: true })
                      : '—'}
                  </td>
                  <td>
                    {!t.isResolved && t.status !== 'resolved' && (
                      <button onClick={() => resolveMutation.mutate(t._id as string)} disabled={resolveMutation.isPending} className="btn-secondary py-1 px-2 text-xs">
                        {resolveMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Resolve'}
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