'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Trash2, ToggleLeft, ToggleRight, CheckCircle, Loader2, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { accountsApi } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';

export default function AccountsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });
  const accounts = data || [];

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<{ label: string; email: string; apiToken: string }>();

  const openAdd = () => { setEditing(null); reset({ label: '', email: '', apiToken: '' }); setShowModal(true); };
  const openEdit = (a: Record<string, unknown>) => { setEditing(a); reset({ label: a.label as string, email: a.email as string, apiToken: '' }); setShowModal(true); };

  const saveMutation = useMutation({
    mutationFn: (d: { label: string; email: string; apiToken: string }) =>
      editing ? accountsApi.update(editing._id as string, d) : accountsApi.create(d),
    onSuccess: () => { toast.success(editing ? 'Account updated' : 'Account added'); qc.invalidateQueries({ queryKey: ['accounts'] }); setShowModal(false); },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountsApi.delete(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['accounts'] }); },
    onError: () => toast.error('Delete failed'),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => accountsApi.sync(id),
    onSuccess: () => { toast.success('Sync started'); qc.invalidateQueries({ queryKey: ['accounts'] }); },
    onError: () => toast.error('Sync failed'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => accountsApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
    onError: () => toast.error('Toggle failed'),
  });

  const validateMutation = useMutation({
    mutationFn: (id: string) => accountsApi.validate(id),
    onSuccess: (r) => toast.success(r.data.message || 'Token valid'),
    onError: () => toast.error('Invalid token'),
  });

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1 className="page-title">Hostinger Accounts</h1>
        <button onClick={openAdd} className="btn-primary"><Plus size={15} /> Add Account</button>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr><th>Label</th><th>Email</th><th>Status</th><th>Websites</th><th>Last Sync</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-10"><Loader2 size={20} className="animate-spin mx-auto" /></td></tr>
            ) : accounts.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-[#8b949e]">No accounts yet. Add your first Hostinger account.</td></tr>
            ) : accounts.map((a: Record<string, unknown>) => (
              <tr key={a._id as string}>
                <td className="font-medium text-[#e6edf3]">{a.label as string || '—'}</td>
                <td className="text-[#8b949e]">{a.email as string}</td>
                <td>{a.isActive ? <span className="badge-success">Active</span> : <span className="badge-neutral">Inactive</span>}</td>
                <td>{(a.websiteCount as number) || 0}</td>
                <td className="text-xs text-[#8b949e]">{a.lastSyncAt ? new Date(a.lastSyncAt as string).toLocaleDateString() : 'Never'}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(a)} className="btn-ghost py-1 px-2 text-xs">Edit</button>
                    <button onClick={() => syncMutation.mutate(a._id as string)} disabled={syncMutation.isPending} className="btn-ghost py-1 px-2 text-xs" title="Sync"><RefreshCw size={12} /></button>
                    <button onClick={() => validateMutation.mutate(a._id as string)} className="btn-ghost py-1 px-2 text-xs" title="Validate token"><CheckCircle size={12} /></button>
                    <button onClick={() => toggleMutation.mutate(a._id as string)} className="btn-ghost py-1 px-2 text-xs">
                      {a.isActive ? <ToggleRight size={14} className="text-emerald-400" /> : <ToggleLeft size={14} />}
                    </button>
                    <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(a._id as string); }} className="btn-ghost py-1 px-2 text-xs text-red-400"><Trash2 size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[#e6edf3]">{editing ? 'Edit Account' : 'Add Account'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1"><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
              <div>
                <label className="label">Label</label>
                <input {...register('label', { required: true })} className="input" placeholder="My Hostinger" />
              </div>
              <div>
                <label className="label">Email</label>
                <input {...register('email', { required: true })} type="email" className="input" placeholder="user@hostinger.com" />
              </div>
              <div>
                <label className="label">API Token {editing && <span className="text-[#8b949e] font-normal">(blank = keep existing)</span>}</label>
                <input {...register('apiToken', { required: !editing })} type="password" className="input" placeholder="hst_xxxxxxxx" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={isSubmitting || saveMutation.isPending} className="btn-primary flex-1 justify-center">
                  {(isSubmitting || saveMutation.isPending) ? <Loader2 size={15} className="animate-spin" /> : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
