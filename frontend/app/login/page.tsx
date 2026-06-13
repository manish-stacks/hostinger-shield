'use client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldAlert, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/components/ui/Toaster';
//lNYYCU6SsnFbA6RCTpnBXaL3etV8ZgJFQG5qzDzv8fe81c9f
const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [showPass, setShowPass] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: 'admin@shieldpro.com',
      password: 'Admin@123456',
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await login(data.email, data.password);
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })
          ?.response?.data?.error ||
        (err as { response?: { data?: { message?: string } } })
          ?.response?.data?.message ||
        'Login failed';
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm card">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#3b5bdb] flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">Shield Pro</h1>
          <p className="text-sm text-[#8b949e] mt-1">Hostinger Security Platform</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                {...register('email')}
                type="email"
                className="input"
                placeholder="admin@shieldpro.com"
                autoComplete="email"
              />
              {errors.email && (
                <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPass ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b949e] hover:text-white"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full justify-center mt-2"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-[10px] text-[#3d4451] mt-4">
            Default: admin@shieldpro.com / Admin@123456
          </p>
        </div>
      </div>
    </div>
  );
}