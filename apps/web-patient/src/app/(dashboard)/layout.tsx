'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Search, FileText, Package, Stethoscope } from 'lucide-react';

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'الرئيسية' },
  { href: '/search',    icon: Search,          label: 'بحث' },
  { href: '/doctors',   icon: Stethoscope,     label: 'أطباء' },
  { href: '/orders',    icon: Package,         label: 'طلباتي' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const stored = localStorage.getItem('mediflow-auth');
    if (!stored) { router.push('/auth/login'); return; }
    try {
      const parsed = JSON.parse(stored);
      if (!parsed.state?.isAuthenticated) router.push('/auth/login');
    } catch { router.push('/auth/login'); }
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {children}
      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t shadow-lg z-50" dir="rtl">
        <div className="grid grid-cols-4 h-16">
          {NAV.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} prefetch={false}
                className={`flex flex-col items-center justify-center gap-1 transition-colors ${active ? 'text-sky-600' : 'text-gray-400'}`}>
                <Icon className={`w-5 h-5 ${active ? 'text-sky-600' : 'text-gray-400'}`} />
                <span className="text-xs font-medium">{item.label}</span>
                {active && <span className="absolute top-0 h-0.5 w-8 bg-sky-500 rounded-full" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
