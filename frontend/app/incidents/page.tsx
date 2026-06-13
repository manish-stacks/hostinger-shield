'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Flame, Loader2, Filter, Download, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Pagination } from '@/components/ui/Pagination';
import { monitoringApi, accountsApi, api } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import { formatDistanceToNow } from 'date-fns';

const LIMIT = 25;

export default function IncidentsPage() {
  const qc = useQueryClient();
  const [page, setPage]                 = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverity]   = useState('');
  const [accountId, setAccountId]       = useState('');
  const [search, setSearch]             = useState('');
  const [exporting, setExporting]       = useState(false);

  const resetPage = () => setPage(1);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });
  const accounts = accountsData || [];

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', statusFilter, severityFilter, accountId, search, page],
    queryFn: () =>
      monitoringApi
        .getIncidents({
          status:    statusFilter   || undefined,
          severity:  severityFilter || undefined,
          accountId: accountId      || undefined,
          search:    search         || undefined,
          page,
          limit: LIMIT,
        })
        .then((r) => r.data),
    keepPreviousData: true,
  });

  const incidents  = data?.data       || [];
  const pagination = data?.pagination || { total: 0 };

  const resolveMutation = useMutation({
    mutationFn: (id: string) => monitoringApi.resolveIncident(id),
    onSuccess: () => { toast.success('Incident resolved'); qc.invalidateQueries({ queryKey: ['incidents'] }); },
    onError:   () => toast.error('Failed'),
  });

  const handleExport = async (fmt: string) => {
    setExporting(true);
    try {
      const res = await api.post(`/exports/incidents?format=${fmt}`, {}, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a   = document.createElement('a');
      a.href = url; a.download = `incidents.${fmt}`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch { toast.error('Export failed'); }
    finally  { setExporting(false); }
  };

  const hasFilters = statusFilter || severityFilter || accountId || search;

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1 className="page-title">Incidents</h1>
        <div className="flex items-center gap-2">
          {(['xlsx', 'csv'] as const).map((fmt) => (
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
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <select value={severityFilter} onChange={(e) => { setSeverity(e.target.value); resetPage(); }} className="input w-36 py-1.5 text-sm">
          <option value="">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select value={accountId} onChange={(e) => { setAccountId(e.target.value); resetPage(); }} className="input w-44 py-1.5 text-sm">
          <option value="">All Accounts</option>
          {accounts.map((a: Record<string, unknown>) => (
            <option key={a._id as string} value={a._id as string}>
              {(a.accountName || a.label) as string}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button onClick={() => { setSearch(''); setStatusFilter(''); setSeverity(''); setAccountId(''); resetPage(); }} className="text-xs text-[#8b949e] hover:text-red-400">
            Clear all
          </button>
        )}

        {pagination.total > 0 && (
          <span className="ml-auto text-xs text-[#8b949e]">{pagination.total} incidents</span>
        )}
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Title</th><th>Website</th><th>Account</th><th>Type</th>
              <th>Severity</th><th>Status</th><th>Started</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-10"><Loader2 size={20} className="animate-spin mx-auto" /></td></tr>
            ) : incidents.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-[#8b949e]">
                <Flame size={32} className="mx-auto mb-2 opacity-30 text-orange-400" />
                {hasFilters ? 'No incidents match filters' : 'No incidents'}
              </td></tr>
            ) : incidents.map((i: Record<string, unknown>) => {
              const site = i.website as { domain?: string; hostingerAccount?: { accountName?: string } } | null;
              return (
                <tr key={i._id as string}>
                  <td className="font-medium text-[#e6edf3]">{i.title as string}</td>
                  <td className="text-[#8b949e] text-xs">{site?.domain || '—'}</td>
                  <td className="text-xs">
                    {site?.hostingerAccount?.accountName ? (
                      <span className="px-2 py-0.5 rounded-full bg-[#3b5bdb]/15 text-[#3b5bdb]">
                        {site.hostingerAccount.accountName}
                      </span>
                    ) : '—'}
                  </td>
                  <td><span className="badge-warning capitalize">{(i.incidentType || i.type) as string || '—'}</span></td>
                  <td>
                    <span className={`badge ${i.severity === 'critical' || i.severity === 'high' ? 'badge-danger' : i.severity === 'medium' ? 'badge-warning' : 'badge-info'}`}>
                      {i.severity as string || '—'}
                    </span>
                  </td>
                  <td>
                    {i.status === 'open' ? <span className="badge-danger">Open</span>
                      : i.status === 'in_progress' ? <span className="badge-warning">In Progress</span>
                      : <span className="badge-success">Resolved</span>}
                  </td>
                  <td className="text-xs text-[#8b949e]">
                    {(i.detectionTime || i.createdAt)
                      ? formatDistanceToNow(new Date((i.detectionTime || i.createdAt) as string), { addSuffix: true })
                      : '—'}
                  </td>
                  <td>
                    {(i.status === 'open' || i.status === 'in_progress') && (
                      <button onClick={() => resolveMutation.mutate(i._id as string)} disabled={resolveMutation.isPending} className="btn-secondary py-1 px-2 text-xs">
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