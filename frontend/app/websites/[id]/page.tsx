'use client';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe, Scan, ShieldAlert, CheckCircle, AlertTriangle, Loader2,
  ArrowLeft, Lock, Network, Camera, ExternalLink, Server,
} from 'lucide-react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { websitesApi, monitoringApi, api } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import { formatDistanceToNow } from 'date-fns';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const STATUS_COLOR: Record<string, string> = {
  healthy: 'text-emerald-400',
  hacked:  'text-red-400',
  down:    'text-red-400',
  warning: 'text-yellow-400',
  critical:'text-red-400',
  unknown: 'text-[#8b949e]',
};

const STATUS_BADGE: Record<string, string> = {
  healthy: 'badge-success',
  hacked:  'badge-danger',
  down:    'badge-danger',
  warning: 'badge-warning',
  critical:'badge-danger',
  unknown: 'badge-neutral',
};

export default function WebsiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc     = useQueryClient();

  // Website data
  const { data: website, isLoading } = useQuery({
    queryKey: ['website', id],
    queryFn: () => websitesApi.get(id).then((r) => r.data.data),
    enabled: !!id,
  });

  // Health history — oldest first for chart
  const { data: healthRaw } = useQuery({
    queryKey: ['website-health', id],
    queryFn: () => websitesApi.getHealth(id).then((r) => r.data.data),
    enabled: !!id,
  });
  const healthHistory = [...(healthRaw || [])].reverse();

  // Threats for this site
  const { data: threatsRaw } = useQuery({
    queryKey: ['website-threats', id],
    queryFn: () => websitesApi.getThreats(id).then((r) => r.data.data),
    enabled: !!id,
  });
  const threats = threatsRaw || [];

  // SSL logs
  const { data: sslRaw } = useQuery({
    queryKey: ['website-ssl', id],
    queryFn: () => monitoringApi.getSSL({ websiteId: id, limit: 5 }).then((r) => r.data.data),
    enabled: !!id,
  });
  const sslLogs = sslRaw || [];

  // DNS logs
  const { data: dnsRaw } = useQuery({
    queryKey: ['website-dns', id],
    queryFn: () => monitoringApi.getDNS({ websiteId: id, limit: 5 }).then((r) => r.data.data),
    enabled: !!id,
  });
  const dnsLogs = dnsRaw || [];

  // Latest screenshot
  const { data: screenshotRaw } = useQuery({
    queryKey: ['website-screenshot', id],
    queryFn: () => api.get(`/screenshots/${id}/history?limit=1`).then((r) => r.data.data?.[0] || null),
    enabled: !!id,
  });
  const latestShot = screenshotRaw;

  const scanMutation = useMutation({
    mutationFn: () => websitesApi.scan(id),
    onSuccess: () => { toast.success('Scan started'); qc.invalidateQueries({ queryKey: ['website', id] }); },
    onError:   () => toast.error('Scan failed'),
  });

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-[#3b5bdb]" />
      </div>
    </DashboardLayout>
  );

  if (!website) return (
    <DashboardLayout>
      <div className="text-center py-20 text-[#8b949e]">Website not found</div>
    </DashboardLayout>
  );

  const activeThreats = threats.filter((t: Record<string, unknown>) => !t.isResolved).length;
  const sslDays       = website.sslDaysLeft ?? null;

  // Screenshot data URI (base64 from controller)
  const shotSrc = latestShot?.screenshotUrl || null;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-6">
        <Link href="/websites" className="flex items-center gap-1.5 text-sm text-[#8b949e] hover:text-white mb-4">
          <ArrowLeft size={14} /> Back to Websites
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#21262d] flex items-center justify-center shrink-0">
              <Globe size={18} className="text-[#8b949e]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-[#e6edf3]">{website.domain}</h1>
                <a href={`https://${website.domain}`} target="_blank" rel="noopener noreferrer" className="text-[#8b949e] hover:text-blue-400">
                  <ExternalLink size={13} />
                </a>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-sm font-medium capitalize ${STATUS_COLOR[website.status] || 'text-[#8b949e]'}`}>
                  {website.status || 'unknown'}
                </span>
                {website.hostingerAccount?.accountName && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#3b5bdb]/15 text-[#3b5bdb]">
                    {website.hostingerAccount.accountName}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending} className="btn-primary shrink-0">
            {scanMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Scan size={15} />}
            Scan Now
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs text-[#8b949e]">SSL Status</p>
          <p className={`text-lg font-bold ${
            website.sslStatus === 'valid' ? 'text-emerald-400'
            : website.sslStatus === 'expiring' ? 'text-yellow-400'
            : website.sslStatus === 'expired' || website.sslStatus === 'invalid' ? 'text-red-400'
            : 'text-[#8b949e]'
          }`}>
            {website.sslStatus || '—'}
            {sslDays !== null && <span className="text-xs font-normal ml-1 text-[#8b949e]">({sslDays}d)</span>}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-[#8b949e]">Active Threats</p>
          <p className={`text-lg font-bold ${activeThreats > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {activeThreats}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-[#8b949e]">Threat Score</p>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 h-2 bg-[#21262d] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${(website.threatScore || 0) >= 75 ? 'bg-red-500' : (website.threatScore || 0) >= 40 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                style={{ width: `${website.threatScore || 0}%` }}
              />
            </div>
            <span className={`text-sm font-bold ${(website.threatScore || 0) >= 50 ? 'text-red-400' : 'text-emerald-400'}`}>
              {website.threatScore || 0}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <p className="text-xs text-[#8b949e]">Last Scan</p>
          <p className="text-sm font-medium text-[#e6edf3]">
            {website.lastThreatScan
              ? formatDistanceToNow(new Date(website.lastThreatScan), { addSuffix: true })
              : 'Never'}
          </p>
        </div>
      </div>

      {/* Row 2 — Info card + Screenshot */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">

        {/* Site info */}
        <div className="card lg:col-span-2">
          <p className="section-title mb-3">Site Information</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
            {[
              { label: 'Hosting Plan',    value: website.hostingPlan    || '—' },
              { label: 'Hosting User',    value: website.hostingUsername|| '—' },
              { label: 'vHost Type',      value: website.vhostType      || '—' },
              { label: 'HTTP Status',     value: website.httpStatus     ? `${website.httpStatus}` : '—' },
              { label: 'Response Time',   value: website.responseTime   ? `${website.responseTime}ms` : '—' },
              { label: 'Final URL',       value: website.finalUrl       || '—' },
              { label: 'Domain Expiry',   value: website.domainExpiry   ? new Date(website.domainExpiry).toLocaleDateString() : '—' },
              { label: 'SSL Expiry',      value: website.sslExpiry      ? new Date(website.sslExpiry).toLocaleDateString() : '—' },
              { label: 'Last Health',     value: website.lastHealthCheck? formatDistanceToNow(new Date(website.lastHealthCheck), { addSuffix: true }) : 'Never' },
              { label: 'Last Backup',     value: website.lastBackup     ? formatDistanceToNow(new Date(website.lastBackup), { addSuffix: true }) : 'Never' },
              { label: 'CMS / Tech',      value: website.technology?.cms || website.technology?.detected?.join(', ') || '—' },
              { label: 'Server',          value: website.technology?.server || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-2">
                <span className="text-[#8b949e] shrink-0 min-w-[100px]">{label}</span>
                <span className="text-[#e6edf3] truncate">{value}</span>
              </div>
            ))}
          </div>
          {website.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {website.tags.map((tag: string) => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-[#21262d] text-[#8b949e]">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Screenshot */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">Latest Screenshot</p>
            <Link href="/screenshot-monitor" className="text-xs text-[#3b5bdb] hover:underline">Monitor</Link>
          </div>
          {shotSrc ? (
            <div>
              <img src={shotSrc} alt={website.domain} className="w-full rounded-lg border border-[#21262d]" />
              <p className="text-[10px] text-[#8b949e] mt-2 text-right">
                {latestShot?.capturedAt
                  ? formatDistanceToNow(new Date(latestShot.capturedAt), { addSuffix: true })
                  : ''}
                {latestShot?.isDefaced && <span className="ml-2 text-red-400 font-medium">⚠ Defaced</span>}
                {latestShot?.hasChanged && !latestShot?.isDefaced && <span className="ml-2 text-yellow-400 font-medium">Changed</span>}
              </p>
            </div>
          ) : (
            <div className="h-36 flex flex-col items-center justify-center text-[#8b949e] gap-2">
              <Camera size={28} className="opacity-30" />
              <p className="text-xs">No screenshot yet</p>
              <button
                onClick={() => api.post(`/screenshots/${id}/capture`).then(() => {
                  toast.success('Capture started');
                  qc.invalidateQueries({ queryKey: ['website-screenshot', id] });
                }).catch(() => toast.error('Capture failed'))}
                className="btn-secondary text-xs py-1 px-3"
              >
                <Camera size={11} /> Capture now
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 3 — Health chart + Threats */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">

        {/* Health chart */}
        <div className="card">
          <p className="section-title mb-3">Response Time History</p>
          {healthHistory.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={healthHistory} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis
                    dataKey="checkedAt"
                    tickFormatter={(v) => new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    tick={{ fontSize: 10, fill: '#8b949e' }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#8b949e' }} unit="ms" />
                  <Tooltip
                    contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, fontSize: 11 }}
                    labelFormatter={(v) => new Date(v).toLocaleString()}
                    formatter={(val: number) => [`${val}ms`, 'Response']}
                  />
                  <Line type="monotone" dataKey="responseTime" stroke="#3b5bdb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              {/* Uptime indicator */}
              <div className="flex items-center gap-4 mt-2 text-xs text-[#8b949e]">
                <span>
                  Uptime: <span className="text-emerald-400 font-medium">
                    {Math.round((healthHistory.filter((h: Record<string,unknown>) => h.isUp).length / healthHistory.length) * 100)}%
                  </span>
                </span>
                <span>
                  Avg: <span className="text-[#e6edf3] font-medium">
                    {Math.round(healthHistory.reduce((s: number, h: Record<string,unknown>) => s + (h.responseTime as number || 0), 0) / healthHistory.length)}ms
                  </span>
                </span>
                <span>Last {healthHistory.length} checks</span>
              </div>
            </>
          ) : (
            <div className="h-40 flex items-center justify-center text-[#8b949e] text-sm">
              No health data yet — runs every 15 min
            </div>
          )}
        </div>

        {/* Threats */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">Threats ({threats.length})</p>
            <Link href={`/threat-center?websiteId=${id}`} className="text-xs text-[#3b5bdb] hover:underline">View all</Link>
          </div>
          {threats.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-[#8b949e] text-sm">
              <CheckCircle size={14} className="mr-2 text-emerald-400" /> No threats detected
            </div>
          ) : (
            <div className="space-y-2 max-h-44 overflow-y-auto">
              {threats.slice(0, 8).map((t: Record<string, unknown>) => (
                <div key={t._id as string} className="flex items-start gap-2 py-1.5 border-b border-[#21262d] last:border-0">
                  <AlertTriangle size={13} className={`mt-0.5 shrink-0 ${t.severity === 'critical' || t.severity === 'high' ? 'text-red-400' : 'text-yellow-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#e6edf3] capitalize">
                      {((t.threatType || t.type) as string)?.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[10px] text-[#8b949e]">
                      {(t.detectedAt || t.createdAt)
                        ? formatDistanceToNow(new Date((t.detectedAt || t.createdAt) as string), { addSuffix: true })
                        : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {t.isResolved
                      ? <span className="badge-success text-[10px]">Resolved</span>
                      : <span className="badge-danger text-[10px]">Active</span>}
                    {t.severity && (
                      <span className={`text-[10px] font-medium ${t.severity === 'critical' || t.severity === 'high' ? 'text-red-400' : t.severity === 'medium' ? 'text-yellow-400' : 'text-blue-400'}`}>
                        {t.severity as string}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 4 — SSL + DNS */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* SSL History */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">SSL History</p>
            <Link href="/ssl-monitor" className="text-xs text-[#3b5bdb] hover:underline">Monitor</Link>
          </div>
          {sslLogs.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-[#8b949e] text-sm">
              <Lock size={14} className="mr-2 opacity-50" /> No SSL data yet
            </div>
          ) : (
            <div className="space-y-2">
              {sslLogs.slice(0, 4).map((l: Record<string, unknown>, i: number) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-[#21262d] last:border-0">
                  <div>
                    <span className={`text-xs font-medium ${l.isValid ? 'text-emerald-400' : 'text-red-400'}`}>
                      {l.isValid ? 'Valid' : 'Invalid'}
                    </span>
                    {l.issuer && <span className="text-[10px] text-[#8b949e] ml-2">{l.issuer as string}</span>}
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-bold ${(l.daysUntilExpiry as number) <= 7 ? 'text-red-400' : (l.daysUntilExpiry as number) <= 30 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                      {l.daysUntilExpiry != null ? `${l.daysUntilExpiry}d` : '—'}
                    </p>
                    <p className="text-[10px] text-[#8b949e]">
                      {l.checkedAt ? formatDistanceToNow(new Date(l.checkedAt as string), { addSuffix: true }) : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DNS History */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">DNS History</p>
            <Link href="/dns-monitor" className="text-xs text-[#3b5bdb] hover:underline">Monitor</Link>
          </div>
          {dnsLogs.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-[#8b949e] text-sm">
              <Network size={14} className="mr-2 opacity-50" /> No DNS data yet
            </div>
          ) : (
            <div className="space-y-2">
              {dnsLogs.slice(0, 4).map((l: Record<string, unknown>, i: number) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-[#21262d] last:border-0">
                  <div className="flex items-center gap-2">
                    {l.hasChanged
                      ? <span className="badge-warning text-[10px]">Changed</span>
                      : <span className="badge-success text-[10px]">Stable</span>}
                    {l.records && (
                      <span className="text-[10px] text-[#8b949e] truncate max-w-[180px]">
                        {Object.entries(l.records as Record<string, string[]>)
                          .filter(([, v]) => v?.length)
                          .map(([k, v]) => `${k}: ${(v as string[]).slice(0,1).join(', ')}`)
                          .slice(0, 2).join(' | ')}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#8b949e] shrink-0">
                    {l.checkedAt ? formatDistanceToNow(new Date(l.checkedAt as string), { addSuffix: true }) : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}