'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Download, Plus, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { reportsApi, downloadBlob } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import { formatDistanceToNow } from 'date-fns';

export default function ReportsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: () => reportsApi.list().then((r) => r.data.data),
  });
  const reports = data || [];

  const generateMutation = useMutation({
    mutationFn: (type: string) => reportsApi.generate(type),
    onSuccess: () => {
      toast.success('Report generated');
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: () => toast.error('Generation failed'),
  });

  const downloadMutation = useMutation({
    mutationFn: ({ id, format }: { id: string; format: string }) => reportsApi.download(id, format),
    onSuccess: (res, vars) => {
      downloadBlob(res.data, `shield-report-${vars.id}.${vars.format}`);
      toast.success('Download started');
    },
    onError: () => toast.error('Download failed'),
  });

  return (
    <DashboardLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="text-xs text-slate-400 mt-0.5">Generate &amp; download daily, weekly, or monthly executive summaries</p>
        </div>
        <div className="flex gap-2">
          {['daily', 'weekly', 'monthly'].map((type) => (
            <button
              key={type}
              onClick={() => generateMutation.mutate(type)}
              disabled={generateMutation.isPending}
              className="btn-secondary text-xs capitalize"
            >
              {generateMutation.isPending && generateMutation.variables === type
                ? <Loader2 size={12} className="animate-spin" />
                : <Plus size={12} />}
              Generate {type}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Status</th>
              <th>Generated</th>
              <th>Download</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-10"><Loader2 size={20} className="animate-spin mx-auto" /></td></tr>
            ) : reports.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-slate-400">No reports yet. Generate one above.</td></tr>
            ) : reports.map((r: Record<string, unknown>) => (
              <tr key={r._id as string}>
                <td className="font-medium text-slate-100">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-indigo-400 shrink-0" />
                    <span>{r.title as string}</span>
                  </div>
                </td>
                <td><span className="badge-info capitalize">{(r.reportType || r.type) as string}</span></td>
                <td>{r.status === 'ready' ? <span className="badge-success">Ready</span> : <span className="badge-warning capitalize">{r.status as string}</span>}</td>
                <td className="text-xs text-slate-400">{r.createdAt ? formatDistanceToNow(new Date(r.createdAt as string), { addSuffix: true }) : '—'}</td>
                <td>
                  {r.status === 'ready' && (
                    <div className="flex items-center gap-1">
                      {(['pdf', 'xlsx', 'csv'] as const).map((fmt) => (
                        <button
                          key={fmt}
                          onClick={() => downloadMutation.mutate({ id: r._id as string, format: fmt })}
                          disabled={downloadMutation.isPending}
                          className="btn-ghost py-1 px-2 text-xs uppercase"
                        >
                          <Download size={11} /> {fmt}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
