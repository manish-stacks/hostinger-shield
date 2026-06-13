'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Loader2, Info, ExternalLink, Plus, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Pagination } from '@/components/ui/Pagination';
import { backupApi, accountsApi } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import { formatDistanceToNow } from 'date-fns';

const HIST_LIMIT = 15;

// ── Log Restore Modal ─────────────────────────────────────────────────────────
function LogRestoreModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [websiteId, setWebsiteId] = useState('');
  const [backupDate, setBackupDate] = useState('');
  const [restoreType, setRestoreType] = useState<'full' | 'files_only' | 'database_only'>('full');
  const [notes, setNotes] = useState('');

  const { data: sitesData } = useQuery({
    queryKey: ['backups-for-restore-modal'],
    queryFn: () => backupApi.list({ limit: 200 }).then((r) => r.data.data),
  });
  const sites = sitesData || [];

  const mutation = useMutation({
    mutationFn: () => backupApi.restore({ websiteId, backupDate: backupDate || undefined, restoreType, notes }),
    onSuccess: () => {
      toast.success('Restore logged');
      qc.invalidateQueries({ queryKey: ['restore-history'] });
      onClose();
    },
    onError: () => toast.error('Failed to log restore'),
  });

  const selectedSite = sites.find((s: Record<string, unknown>) => (s.website as { _id?: string })?._id === websiteId);
  const hPanelUrl = (selectedSite as Record<string, unknown>)?.hPanelUrl as string || 'https://hpanel.hostinger.com';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[#e6edf3]">Log Restore</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>

        <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>Perform the actual restore in <strong>hPanel</strong>, then log it here for record keeping.</span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Website *</label>
            <select value={websiteId} onChange={(e) => setWebsiteId(e.target.value)} className="input">
              <option value="">Select website...</option>
              {sites.map((s: Record<string, unknown>) => {
                const site = s.website as { _id?: string; domain?: string } | null;
                return <option key={site?._id} value={site?._id}>{site?.domain}</option>;
              })}
            </select>
          </div>

          {websiteId && (
            <a href={hPanelUrl} target="_blank" rel="noopener noreferrer"
              className="btn-secondary w-full justify-center text-sm">
              <ExternalLink size={13} /> Open hPanel Backups for this site
            </a>
          )}

          <div>
            <label className="label">Backup Date Used (optional)</label>
            <input type="datetime-local" value={backupDate} onChange={(e) => setBackupDate(e.target.value)} className="input" />
          </div>

          <div>
            <label className="label">Restore Type</label>
            <select value={restoreType} onChange={(e) => setRestoreType(e.target.value as typeof restoreType)} className="input">
              <option value="full">Full Restore</option>
              <option value="files_only">Files Only</option>
              <option value="database_only">Database Only</option>
            </select>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for restore, what was affected..." className="input resize-none h-20" />
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={() => mutation.mutate()} disabled={!websiteId || mutation.isPending} className="btn-primary flex-1 justify-center">
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Log Restore
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RestoreCenterPage() {
  const [histPage, setHistPage]   = useState(1);
  const [accountId, setAccountId] = useState('');
  const [showLog, setShowLog]     = useState(false);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });
  const accounts = accountsData || [];

  const { data: histData, isLoading } = useQuery({
    queryKey: ['restore-history', histPage, accountId],
    queryFn: () => backupApi.history({ page: histPage, limit: HIST_LIMIT }).then((r) => r.data),
    keepPreviousData: true,
  });
  const history    = histData?.data       || [];
  const histPag    = histData?.pagination || { total: 0 };

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1 className="page-title">Restore Center</h1>
        <button onClick={() => setShowLog(true)} className="btn-primary">
          <Plus size={15} /> Log Restore
        </button>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 p-3 mb-6 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
        <Info size={14} className="mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p><strong>How to restore a website:</strong></p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-200">
            <li>Go to <strong>Backup Center</strong> → click <strong>hPanel</strong> button for the site</li>
            <li>In hPanel, select backup date and restore</li>
            <li>Come back here → click <strong>Log Restore</strong> to record it</li>
          </ol>
        </div>
      </div>

      {/* Quick links — account wise hPanel */}
      {accounts.length > 0 && (
        <div className="card mb-6">
          <p className="section-title mb-3">Quick hPanel Access</p>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a: Record<string, unknown>) => (
              <a
                key={a._id as string}
                href="https://hpanel.hostinger.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-sm"
              >
                <ExternalLink size={13} />
                {(a.accountName || a.label) as string}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Restore History */}
      <div className="card">
        <p className="section-title mb-4">Restore History</p>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-[#8b949e]" /></div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e]">
            <RotateCcw size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No restore history yet</p>
            <p className="text-xs mt-1">After restoring via hPanel, click "Log Restore" to record it</p>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Website</th>
                    <th>Account</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Backup Date</th>
                    <th>Logged</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h: Record<string, unknown>) => {
                    const site = h.website as { domain?: string; hostingerAccount?: { accountName?: string } } | null;
                    return (
                      <tr key={h._id as string}>
                        <td className="font-medium text-[#e6edf3] text-sm">{site?.domain || '—'}</td>
                        <td className="text-xs">
                          {site?.hostingerAccount?.accountName ? (
                            <span className="px-2 py-0.5 rounded-full bg-[#3b5bdb]/15 text-[#3b5bdb]">
                              {site.hostingerAccount.accountName}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="text-xs text-[#8b949e] capitalize">
                          {(h.restoreType as string)?.replace(/_/g, ' ') || 'full'}
                        </td>
                        <td>
                          <span className={h.status === 'completed' ? 'badge-success' : h.status === 'failed' ? 'badge-danger' : 'badge-warning'}>
                            {h.status as string}
                          </span>
                        </td>
                        <td className="text-xs text-[#8b949e]">
                          {h.backupDate ? new Date(h.backupDate as string).toLocaleString() : '—'}
                        </td>
                        <td className="text-xs text-[#8b949e]">
                          {h.createdAt
                            ? formatDistanceToNow(new Date(h.createdAt as string), { addSuffix: true })
                            : '—'}
                        </td>
                        <td className="text-xs text-[#8b949e] max-w-xs truncate">
                          {h.notes as string || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={histPage} total={histPag.total} limit={HIST_LIMIT} onChange={setHistPage} />
          </>
        )}
      </div>

      {showLog && <LogRestoreModal onClose={() => setShowLog(false)} />}
    </DashboardLayout>
  );
}