'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pill, Eye, EyeOff, Loader2 } from 'lucide-react';
import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

const LoginSchema = z.object({
  identifier: z.string().min(1, 'البريد الإلكتروني أو رقم الهاتف مطلوب'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

type LoginForm = z.infer<typeof LoginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      setError('');
      const res = await apiClient.post('/auth/login', data);
      const { accessToken, refreshToken } = res.data.data;
      setAuth(accessToken, refreshToken);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.error?.detail || 'حدث خطأ. حاول مرة أخرى.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-teal-50 px-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center">
              <Pill className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-sky-700">ميديفلو</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">مرحباً بعودتك</h1>
          <p className="text-gray-600 mt-1">سجّل دخولك للمتابعة</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                البريد الإلكتروني أو رقم الهاتف
              </label>
              <input
                {...register('identifier')}
                type="text"
                dir="ltr"
                placeholder="example@email.com أو +9647801234567"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
              />
              {errors.identifier && (
                <p className="text-red-500 text-xs mt-1">{errors.identifier.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm pr-12"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded text-sky-500" />
                <span className="text-sm text-gray-600">تذكرني</span>
              </label>
              <Link href="/auth/forgot-password" className="text-sm text-sky-600 hover:underline">
                نسيت كلمة المرور؟
              </Link>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">أو</span>
              </div>
            </div>

            <button
              type="button"
              className="w-full border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-3"
            >
              <img src="/google-logo.svg" alt="Google" className="w-5 h-5" />
              المتابعة مع Google
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-600 mt-6">
          ليس لديك حساب؟{' '}
          <Link href="/auth/register" className="text-sky-600 font-semibold hover:underline">
            سجّل الآن مجاناً
          </Link>
        </p>
      </div>
    </div>
  );
}
