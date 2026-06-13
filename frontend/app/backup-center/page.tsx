'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HardDrive, Plus, ExternalLink, AlertTriangle, CheckCircle,
  Loader2, Filter, Download, Calendar, X,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Pagination } from '@/components/ui/Pagination';
import { backupApi, accountsApi } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import { formatDistanceToNow } from 'date-fns';

const LIMIT = 20;

// ── Manual Backup Modal ───────────────────────────────────────────────────────
function AddBackupModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [websiteId, setWebsiteId] = useState('');
  const [backupDate, setBackupDate] = useState(new Date().toISOString().slice(0, 16));
  const [backupType, setBackupType] = useState<'manual' | 'auto' | 'full' | 'files' | 'database'>('manual');
  const [notes, setNotes] = useState('');

  const { data: websitesData } = useQuery({
    queryKey: ['websites-simple'],
    queryFn: () => backupApi.list({ limit: 200 }).then((r) => r.data.data),
  });
  const websites = websitesData || [];

  const mutation = useMutation({
    mutationFn: () => backupApi.addManual({ websiteId, backupDate, backupType, notes }),
    onSuccess: () => {
      toast.success('Backup logged successfully');
      qc.invalidateQueries({ queryKey: ['backups'] });
      qc.invalidateQueries({ queryKey: ['backup-stats'] });
      onClose();
    },
    onError: () => toast.error('Failed to log backup'),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[#e6edf3]">Log Manual Backup</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Website *</label>
            <select value={websiteId} onChange={(e) => setWebsiteId(e.target.value)} className="input">
              <option value="">Select website...</option>
              {websites.map((w: Record<string, unknown>) => {
                const site = w.website as { _id?: string; domain?: string } | null;
                return (
                  <option key={site?._id as string} value={site?._id as string}>
                    {site?.domain}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="label">Backup Date & Time *</label>
            <input
              type="datetime-local"
              value={backupDate}
              onChange={(e) => setBackupDate(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="label">Backup Type</label>
            <select value={backupType} onChange={(e) => setBackupType(e.target.value as typeof backupType)} className="input">
              <option value="manual">Manual (via hPanel)</option>
              <option value="full">Full Backup</option>
              <option value="files">Files Only</option>
              <option value="database">Database Only</option>
              <option value="auto">Auto Backup</option>
            </select>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Pre-update backup, before plugin changes..."
              className="input resize-none h-20"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!websiteId || mutation.isPending}
              className="btn-primary flex-1 justify-center"
            >
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Log Backup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BackupCenterPage() {
  const qc = useQueryClient();
  const [page, setPage]           = useState(1);
  const [accountId, setAccountId] = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [needsOnly, setNeedsOnly] = useState(false);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });
  const accounts = accountsData || [];

  // Stats
  const { data: statsData } = useQuery({
    queryKey: ['backup-stats'],
    queryFn: () => backupApi.stats().then((r) => r.data.data),
    refetchInterval: 60000,
  });
  const stats = statsData || {};

  // Backup list
  const { data, isLoading } = useQuery({
    queryKey: ['backups', page, accountId],
    queryFn: () => backupApi.list({ page, limit: LIMIT, accountId: accountId || undefined }).then((r) => r.data),
    keepPreviousData: true,
  });

  const rows       = (data?.data || []).filter((r: Record<string, unknown>) => needsOnly ? r.needsBackup : true);
  const pagination = data?.pagination || { total: 0 };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => backupApi.delete(id),
    onSuccess: () => { toast.success('Record deleted'); qc.invalidateQueries({ queryKey: ['backups'] }); },
    onError: () => toast.error('Delete failed'),
  });

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1 className="page-title">Backup Center</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus size={15} /> Log Backup
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 p-3 mb-5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
        <HardDrive size={14} className="mt-0.5 shrink-0" />
        <span>
          Hostinger shared hosting backups are managed via <strong>hPanel</strong>. Use the{' '}
          <strong>hPanel</strong> button on each row to go directly to that site's backup page.
          Log your backups here manually to track history.
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Sites',          value: stats.totalSites            ?? '—', color: 'text-blue-400',    bg: 'bg-blue-500/10' },
          { label: 'Backed Up (7d)',        value: stats.sitesWithRecentBackup ?? '—', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Needs Backup',          value: stats.sitesNeedingBackup    ?? '—', color: 'text-red-400',     bg: 'bg-red-500/10', alert: (stats.sitesNeedingBackup || 0) > 0 },
          { label: 'Total Records',         value: stats.totalBackupRecords    ?? '—', color: 'text-purple-400',  bg: 'bg-purple-500/10' },
        ].map(({ label, value, color, bg, alert }) => (
          <div key={label} className="stat-card">
            <p className={`text-2xl font-bold ${alert ? 'text-red-400' : 'text-[#e6edf3]'}`}>{value}</p>
            <p className="text-xs text-[#8b949e]">{label}</p>
          </div>
        ))}
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
            checked={needsOnly}
            onChange={(e) => setNeedsOnly(e.target.checked)}
            className="rounded"
          />
          Needs backup only
        </label>

        {(accountId || needsOnly) && (
          <button
            onClick={() => { setAccountId(''); setNeedsOnly(false); setPage(1); }}
            className="text-xs text-[#8b949e] hover:text-red-400"
          >
            Clear filters
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
              <th>Last Backup</th>
              <th>Type</th>
              <th>Total Backups</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-12"><Loader2 size={20} className="animate-spin mx-auto text-[#8b949e]" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-[#8b949e]">
                <HardDrive size={32} className="mx-auto mb-2 opacity-30" />
                No data — add your websites first
              </td></tr>
            ) : rows.map((row: Record<string, unknown>) => {
              const site       = row.website as { _id?: string; domain?: string; hostingerAccount?: { accountName?: string }; hostingUsername?: string } | null;
              const latest     = row.latestBackup as Record<string, unknown> | null;
              const days       = row.daysSinceBackup as number | null;
              const needsBackup = row.needsBackup as boolean;
              const hPanelUrl  = row.hPanelUrl as string;

              return (
                <tr key={site?._id as string}>
                  <td className="font-medium text-[#e6edf3]">{site?.domain || '—'}</td>
                  <td className="text-xs">
                    {site?.hostingerAccount?.accountName ? (
                      <span className="px-2 py-0.5 rounded-full bg-[#3b5bdb]/15 text-[#3b5bdb]">
                        {site.hostingerAccount.accountName}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    {row.lastBackupDate ? (
                      <div>
                        <p className="text-xs text-[#e6edf3]">
                          {formatDistanceToNow(new Date(row.lastBackupDate as string), { addSuffix: true })}
                        </p>
                        <p className="text-[10px] text-[#8b949e]">
                          {new Date(row.lastBackupDate as string).toLocaleDateString()}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-[#8b949e] italic">Never logged</span>
                    )}
                  </td>
                  <td className="text-xs text-[#8b949e] capitalize">
                    {latest?.backupType as string || '—'}
                  </td>
                  <td className="text-xs text-[#8b949e]">{row.totalBackups as number}</td>
                  <td>
                    {needsBackup ? (
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle size={12} className="text-red-400" />
                        <span className="badge-danger text-[10px]">
                          {days === null ? 'Never' : `${days}d ago`}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle size={12} className="text-emerald-400" />
                        <span className="badge-success text-[10px]">{days}d ago</span>
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      {/* hPanel direct link */}
                      <a
                        href={hPanelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary py-1 px-2 text-xs flex items-center gap-1"
                        title="Open hPanel Backups"
                      >
                        <ExternalLink size={11} /> hPanel
                      </a>
                      {/* Log backup for this site */}
                      <button
                        onClick={() => setShowAdd(true)}
                        className="btn-ghost py-1 px-2 text-xs"
                        title="Log backup"
                      >
                        <Calendar size={11} />
                      </button>
                      {/* Delete latest record */}
                      {latest && (
                        <button
                          onClick={() => {
                            if (confirm('Delete this backup record?'))
                              deleteMutation.mutate(latest._id as string);
                          }}
                          className="btn-ghost py-1 px-2 text-xs text-red-400 hover:text-red-300"
                          title="Delete record"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={pagination.total} limit={LIMIT} onChange={setPage} />

      {showAdd && <AddBackupModal onClose={() => setShowAdd(false)} />}
    </DashboardLayout>
  );
}