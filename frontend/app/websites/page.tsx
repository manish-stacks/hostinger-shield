'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Search, Scan, Trash2, ExternalLink, Loader2, Filter } from 'lucide-react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Pagination } from '@/components/ui/Pagination';
import { websitesApi, accountsApi } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import { AddWebsiteModal } from '@/components/modals/AddWebsiteModal';

const STATUS_BADGE: Record<string, string> = {
  healthy: 'badge-success',
  hacked: 'badge-danger',
  down: 'badge-danger',
  critical: 'badge-danger',
  warning: 'badge-warning',
  unknown: 'badge-neutral',
};

const LIMIT = 20;

export default function WebsitesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [accountId, setAccountId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  // Accounts for filter dropdown
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });
  const accounts = accountsData || [];

  const { data, isLoading } = useQuery({
    queryKey: ['websites', page, search, accountId, statusFilter],
    queryFn: () =>
      websitesApi
        .list({ page, limit: LIMIT, search: search || undefined, accountId: accountId || undefined, status: statusFilter || undefined })
        .then((r) => r.data),
    keepPreviousData: true,
  });

  const websites = data?.data || [];
  const pagination = data?.pagination || { total: 0, pages: 0 };

  const resetPage = () => setPage(1);

  const scanMutation = useMutation({
    mutationFn: (id: string) => websitesApi.scan(id),
    onSuccess: () => { toast.success('Scan started'); qc.invalidateQueries({ queryKey: ['websites'] }); },
    onError: () => toast.error('Scan failed'),
  });

  const bulkScanMutation = useMutation({
    mutationFn: () => websitesApi.bulkScan(selected),
    onSuccess: () => { toast.success(`Scanning ${selected.length} websites`); setSelected([]); },
    onError: () => toast.error('Bulk scan failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => websitesApi.delete(id),
    onSuccess: () => { toast.success('Website deleted'); qc.invalidateQueries({ queryKey: ['websites'] }); },
    onError: () => toast.error('Delete failed'),
  });

  const toggleSelect = (id: string) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleAll = () =>
    setSelected((p) => (p.length === websites.length ? [] : websites.map((w: Record<string, unknown>) => w._id as string)));

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1 className="page-title">Websites</h1>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <button
              onClick={() => bulkScanMutation.mutate()}
              disabled={bulkScanMutation.isPending}
              className="btn-secondary text-xs"
            >
              {bulkScanMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Scan size={13} />}
              Scan {selected.length}
            </button>
          )}
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus size={15} /> Add Website
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]" />
          <input
            className="input pl-9 w-52"
            placeholder="Search domains..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          />
        </div>

        {/* Account filter */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-[#8b949e] shrink-0" />
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

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }}
          className="input w-36 py-1.5 text-sm"
        >
          <option value="">All Status</option>
          <option value="healthy">Healthy</option>
          <option value="warning">Warning</option>
          <option value="hacked">Hacked</option>
          <option value="down">Down</option>
          <option value="unknown">Unknown</option>
        </select>

        {/* Active filter badge */}
        {(accountId || statusFilter || search) && (
          <button
            onClick={() => { setAccountId(''); setStatusFilter(''); setSearch(''); resetPage(); }}
            className="text-xs text-[#8b949e] hover:text-red-400 flex items-center gap-1"
          >
            Clear filters
          </button>
        )}

        {pagination.total > 0 && (
          <span className="ml-auto text-xs text-[#8b949e]">{pagination.total} websites</span>
        )}
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selected.length === websites.length && websites.length > 0}
                  onChange={toggleAll}
                  className="rounded"
                />
              </th>
              <th>Domain</th>
              <th>Account</th>
              <th>Status</th>
              <th>SSL</th>
              <th>Threat</th>
              <th>Last Scan</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-[#8b949e]">
                  <Loader2 size={20} className="animate-spin mx-auto" />
                </td>
              </tr>
            ) : websites.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-[#8b949e]">
                  <Globe size={32} className="mx-auto mb-2 opacity-30" />
                  {search || accountId || statusFilter ? 'No websites match filters' : 'No websites yet'}
                </td>
              </tr>
            ) : (
              websites.map((w: Record<string, unknown>) => {
                const acct = w.hostingerAccount as { accountName?: string; _id?: string } | null;
                return (
                  <tr key={w._id as string}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(w._id as string)}
                        onChange={() => toggleSelect(w._id as string)}
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Globe size={14} className="text-[#8b949e]" />
                        <span className="font-medium text-[#e6edf3]">{w.domain as string}</span>
                        <a
                          href={`https://${w.domain as string}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#8b949e] hover:text-blue-400"
                        >
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    </td>
                    <td>
                      {acct ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#3b5bdb]/15 text-[#3b5bdb]">
                          {acct.accountName || 'Account'}
                        </span>
                      ) : (
                        <span className="text-xs text-[#8b949e]">—</span>
                      )}
                    </td>
                    <td>
                      <span className={STATUS_BADGE[w.status as string] || 'badge-neutral'}>
                        {(w.status as string) || 'unknown'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          (w.sslStatus as string) === 'valid'
                            ? 'badge-success'
                            : (w.sslStatus as string) === 'expiring'
                            ? 'badge-warning'
                            : (w.sslStatus as string) === 'expired'
                            ? 'badge-danger'
                            : 'badge-neutral'
                        }`}
                      >
                        {(w.sslStatus as string) || '—'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              (w.threatScore as number) >= 75
                                ? 'bg-red-500'
                                : (w.threatScore as number) >= 40
                                ? 'bg-yellow-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${w.threatScore as number}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#8b949e]">{w.threatScore as number}</span>
                      </div>
                    </td>
                    <td className="text-[#8b949e] text-xs">
                      {w.lastThreatScan
                        ? new Date(w.lastThreatScan as string).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/websites/${w._id as string}`}
                          className="btn-ghost py-1 px-2 text-xs"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => scanMutation.mutate(w._id as string)}
                          disabled={scanMutation.isPending}
                          className="btn-ghost py-1 px-2 text-xs"
                          title="Scan"
                        >
                          <Scan size={12} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this website?')) deleteMutation.mutate(w._id as string);
                          }}
                          className="btn-ghost py-1 px-2 text-xs text-red-400 hover:text-red-300"
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
    </DashboardLayout>
  );
}