'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Loader2 } from 'lucide-react';
import { websitesApi, accountsApi } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';

const schema = z.object({
  domain: z.string().min(3, 'Enter a valid domain'),
  accountId: z.string().optional(),
  alertEmail: z.string().email().optional().or(z.literal('')),
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
      toast.success('Website added');
      qc.invalidateQueries({ queryKey: ['websites'] });
      onClose();
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to add website');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-[#e6edf3]">Add Website</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Domain *</label>
            <input {...register('domain')} className="input" placeholder="example.com" />
            {errors.domain && <p className="text-xs text-red-400 mt-1">{errors.domain.message}</p>}
          </div>

          <div>
            <label className="label">Hostinger Account</label>
            <select {...register('accountId')} className="input">
              <option value="">None</option>
              {(accountsData || []).map((a: Record<string, unknown>) => (
                <option key={a._id as string} value={a._id as string}>{a.label as string || a.email as string}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Alert Email</label>
            <input {...register('alertEmail')} type="email" className="input" placeholder="alerts@example.com" />
          </div>

          <div>
            <label className="label">Alert Phone (WhatsApp)</label>
            <input {...register('alertPhone')} className="input" placeholder="+919999999999" />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={isSubmitting || mutation.isPending} className="btn-primary flex-1 justify-center">
              {(isSubmitting || mutation.isPending) ? <Loader2 size={15} className="animate-spin" /> : 'Add Website'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
