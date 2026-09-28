'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Lock, User, Bell, Loader2, Eye, EyeOff,
  Mail, MessageCircle, Phone, Save, Shield, CheckCircle, Zap, RefreshCw, Search, Globe,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { authApi, api, websitesApi } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';

export default function SettingsPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [showPass, setShowPass] = useState(false);

  // ── Password form ──────────────────────────────────────────────────────────
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

  // ── Alert preferences ──────────────────────────────────────────────────────
  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/users/me').then((r) => r.data.data),
  });

  const [prefs, setPrefs] = useState({
    email: true,
    whatsapp: false,
    inApp: true,
    phoneNumber: '',
    alertEmail: '',
  });

  useEffect(() => {
    if (meData?.alertPreferences) {
      setPrefs({
        email: meData.alertPreferences.email ?? true,
        whatsapp: meData.alertPreferences.whatsapp ?? false,
        inApp: meData.alertPreferences.inApp ?? true,
        phoneNumber: meData.alertPreferences.phoneNumber || '',
        alertEmail: meData.alertPreferences.alertEmail || '',
      });
    }
  }, [meData]);

  const savePrefsMutation = useMutation({
    mutationFn: () => api.patch('/users/me/alert-preferences', prefs),
    onSuccess: () => { toast.success('Preferences saved'); qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: () => toast.error('Failed to save'),
  });

  const fullScanMutation = useMutation({
    mutationFn: () => api.post('/websites/full-scan', {}),

    onSuccess: (res: any) => {
      toast.success(
        `Full scan started for ${res.data.started} websites — updates in ~2 min`
      );
      console.log('FULL RESPONSE', res);
    },

    onError: (err: any) => {
      console.error(err);
      toast.error('Scan failed');
    },  
  });

  // Single site scan
  const [singleSearch, setSingleSearch] = useState('');
  const [selectedSite, setSelectedSite] = useState<{ _id: string; domain: string } | null>(null);

  const { data: sitesData } = useQuery({
    queryKey: ['websites-for-scan', singleSearch],
    queryFn: () => websitesApi.list({ search: singleSearch || undefined, limit: 20 }).then((r) => r.data.data),
    enabled: singleSearch.length > 1,
  });
  const searchSites = sitesData || [];

  const singleScanMutation = useMutation({
    mutationFn: (id: string) => api.post('/websites/full-scan', { ids: [id] }),
    onSuccess: () => {
      toast.success(`Scanning ${selectedSite?.domain} — updates in ~1 min`);
      setSelectedSite(null);
      setSingleSearch('');
    },
    onError: () => toast.error('Scan failed'),
  });

  const testMutation = useMutation({
    mutationFn: (channel: 'email' | 'whatsapp') => api.post('/users/me/test-alert', { channel }),
    onSuccess: (_: unknown, channel: string) => toast.success(`Test ${channel} sent`),
    onError: (_: unknown, channel: string) => toast.error(`Test ${channel} failed — check .env config`),
  });

  return (
    <DashboardLayout>
      <div className="page-header"><h1 className="page-title">Settings</h1></div>

      <div className="grid lg:grid-cols-2 gap-6 max-w-7xl">

        {/* ── Profile ──────────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <User size={16} className="text-[#3b5bdb]" />
            <h2 className="font-semibold text-[#e6edf3]">Profile</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input readOnly value={user?.name || ''} className="input opacity-60 cursor-default" />
            </div>
            <div>
              <label className="label">Email</label>
              <input readOnly value={user?.email || ''} className="input opacity-60 cursor-default" />
            </div>
            <div>
              <label className="label">Role</label>
              <input readOnly value={user?.role || ''} className="input opacity-60 cursor-default capitalize" />
            </div>
          </div>
        </div>

        {/* ── Change Password ───────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={16} className="text-[#3b5bdb]" />
            <h2 className="font-semibold text-[#e6edf3]">Change Password</h2>
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
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b949e]">
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


        {/* ── Full Scan ─────────────────────────────────────────────────── */}
        <div className="card lg:col-span-2 border-[#3b5bdb]/30 bg-[#3b5bdb]/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap size={16} className="text-[#3b5bdb]" />
                <h2 className="font-semibold text-[#e6edf3]">Manual Full Scan</h2>
              </div>
              <p className="text-xs text-[#8b949e] mb-3">
                Runs all checks immediately — no need to wait for cron. Scans all active websites.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  { icon: '🛡️', label: 'Threat Detection', desc: 'Casino/pharma/hack scan' },
                  { icon: '🔒', label: 'SSL Check', desc: 'Certificate validity' },
                  { icon: '🌐', label: 'DNS Monitor', desc: 'Record change detection' },
                  { icon: '❤️', label: 'Health Check', desc: 'Uptime & response time' },
                  { icon: '📸', label: 'Screenshot', desc: 'Visual change detection' },
                ].map(({ icon, label, desc }) => (
                  <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161b22] border border-[#21262d] text-xs">
                    <span>{icon}</span>
                    <div>
                      <p className="text-[#e6edf3] font-medium">{label}</p>
                      <p className="text-[#8b949e] text-[10px]">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => fullScanMutation.mutate()}
              disabled={fullScanMutation.isPending}
              className="btn-primary shrink-0 py-3 px-6 text-base"
            >
              {fullScanMutation.isPending
                ? <><Loader2 size={18} className="animate-spin" /> Scanning...</>
                : <><RefreshCw size={18} /> Run Full Scan</>}
            </button>
          </div>
          {fullScanMutation.isPending && (
            <div className="mt-2 p-3 rounded-lg bg-[#3b5bdb]/10 border border-[#3b5bdb]/20">
              <div className="flex items-center gap-2 text-xs text-[#3b5bdb]">
                <Loader2 size={12} className="animate-spin shrink-0" />
                <span>Running — Health → Threats → SSL → DNS → Screenshots. Check Dashboard in 1–2 minutes.</span>
              </div>
            </div>
          )}

          {/* Single site scan */}
          <div className="mt-4 pt-4 border-t border-[#21262d]">
            <p className="text-xs font-medium text-[#8b949e] mb-2">Or scan a single website:</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]" />
                <input
                  className="input pl-8 text-sm w-full"
                  placeholder="Type domain to search..."
                  value={selectedSite ? selectedSite.domain : singleSearch}
                  onChange={(e) => { setSingleSearch(e.target.value); setSelectedSite(null); }}
                />
                {/* Dropdown */}
                {singleSearch.length > 1 && !selectedSite && searchSites.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                    {searchSites.map((s: Record<string, unknown>) => (
                      <button
                        key={s._id as string}
                        onClick={() => { setSelectedSite({ _id: s._id as string, domain: s.domain as string }); setSingleSearch(''); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[#21262d] transition-colors"
                      >
                        <Globe size={12} className="text-[#8b949e] shrink-0" />
                        <span className="text-[#e6edf3]">{s.domain as string}</span>
                        {s.status && (
                          <span className={`ml-auto text-[10px] ${s.status === 'healthy' ? 'text-emerald-400' : s.status === 'hacked' ? 'text-red-400' : 'text-yellow-400'}`}>
                            {s.status as string}
                          </span>
                        )}
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
                {singleScanMutation.isPending
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Zap size={14} />}
                Scan
              </button>
              {selectedSite && (
                <button onClick={() => { setSelectedSite(null); setSingleSearch(''); }} className="btn-ghost px-2">
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Alert Preferences ─────────────────────────────────────────────── */}
        <div className="card lg:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <Bell size={16} className="text-[#3b5bdb]" />
            <h2 className="font-semibold text-[#e6edf3]">Alert Preferences</h2>
          </div>
          <p className="text-xs text-[#8b949e] mb-5">
            Choose how you want to be notified when a site is hacked, SSL expires, or site goes down.
          </p>

          <div className="grid lg:grid-cols-3 gap-5">

            {/* In-app */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0d1117] border border-[#21262d]">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Bell size={15} className="text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#e6edf3]">In-app</p>
                <p className="text-[11px] text-[#8b949e]">Bell icon — always on</p>
              </div>
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                <CheckCircle size={12} className="text-white" />
              </div>
            </div>

            {/* Email toggle */}
            <div className="p-3 rounded-lg bg-[#0d1117] border border-[#21262d] space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                  <Mail size={15} className="text-purple-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#e6edf3]">Email alerts</p>
                  <p className="text-[11px] text-[#8b949e]">HTML email with details</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.email}
                  onChange={(e) => setPrefs(p => ({ ...p, email: e.target.checked }))}
                  className="w-4 h-4 rounded cursor-pointer"
                />
              </div>
              {prefs.email && (
                <>
                  <input
                    className="input text-xs py-1.5"
                    placeholder={`Alert email (default: ${user?.email || 'login email'})`}
                    value={prefs.alertEmail}
                    onChange={(e) => setPrefs(p => ({ ...p, alertEmail: e.target.value }))}
                  />
                  <button
                    onClick={() => testMutation.mutate('email')}
                    disabled={testMutation.isPending}
                    className="btn-secondary w-full justify-center text-xs py-1"
                  >
                    {testMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />}
                    Send test email
                  </button>
                </>
              )}
            </div>

            {/* WhatsApp toggle */}
            <div className="p-3 rounded-lg bg-[#0d1117] border border-[#21262d] space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <MessageCircle size={15} className="text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#e6edf3]">WhatsApp alerts</p>
                  <p className="text-[11px] text-[#8b949e]">Instant message via WAAPI</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.whatsapp}
                  onChange={(e) => setPrefs(p => ({ ...p, whatsapp: e.target.checked }))}
                  className="w-4 h-4 rounded cursor-pointer"
                />
              </div>
              {prefs.whatsapp && (
                <>
                  <div className="relative">
                    <Phone size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8b949e]" />
                    <input
                      className="input pl-7 text-xs py-1.5"
                      placeholder="91XXXXXXXXXX (with country code)"
                      value={prefs.phoneNumber}
                      onChange={(e) => setPrefs(p => ({ ...p, phoneNumber: e.target.value }))}
                    />
                  </div>
                  <button
                    onClick={() => testMutation.mutate('whatsapp')}
                    disabled={testMutation.isPending || !prefs.phoneNumber}
                    className="btn-secondary w-full justify-center text-xs py-1"
                  >
                    {testMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <MessageCircle size={11} />}
                    Send test WhatsApp
                  </button>
                </>
              )}
            </div>

          </div>

          <button
            onClick={() => savePrefsMutation.mutate()}
            disabled={savePrefsMutation.isPending}
            className="btn-primary mt-5"
          >
            {savePrefsMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Preferences
          </button>
        </div>

        {/* ── When alerts fire ──────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} className="text-[#3b5bdb]" />
            <h2 className="font-semibold text-[#e6edf3]">When do alerts fire?</h2>
          </div>
          <div className="space-y-2.5 text-xs">
            {[
              { icon: '🚨', label: 'Website Hacked', desc: 'Casino/pharma/redirect/defacement — every 30 min', color: 'text-red-400' },
              { icon: '🔴', label: 'Site Down', desc: 'HTTP fails or timeout — every 15 min', color: 'text-red-400' },
              { icon: '🔒', label: 'SSL Expiring', desc: '30d / 15d / 7d / 3d before expiry — daily 3 AM', color: 'text-yellow-400' },
              { icon: '🌐', label: 'DNS Changed', desc: 'A/MX/NS records changed — daily 4 AM', color: 'text-purple-400' },
              { icon: '📸', label: 'Visual Change', desc: 'Screenshot diff from previous — daily 2 AM', color: 'text-blue-400' },
            ].map(({ icon, label, desc, color }) => (
              <div key={label} className="flex items-start gap-2 p-2 rounded bg-[#0d1117] border border-[#21262d]">
                <span className="text-sm shrink-0">{icon}</span>
                <div>
                  <p className={`font-medium ${color}`}>{label}</p>
                  <p className="text-[#8b949e] mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── .env reminder ────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Bell size={16} className="text-[#3b5bdb]" />
            <h2 className="font-semibold text-[#e6edf3]">Alert Configuration</h2>
          </div>

          <div className="mt-3 space-y-2">
            {[
              { label: 'WhatsApp Alerts', desc: 'Via WAAPI — configure WAAPI_TOKEN in .env' },
              { label: 'Email Alerts', desc: 'Via Nodemailer SMTP — configure SMTP_* in .env' },
              { label: 'In-App Alerts', desc: 'Real-time via Socket.IO — always on' },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-start gap-2 p-2 rounded bg-[#21262d]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <div>
                  <p className="text-[#e6edf3] font-medium text-xs">{label}</p>
                  <p className="text-[#8b949e] text-[11px]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}