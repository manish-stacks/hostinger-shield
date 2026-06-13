'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock, Loader2, Download, Filter, CheckCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Pagination } from '@/components/ui/Pagination';
import { monitoringApi, accountsApi, exportApi, downloadBlob } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';

// Compute status from schema fields (SSLLog has no 'status' field)
const getSslStatus = (d: Record<string, unknown>) => {
  if (d.isValid === false || d.error) return 'invalid';
  const days = d.daysUntilExpiry as number | null;
  if (days === null || days === undefined) return 'unknown';
  if (days <= 0)  return 'expired';
  if (days <= 7)  return 'critical';
  if (days <= 30) return 'expiring';
  return 'valid';
};

const sslBadgeClass = (s: string) => {
  if (s === 'valid')    return 'badge-success';
  if (s === 'expiring') return 'badge-warning';
  if (s === 'critical' || s === 'expired' || s === 'invalid') return 'badge-danger';
  return 'badge-neutral';
};

const daysColor = (days: number | null) => {
  if (days === null || days === undefined) return 'text-[#8b949e]';
  if (days <= 7)  return 'text-red-400';
  if (days <= 30) return 'text-yellow-400';
  return 'text-emerald-400';
};

const LIMIT = 25;

export default function SSLMonitorPage() {
  const [page, setPage]           = useState(1);
  const [accountId, setAccountId] = useState('');
  const [statusFilter, setStatus] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });
  const accounts = accountsData || [];

  const { data, isLoading } = useQuery({
    queryKey: ['ssl-logs', page, accountId, statusFilter],
    queryFn: () =>
      monitoringApi
        .getSSL({ page, limit: LIMIT, accountId: accountId || undefined, status: statusFilter || undefined })
        .then((r) => r.data),
    keepPreviousData: true,
  });

  const logs        = data?.data        || [];
  const pagination  = data?.pagination  || { total: 0 };

  const handleExport = async (fmt: 'xlsx' | 'csv' | 'pdf') => {
    setExporting(true);
    try {
      const res = await exportApi.ssl(fmt, accountId || undefined);
      downloadBlob(res.data as Blob, `ssl-report.${fmt}`);
      toast.success('Download started');
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1 className="page-title">SSL Monitor</h1>
        <div className="flex items-center gap-2">
          {(['xlsx', 'csv', 'pdf'] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={() => handleExport(fmt)}
              disabled={exporting}
              className="btn-secondary text-xs uppercase"
            >
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
            value={statusFilter}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="input w-40 py-1.5 text-sm"
          >
            <option value="">All SSL Status</option>
            <option value="valid">Valid</option>
            <option value="expiring">Expiring (30d)</option>
            <option value="expired">Expired</option>
            <option value="invalid">Invalid</option>
          </select>
        </div>
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

        {(statusFilter || accountId) && (
          <button
            onClick={() => { setStatus(''); setAccountId(''); setPage(1); }}
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
              <th>Issuer</th>
              <th>Days Left</th>
              <th>Expires</th>
              <th>Last Checked</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="text-center py-12">
                  <Loader2 size={20} className="animate-spin mx-auto text-[#8b949e]" />
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-[#8b949e]">
                  <CheckCircle size={32} className="mx-auto mb-2 opacity-30 text-emerald-400" />
                  {statusFilter || accountId ? 'No records match filters' : 'No SSL data — run a scan first'}
                </td>
              </tr>
            ) : (
              logs.map((l: Record<string, unknown>) => {
                const site    = l.website as { domain?: string; hostingerAccount?: { accountName?: string } } | null;
                const status  = getSslStatus(l);
                const days    = l.daysUntilExpiry as number | null;
                const isFallback = l._isFallback as boolean;

                return (
                  <tr key={(l._id || l.website) as string}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Lock size={13} className="text-[#8b949e] shrink-0" />
                        <span className="font-medium text-[#e6edf3]">
                          {site?.domain || '—'}
                        </span>
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
                      <span className={sslBadgeClass(status)}>
                        {status === 'critical' ? 'expiring soon' : status}
                      </span>
                      {isFallback && (
                        <span className="ml-1 text-[10px] text-[#8b949e]">(cached)</span>
                      )}
                    </td>
                    <td className="text-xs text-[#8b949e]">{l.issuer as string || '—'}</td>
                    <td>
                      <span className={`font-bold text-sm ${daysColor(days)}`}>
                        {days !== null && days !== undefined ? days : '—'}
                      </span>
                    </td>
                    <td className="text-xs text-[#8b949e]">
                      {l.validTo
                        ? new Date(l.validTo as string).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="text-xs text-[#8b949e]">
                      {l.checkedAt
                        ? new Date(l.checkedAt as string).toLocaleDateString()
                        : <span className="text-[#8b949e] italic">Never checked</span>}
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