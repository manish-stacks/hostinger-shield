'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Download, Plus, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { exportApi, downloadBlob } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import { formatDistanceToNow } from 'date-fns';

export default function ReportsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: () => exportApi.getReports().then((r) => r.data.data),
  });
  const reports = data || [];

  const generateMutation = useMutation({
    mutationFn: (type: string) => exportApi.generateReport(type),
    onSuccess: () => { toast.success('Report generated'); qc.invalidateQueries({ queryKey: ['reports'] }); },
    onError: () => toast.error('Generation failed'),
  });

  const downloadMutation = useMutation({
    mutationFn: (id: string) => exportApi.downloadReport(id),
    onSuccess: (res, id) => { downloadBlob(res.data, `report-${id}.pdf`); toast.success('Download started'); },
    onError: () => toast.error('Download failed'),
  });

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <div className="flex gap-2">
          {['daily', 'weekly', 'monthly'].map((type) => (
            <button key={type} onClick={() => generateMutation.mutate(type)} disabled={generateMutation.isPending} className="btn-secondary text-xs capitalize">
              {generateMutation.isPending && generateMutation.variables === type
                ? <Loader2 size={12} className="animate-spin" />
                : <Plus size={12} />}
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Generated</th><th>Action</th></tr></thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-10"><Loader2 size={20} className="animate-spin mx-auto" /></td></tr>
            ) : reports.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-[#8b949e]">No reports yet. Generate one above.</td></tr>
            ) : reports.map((r: Record<string,unknown>) => (
              <tr key={r._id as string}>
                <td className="font-medium text-[#e6edf3] flex items-center gap-2"><FileText size={13} className="text-[#8b949e]" />{r.title as string}</td>
                <td><span className="badge-info capitalize">{r.type as string}</span></td>
                <td>{r.status === 'ready' ? <span className="badge-success">Ready</span> : <span className="badge-warning capitalize">{r.status as string}</span>}</td>
                <td className="text-xs text-[#8b949e]">{r.createdAt ? formatDistanceToNow(new Date(r.createdAt as string), { addSuffix: true }) : '—'}</td>
                <td>
                  {r.status === 'ready' && (
                    <button onClick={() => downloadMutation.mutate(r._id as string)} disabled={downloadMutation.isPending} className="btn-ghost py-1 px-2 text-xs">
                      <Download size={12} /> Download
                    </button>
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
