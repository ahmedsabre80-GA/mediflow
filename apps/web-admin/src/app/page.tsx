'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem('admin-token');
    if (token) router.push('/dashboard');
    else router.push('/auth/login');
  }, [router]);
  return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full" /></div>;
}
