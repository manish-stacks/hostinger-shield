'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Loader2, Globe } from 'lucide-react';
import { websitesApi, accountsApi } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';

const schema = z.object({
  domain: z.string().min(3, 'Enter a valid domain (e.g. example.com)'),
  hostingerAccount: z.string().optional(),
  serverName: z.string().optional(),
  alertEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  alertPhone: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export function AddWebsiteModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data),
  });

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => websitesApi.create(data),
    onSuccess: () => {
      toast.success('Website added — running initial health & SSL check');
      qc.invalidateQueries({ queryKey: ['websites'] });
      qc.invalidateQueries({ queryKey: ['website-stats'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to add website';
      toast.error(msg);
    },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <Globe size={16} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="font-bold text-slate-50">Add Website</h2>
              <p className="text-[11px] text-slate-400">Monitor any domain across any server</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Domain *</label>
            <input {...register('domain')} className="input" placeholder="example.com (or https://example.com)" autoFocus />
            {errors.domain && <p className="text-xs text-rose-400 mt-1">{errors.domain.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Hostinger Account (optional)</label>
              <select {...register('hostingerAccount')} className="input">
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
              <input {...register('serverName')} className="input" placeholder="e.g. VPS-1, Main" />
            </div>
          </div>

          <div>
            <label className="label">Site-Specific Alert Email (optional)</label>
            <input {...register('alertEmail')} type="email" className="input" placeholder="alerts@example.com" />
            {errors.alertEmail && <p className="text-xs text-rose-400 mt-1">{errors.alertEmail.message}</p>}
          </div>

          <div>
            <label className="label">Site-Specific WhatsApp Phone (optional)</label>
            <input {...register('alertPhone')} className="input" placeholder="919999999999" />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={isSubmitting || mutation.isPending} className="btn-primary flex-1 justify-center">
              {(isSubmitting || mutation.isPending) ? <Loader2 size={15} className="animate-spin" /> : 'Add & Monitor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
