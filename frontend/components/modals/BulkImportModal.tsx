'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Upload } from 'lucide-react';
import { websitesApi, accountsApi } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';

export function BulkImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [accountId, setAccountId] = useState('');
  const [serverName, setServerName] = useState('');
  const [runImmediateCheck, setRunImmediateCheck] = useState(true);

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });

  const parsedCount = text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;

  const mutation = useMutation({
    mutationFn: () =>
      websitesApi.bulkImport({
        domains: text,
        hostingerAccount: accountId || undefined,
        serverName: serverName.trim() || undefined,
        runImmediateCheck,
      }),
    onSuccess: (res) => {
      const d = res.data.data;
      toast.success(`Imported ${d.added} site(s)${d.skipped ? `, ${d.skipped} already existed` : ''}${d.invalid ? `, ${d.invalid} invalid` : ''}`);
      qc.invalidateQueries({ queryKey: ['websites'] });
      qc.invalidateQueries({ queryKey: ['website-stats'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Bulk import failed';
      toast.error(msg);
    },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Upload size={16} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Bulk Import Server Domains</h2>
              <p className="text-[11px] text-slate-500">Paste all domains hosted on your server — one per line or comma-separated</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Domains List *</label>
              <span className="text-[11px] text-indigo-600 font-semibold tabular-nums">{parsedCount} detected</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              className="input font-mono text-xs resize-y"
              placeholder={'site1.com\nhttps://site2.in\nclient-shop.org, blog.mydomain.com'}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Hostinger Account (optional)</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
                <option value="">Standalone / Other Server</option>
                {(accountsData || []).map((a: Record<string, unknown>) => (
                  <option key={a._id as string} value={a._id as string}>
                    {(a.accountName || a.label || a.email) as string}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Server / Group Tag</label>
              <input
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                className="input"
                placeholder="e.g. VPS-India-01"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={runImmediateCheck}
              onChange={(e) => setRunImmediateCheck(e.target.checked)}
              className="rounded"
            />
            Run immediate uptime health check after import
          </label>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={parsedCount === 0 || mutation.isPending}
              className="btn-primary flex-1 justify-center"
            >
              {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={14} />}
              Import {parsedCount > 0 ? `${parsedCount} Site${parsedCount > 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
