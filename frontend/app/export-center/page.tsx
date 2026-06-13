'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Globe, ShieldAlert, Lock, Network, Flame, RotateCcw } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { accountsApi, api } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';

type ExportType = 'websites' | 'threats' | 'ssl' | 'dns' | 'incidents' | 'restore-history';
type Format = 'xlsx' | 'csv' | 'pdf';

// Map export type → backend endpoint
const ENDPOINT: Record<ExportType, string> = {
  websites: '/exports/websites',
  threats: '/exports/threats',
  ssl: '/exports/ssl',
  dns: '/exports/dns',
  incidents: '/exports/incidents',
  'restore-history': '/backups/export',
};

const EXPORT_ITEMS: { type: ExportType; icon: typeof Globe; label: string; color: string; formats: Format[] }[] = [
  { type: 'websites',        icon: Globe,        label: 'Websites',       color: 'bg-blue-600',    formats: ['xlsx', 'csv', 'pdf'] },
  { type: 'threats',         icon: ShieldAlert,  label: 'Threats',        color: 'bg-red-600',     formats: ['xlsx', 'csv', 'pdf'] },
  { type: 'ssl',             icon: Lock,         label: 'SSL Logs',       color: 'bg-emerald-600', formats: ['xlsx', 'csv', 'pdf'] },
  { type: 'dns',             icon: Network,      label: 'DNS Logs',       color: 'bg-purple-600',  formats: ['xlsx', 'csv'] },
  { type: 'incidents',       icon: Flame,        label: 'Incidents',      color: 'bg-orange-600',  formats: ['xlsx', 'csv'] },
  { type: 'restore-history', icon: RotateCcw,    label: 'Restore Logs',   color: 'bg-teal-600',    formats: ['xlsx', 'csv'] },
];

export default function ExportCenterPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [accountId, setAccountId] = useState('');

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });
  const accounts = accountsData || [];

  const handleExport = async (type: ExportType, format: Format) => {
    const key = `${type}-${format}`;
    setLoading(key);
    try {
      const params: Record<string, string> = { format };
      if (accountId) params.accountId = accountId;

      const endpoint = ENDPOINT[type];
      const res = await api.post(endpoint, {}, {
        params,
        responseType: 'blob',
        timeout: 60000,
      });

      // Derive filename from Content-Disposition or fallback
      const cd = (res.headers as Record<string, string>)['content-disposition'] || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `${type}-export.${format}`;

      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${filename} downloaded`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: Blob; status?: number } };
      // If error response is a blob (server sent JSON error as blob), try to read it
      if (e?.response?.data instanceof Blob) {
        try {
          const text = await (e.response.data as Blob).text();
          const json = JSON.parse(text);
          toast.error(json.message || 'Export failed');
        } catch {
          toast.error(`Export failed (${e?.response?.status || 'error'})`);
        }
      } else {
        toast.error('Export failed — check server logs');
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1 className="page-title">Export Center</h1>
      </div>

      {/* Account filter */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm text-[#8b949e]">Filter by account:</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="input w-52 py-1.5 text-sm"
        >
          <option value="">All Accounts</option>
          {accounts.map((a: Record<string, unknown>) => (
            <option key={a._id as string} value={a._id as string}>
              {(a.accountName || a.label) as string}
            </option>
          ))}
        </select>
        {accountId && (
          <button onClick={() => setAccountId('')} className="text-xs text-[#8b949e] hover:text-red-400">
            Clear
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {EXPORT_ITEMS.map(({ type, icon: Icon, label, color, formats }) => (
          <div key={type} className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center shrink-0`}>
                <Icon size={18} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-[#e6edf3]">{label}</h3>
                <p className="text-xs text-[#8b949e]">Export as {formats.join(', ').toUpperCase()}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {formats.map((fmt) => {
                const key = `${type}-${fmt}`;
                const isLoading = loading === key;
                return (
                  <button
                    key={fmt}
                    onClick={() => handleExport(type, fmt)}
                    disabled={loading !== null}
                    className="btn-secondary flex-1 justify-center text-xs uppercase gap-1.5"
                  >
                    {isLoading
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Download size={12} />}
                    {fmt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}