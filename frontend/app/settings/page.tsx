'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Lock, User, Bell, Loader2, Eye, EyeOff, Database, Trash2, Sparkles,
  Mail, MessageCircle, Phone, Save, Shield, CheckCircle, Zap, RefreshCw,
  Search, Globe, Send, Webhook,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { authApi, api, websitesApi, systemApi } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';

export default function SettingsPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [showPass, setShowPass] = useState(false);

  const { register, handleSubmit, reset, formState: { isSubmitting } } =
    useForm<{ currentPassword: string; newPassword: string; confirmPassword: string }>();

  const changePasswordMutation = useMutation({
    mutationFn: (d: { currentPassword: string; newPassword: string }) =>
      authApi.updatePassword(d.currentPassword, d.newPassword),
    onSuccess: () => { toast.success('Password updated'); reset(); },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const onSubmit = (d: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    if (d.newPassword !== d.confirmPassword) { toast.error('Passwords do not match'); return; }
    changePasswordMutation.mutate({ currentPassword: d.currentPassword, newPassword: d.newPassword });
  };

  // ── Database Storage Stats & Cleanup ───────────────────────────────────────
  const { data: sysData, isLoading: dbLoading, refetch: refetchDb } = useQuery({
    queryKey: ['db-stats-full'],
    queryFn: () => systemApi.dbStats().then((r) => r.data.data),
    refetchInterval: 60000,
  });
  const db = sysData?.db;
  const server = sysData?.server;

  const cleanupMutation = useMutation({
    mutationFn: (mode: 'normal' | 'aggressive') => systemApi.cleanup(mode),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Database optimized');
      qc.invalidateQueries({ queryKey: ['db-stats-full'] });
      qc.invalidateQueries({ queryKey: ['db-stats'] });
    },
    onError: () => toast.error('Cleanup failed'),
  });

  // ── Alert preferences ──────────────────────────────────────────────────────
  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/users/me').then((r) => r.data.data),
  });

  const [prefs, setPrefs] = useState({
    email: true,
    whatsapp: false,
    telegram: false,
    webhook: false,
    inApp: true,
    phoneNumber: '',
    alertEmail: '',
    escalationPhone: '',
    escalationEmail: '',
    telegramChatId: '',
    webhookUrl: '',
  });

  useEffect(() => {
    if (meData?.alertPreferences) {
      const ap = meData.alertPreferences;
      setPrefs({
        email: ap.email ?? true,
        whatsapp: ap.whatsapp ?? false,
        telegram: ap.telegram ?? false,
        webhook: ap.webhook ?? false,
        inApp: ap.inApp ?? true,
        phoneNumber: ap.phoneNumber || '',
        alertEmail: ap.alertEmail || '',
        escalationPhone: ap.escalationPhone || '',
        escalationEmail: ap.escalationEmail || '',
        telegramChatId: ap.telegramChatId || '',
        webhookUrl: ap.webhookUrl || '',
      });
    }
  }, [meData]);

  const savePrefsMutation = useMutation({
    mutationFn: () => api.patch('/users/me/alert-preferences', prefs),
    onSuccess: () => { toast.success('Alert preferences saved'); qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: () => toast.error('Failed to save'),
  });

  const fullScanMutation = useMutation({
    mutationFn: () => websitesApi.fullScan(),
    onSuccess: (res) => {
      toast.success(`Full scan started for ${res.data.started ?? ''} websites`);
    },
    onError: () => toast.error('Scan failed'),
  });

  const [singleSearch, setSingleSearch] = useState('');
  const [selectedSite, setSelectedSite] = useState<{ _id: string; domain: string } | null>(null);

  const { data: sitesData } = useQuery({
    queryKey: ['websites-for-scan', singleSearch],
    queryFn: () => websitesApi.list({ search: singleSearch || undefined, limit: 20 }).then((r) => r.data.data),
    enabled: singleSearch.length > 1,
  });
  const searchSites = sitesData || [];

  const singleScanMutation = useMutation({
    mutationFn: (id: string) => websitesApi.fullScan([id]),
    onSuccess: () => {
      toast.success(`Scanning ${selectedSite?.domain} — updates in ~1 min`);
      setSelectedSite(null);
      setSingleSearch('');
    },
    onError: () => toast.error('Scan failed'),
  });

  const testMutation = useMutation({
    mutationFn: (channel: 'email' | 'whatsapp' | 'telegram' | 'webhook') =>
      api.post('/users/me/test-alert', { channel }),
    onSuccess: (_: unknown, channel: string) => toast.success(`Test ${channel} sent!`),
    onError: (e: unknown, channel: string) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || `Test ${channel} failed — check .env & preferences`);
    },
  });

  return (
    <DashboardLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings &amp; System Control</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Database storage guard, instant multi-channel alerting, and manual scans
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 max-w-7xl">

        {/* ── Database Storage Guard & Optimizer ───────────────────────────── */}
        <div id="db-storage" className="card lg:col-span-2 border-indigo-200/80">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <Database size={18} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 flex items-center gap-2">
                  Database Storage &amp; Auto-Retention Guard
                  {db?.connected && (
                    <span className={
                      db.status === 'critical' ? 'badge-danger'
                      : db.status === 'warning' ? 'badge-warning'
                      : 'badge-success'
                    }>
                      {db.usagePercent}% used
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Per-site rolling caps + 30-min quota guard prevent MongoDB Atlas from ever filling up.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => refetchDb()} className="btn-secondary text-xs">
                <RefreshCw size={13} /> Refresh
              </button>
              <button
                onClick={() => cleanupMutation.mutate('normal')}
                disabled={cleanupMutation.isPending}
                className="btn-primary text-xs"
              >
                {cleanupMutation.isPending && cleanupMutation.variables === 'normal'
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Sparkles size={13} />}
                Optimize DB Now
              </button>
              <button
                onClick={() => {
                  if (confirm('Run aggressive cleanup? This keeps only latest 25% of retention logs to free maximum DB space immediately.')) {
                    cleanupMutation.mutate('aggressive');
                  }
                }}
                disabled={cleanupMutation.isPending}
                className="btn-danger text-xs"
              >
                {cleanupMutation.isPending && cleanupMutation.variables === 'aggressive'
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Trash2 size={13} />}
                Aggressive Purge
              </button>
            </div>
          </div>

          {dbLoading || !db?.connected ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              <Loader2 size={18} className="animate-spin mx-auto mb-2 text-indigo-600" /> Loading MongoDB storage stats…
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-600 font-medium">Quota Usage ({db.dbName})</span>
                    <span className="font-bold text-slate-900 tabular-nums">{db.usedMB} MB / {db.limitMB} MB</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        db.usagePercent >= 85 ? 'bg-rose-500'
                        : db.usagePercent >= 65 ? 'bg-amber-500'
                        : 'bg-indigo-600'
                      }`}
                      style={{ width: `${Math.max(3, db.usagePercent)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Auto-prune triggers automatically if DB exceeds {db.limitMB} MB
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Data / Storage</span>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">{db.dataSizeMB} MB</span>
                  <span className="text-[11px] text-slate-500 block">Disk: {db.storageSizeMB} MB</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Indexes Size</span>
                  <span className="text-lg font-bold text-sky-600 tabular-nums">{db.indexSizeMB} MB</span>
                  <span className="text-[11px] text-slate-500 block">Max {db.retention?.maxHealthPerSite} health/site</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">API Server RAM</span>
                  <span className="text-lg font-bold text-indigo-600 tabular-nums">{server?.rssMB ?? '—'} MB</span>
                  <span className="text-[11px] text-slate-500 block">
                    Up {server?.uptimeSec ? `${Math.floor(server.uptimeSec / 3600)}h ${Math.floor((server.uptimeSec % 3600) / 60)}m` : '—'}
                  </span>
                </div>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Collection</th>
                      <th>Documents</th>
                      <th>Data Size</th>
                      <th>Storage (Disk)</th>
                      <th>Index Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(db.collections || []).map((c: { name: string; count: number; sizeMB: number; storageMB: number; indexMB: number }) => (
                      <tr key={c.name}>
                        <td className="font-mono text-xs font-semibold text-slate-800">{c.name}</td>
                        <td className="text-xs tabular-nums text-slate-700">{c.count.toLocaleString()}</td>
                        <td className="text-xs tabular-nums text-slate-700">{c.sizeMB} MB</td>
                        <td className="text-xs tabular-nums text-slate-500">{c.storageMB} MB</td>
                        <td className="text-xs tabular-nums font-medium text-sky-700">{c.indexMB} MB</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Manual Full Scan ─────────────────────────────────────────────── */}
        <div className="card lg:col-span-2 border-indigo-200 bg-indigo-50/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap size={16} className="text-indigo-600" />
                <h2 className="font-bold text-slate-900">Manual Full Server Scan</h2>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                Runs Health + Threat + SSL + DNS + Screenshot checks immediately on all active websites.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { icon: '🛡️', label: 'Threat Scan', desc: 'Malware / spam / hack' },
                  { icon: '🔒', label: 'SSL Audit', desc: 'Expiry & validity' },
                  { icon: '🌐', label: 'DNS Diff', desc: 'A / MX / NS changes' },
                  { icon: '❤️', label: 'Uptime Ping', desc: 'Status & latency' },
                  { icon: '📸', label: 'Screenshot', desc: 'Visual defacement' },
                ].map(({ icon, label, desc }) => (
                  <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs shadow-sm">
                    <span>{icon}</span>
                    <div>
                      <p className="text-slate-900 font-semibold">{label}</p>
                      <p className="text-slate-500 text-[10px]">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => fullScanMutation.mutate()}
              disabled={fullScanMutation.isPending}
              className="btn-primary shrink-0 py-3 px-6"
            >
              {fullScanMutation.isPending
                ? <><Loader2 size={16} className="animate-spin" /> Starting…</>
                : <><RefreshCw size={16} /> Run Full Scan</>}
            </button>
          </div>

          <div className="mt-5 pt-4 border-t border-indigo-200/70">
            <p className="text-xs font-semibold text-slate-600 mb-2">Or deep-scan a specific website:</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input pl-9 text-sm w-full"
                  placeholder="Type domain to search..."
                  value={selectedSite ? selectedSite.domain : singleSearch}
                  onChange={(e) => { setSingleSearch(e.target.value); setSelectedSite(null); }}
                />
                {singleSearch.length > 1 && !selectedSite && searchSites.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                    {searchSites.map((s: Record<string, unknown>) => (
                      <button
                        key={s._id as string}
                        onClick={() => { setSelectedSite({ _id: s._id as string, domain: s.domain as string }); setSingleSearch(''); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors"
                      >
                        <Globe size={12} className="text-slate-400 shrink-0" />
                        <span className="text-slate-900 font-medium">{s.domain as string}</span>
                        {s.status ? (
                          <span className={`ml-auto text-[10px] font-semibold ${s.status === 'healthy' ? 'text-emerald-600' : s.status === 'hacked' || s.status === 'down' ? 'text-rose-600' : 'text-amber-600'}`}>
                            {s.status as string}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => selectedSite && singleScanMutation.mutate(selectedSite._id)}
                disabled={!selectedSite || singleScanMutation.isPending}
                className="btn-secondary shrink-0"
              >
                {singleScanMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Scan Site
              </button>
              {selectedSite && (
                <button onClick={() => { setSelectedSite(null); setSingleSearch(''); }} className="btn-ghost px-2.5">×</button>
              )}
            </div>
          </div>
        </div>

        {/* ── Instant Alert Channels ───────────────────────────────────────── */}
        <div className="card lg:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <Bell size={16} className="text-indigo-600" />
            <h2 className="font-bold text-slate-900">Instant Alert Channels</h2>
          </div>
          <p className="text-xs text-slate-500 mb-5">
            Get notified within seconds when any site goes down, gets hacked, SSL expires, or DNS changes.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* In-App */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
                <Bell size={16} className="text-sky-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">In-App + Browser + Alarm</p>
                <p className="text-[11px] text-slate-500">Real-time Socket.IO alerts — always active</p>
              </div>
              <CheckCircle size={18} className="text-emerald-600 shrink-0" />
            </div>

            {/* Email */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                  <Mail size={16} className="text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">Email Alerts</p>
                  <p className="text-[11px] text-slate-500">Detailed HTML incident reports</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.email}
                  onChange={(e) => setPrefs((p) => ({ ...p, email: e.target.checked }))}
                  className="w-4 h-4 rounded cursor-pointer accent-indigo-600"
                />
              </div>
              {prefs.email && (
                <>
                  <input
                    className="input text-xs py-1.5"
                    placeholder={`Alert email (default: ${user?.email || 'login email'})`}
                    value={prefs.alertEmail}
                    onChange={(e) => setPrefs((p) => ({ ...p, alertEmail: e.target.value }))}
                  />
                  <button
                    onClick={() => testMutation.mutate('email')}
                    disabled={testMutation.isPending}
                    className="btn-secondary w-full justify-center text-xs py-1.5"
                  >
                    <Mail size={12} /> Send test email
                  </button>
                </>
              )}
            </div>

            {/* WhatsApp */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <MessageCircle size={16} className="text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">WhatsApp (WAAPI)</p>
                  <p className="text-[11px] text-slate-500">Instant mobile message</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.whatsapp}
                  onChange={(e) => setPrefs((p) => ({ ...p, whatsapp: e.target.checked }))}
                  className="w-4 h-4 rounded cursor-pointer accent-indigo-600"
                />
              </div>
              {prefs.whatsapp && (
                <>
                  <div className="relative">
                    <Phone size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="input pl-8 text-xs py-1.5"
                      placeholder="91XXXXXXXXXX (with country code)"
                      value={prefs.phoneNumber}
                      onChange={(e) => setPrefs((p) => ({ ...p, phoneNumber: e.target.value }))}
                    />
                  </div>
                  <button
                    onClick={() => testMutation.mutate('whatsapp')}
                    disabled={testMutation.isPending || !prefs.phoneNumber}
                    className="btn-secondary w-full justify-center text-xs py-1.5"
                  >
                    <MessageCircle size={12} /> Send test WhatsApp
                  </button>
                </>
              )}
            </div>

            {/* Telegram Bot */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
                  <Send size={16} className="text-sky-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">Telegram Bot</p>
                  <p className="text-[11px] text-slate-500">Free, ultra-fast instant push</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.telegram}
                  onChange={(e) => setPrefs((p) => ({ ...p, telegram: e.target.checked }))}
                  className="w-4 h-4 rounded cursor-pointer accent-indigo-600"
                />
              </div>
              {prefs.telegram && (
                <>
                  <input
                    className="input text-xs py-1.5"
                    placeholder="Telegram Chat ID (e.g. 123456789)"
                    value={prefs.telegramChatId}
                    onChange={(e) => setPrefs((p) => ({ ...p, telegramChatId: e.target.value }))}
                  />
                  <button
                    onClick={() => testMutation.mutate('telegram')}
                    disabled={testMutation.isPending}
                    className="btn-secondary w-full justify-center text-xs py-1.5"
                  >
                    <Send size={12} /> Send test Telegram
                  </button>
                </>
              )}
            </div>

            {/* Slack / Discord Webhook */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                  <Webhook size={16} className="text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">Discord / Slack Webhook</p>
                  <p className="text-[11px] text-slate-500">Team channel alerts</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.webhook}
                  onChange={(e) => setPrefs((p) => ({ ...p, webhook: e.target.checked }))}
                  className="w-4 h-4 rounded cursor-pointer accent-indigo-600"
                />
              </div>
              {prefs.webhook && (
                <>
                  <input
                    className="input text-xs py-1.5"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={prefs.webhookUrl}
                    onChange={(e) => setPrefs((p) => ({ ...p, webhookUrl: e.target.value }))}
                  />
                  <button
                    onClick={() => testMutation.mutate('webhook')}
                    disabled={testMutation.isPending}
                    className="btn-secondary w-full justify-center text-xs py-1.5"
                  >
                    <Webhook size={12} /> Send test Webhook
                  </button>
                </>
              )}
            </div>

            {/* Escalation Contact */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <p className="text-sm font-semibold text-slate-900">Escalation Backup Contact</p>
              <p className="text-[11px] text-slate-500">
                Notified automatically if a hack incident stays unacknowledged after 2 reminders.
              </p>
              <input
                className="input text-xs py-1.5"
                placeholder="Backup email"
                value={prefs.escalationEmail}
                onChange={(e) => setPrefs((p) => ({ ...p, escalationEmail: e.target.value }))}
              />
              <input
                className="input text-xs py-1.5"
                placeholder="Backup WhatsApp (with country code)"
                value={prefs.escalationPhone}
                onChange={(e) => setPrefs((p) => ({ ...p, escalationPhone: e.target.value }))}
              />
            </div>
          </div>

          <button
            onClick={() => savePrefsMutation.mutate()}
            disabled={savePrefsMutation.isPending}
            className="btn-primary mt-5"
          >
            {savePrefsMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Alert Preferences
          </button>
        </div>

        {/* ── Profile ──────────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <User size={16} className="text-indigo-600" />
            <h2 className="font-bold text-slate-900">Profile</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input readOnly value={user?.name || ''} className="input bg-slate-50 text-slate-600 cursor-default" />
            </div>
            <div>
              <label className="label">Email</label>
              <input readOnly value={user?.email || ''} className="input bg-slate-50 text-slate-600 cursor-default" />
            </div>
            <div>
              <label className="label">Role</label>
              <input readOnly value={user?.role?.replace('_', ' ') || ''} className="input bg-slate-50 text-slate-600 cursor-default capitalize" />
            </div>
          </div>
        </div>

        {/* ── Change Password ───────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={16} className="text-indigo-600" />
            <h2 className="font-bold text-slate-900">Change Password</h2>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <label className="label">Current Password</label>
              <input {...register('currentPassword', { required: true })} type={showPass ? 'text' : 'password'} className="input" />
            </div>
            <div>
              <label className="label">New Password</label>
              <div className="relative">
                <input {...register('newPassword', { required: true, minLength: 8 })} type={showPass ? 'text' : 'password'} className="input pr-10" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Confirm Password</label>
              <input {...register('confirmPassword', { required: true })} type={showPass ? 'text' : 'password'} className="input" />
            </div>
            <button type="submit" disabled={isSubmitting || changePasswordMutation.isPending} className="btn-primary w-full justify-center">
              {(isSubmitting || changePasswordMutation.isPending) ? <Loader2 size={14} className="animate-spin" /> : 'Update Password'}
            </button>
          </form>
        </div>

        {/* ── Automated Cron Schedule Reference ────────────────────────────── */}
        <div className="card lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} className="text-indigo-600" />
            <h2 className="font-bold text-slate-900">Active Monitoring Schedule</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            {[
              { icon: '🔴', label: 'Uptime & Latency', desc: 'Every 5 min (flips alert immediately)', color: 'text-rose-700' },
              { icon: '🚨', label: 'Fast Hack Scan', desc: 'Every 10 min (spam, redirects, hidden links)', color: 'text-orange-700' },
              { icon: '🕵️', label: 'Cloaking Detection', desc: 'Hourly (Googlebot vs browser check)', color: 'text-purple-700' },
              { icon: '🔬', label: 'Deep Security Audit', desc: 'Daily 1:00 AM (WP, .env, Safe Browsing)', color: 'text-indigo-700' },
              { icon: '🔒', label: 'SSL & DNS Watch', desc: 'Daily 3:00 AM & 4:00 AM (deduplicated logs)', color: 'text-amber-700' },
              { icon: '🗄️', label: 'DB Quota Guard', desc: 'Every 30 min + Daily 6:00 AM auto-prune', color: 'text-sky-700' },
            ].map(({ icon, label, desc, color }) => (
              <div key={label} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-base shrink-0">{icon}</span>
                <div>
                  <p className={`font-semibold ${color}`}>{label}</p>
                  <p className="text-slate-600 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
