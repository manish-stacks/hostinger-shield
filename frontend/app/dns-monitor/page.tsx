'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Network, Loader2, Filter, Download } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Pagination } from '@/components/ui/Pagination';
import { monitoringApi, accountsApi, api } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import { formatDistanceToNow } from 'date-fns';

const LIMIT = 25;

export default function DNSMonitorPage() {
  const [page, setPage]           = useState(1);
  const [accountId, setAccountId] = useState('');
  const [changedOnly, setChanged] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });
  const accounts = accountsData || [];

  const { data, isLoading } = useQuery({
    queryKey: ['dns-logs', page, accountId, changedOnly],
    queryFn: () =>
      monitoringApi
        .getDNS({ page, limit: LIMIT, accountId: accountId || undefined, hasChanged: changedOnly ? 'true' : undefined })
        .then((r) => r.data),
    keepPreviousData: true,
  });

  const logs       = data?.data       || [];
  const pagination = data?.pagination || { total: 0 };

  const formatRecords = (records: Record<string, string[]> | null) => {
    if (!records) return null;
    const parts = Object.entries(records)
      .filter(([, v]) => v?.length)
      .map(([k, v]) => `${k}: ${v.slice(0, 2).join(', ')}${v.length > 2 ? '…' : ''}`);
    return parts.length ? parts.join(' | ') : null;
  };

  const handleExport = async (fmt: string) => {
    setExporting(true);
    try {
      const res = await api.post(`/exports/dns?format=${fmt}`, {}, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a'); a.href = url; a.download = `dns-logs.${fmt}`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1 className="page-title">DNS Monitor</h1>
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
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-[#8b949e]" />
          <select
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); setPage(1); }}
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
          <input
            type="checkbox"
            checked={changedOnly}
            onChange={(e) => { setChanged(e.target.checked); setPage(1); }}
            className="rounded"
          />
          Changed only
        </label>

        {(accountId || changedOnly) && (
          <button
            onClick={() => { setAccountId(''); setChanged(false); setPage(1); }}
            className="text-xs text-[#8b949e] hover:text-red-400"
          >
            Clear filters
          </button>
        )}

        {pagination.total > 0 && (
          <span className="ml-auto text-xs text-[#8b949e]">{pagination.total} domains</span>
        )}
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Domain</th>
              <th>Account</th>
              <th>Status</th>
              <th>DNS Records</th>
              <th>Last Checked</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-12">
                  <Loader2 size={20} className="animate-spin mx-auto text-[#8b949e]" />
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-[#8b949e]">
                  <Network size={32} className="mx-auto mb-2 opacity-30" />
                  {changedOnly ? 'No DNS changes detected' : 'No websites found'}
                </td>
              </tr>
            ) : (
              logs.map((l: Record<string, unknown>) => {
                const site       = l.website as { domain?: string; hostingerAccount?: { accountName?: string } } | null;
                const isFallback = l._isFallback as boolean;
                const records    = formatRecords(l.records as Record<string, string[]> | null);

                return (
                  <tr key={(l._id || site?._id) as string}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Network size={13} className="text-[#8b949e] shrink-0" />
                        <span className="font-medium text-[#e6edf3]">{site?.domain || '—'}</span>
                      </div>
                    </td>
                    <td className="text-xs">
                      {site?.hostingerAccount?.accountName ? (
                        <span className="px-2 py-0.5 rounded-full bg-[#3b5bdb]/15 text-[#3b5bdb]">
                          {site.hostingerAccount.accountName}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      {isFallback ? (
                        <span className="badge-neutral">Pending scan</span>
                      ) : l.hasChanged ? (
                        <span className="badge-warning">Changed</span>
                      ) : (
                        <span className="badge-success">Stable</span>
                      )}
                    </td>
                    <td className="text-xs text-[#8b949e] max-w-xs">
                      {records
                        ? <span className="truncate block">{records}</span>
                        : <span className="italic">Not scanned yet</span>}
                    </td>
                    <td className="text-xs text-[#8b949e]">
                      {l.checkedAt
                        ? formatDistanceToNow(new Date(l.checkedAt as string), { addSuffix: true })
                        : <span className="italic">Never</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={pagination.total} limit={LIMIT} onChange={setPage} />
    </DashboardLayout>
  );
}