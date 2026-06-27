'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Package, ShoppingBag, BarChart2,
  Users, Megaphone, Settings, LogOut, Bell
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'الرئيسية' },
  { href: '/dashboard/orders', icon: ShoppingBag, label: 'الطلبات' },
  { href: '/dashboard/inventory', icon: Package, label: 'المخزون' },
  { href: '/dashboard/analytics', icon: BarChart2, label: 'التحليلات' },
  { href: '/dashboard/employees', icon: Users, label: 'الموظفون' },
  { href: '/dashboard/campaigns', icon: Megaphone, label: 'الحملات' },
  { href: '/dashboard/settings', icon: Settings, label: 'الإعدادات' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('pharmacy-token');
    if (!token) router.push('/auth/login');
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('pharmacy-token');
    localStorage.removeItem('pharmacy-refresh');
    router.push('/auth/login');
  };

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-l border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-sky-500 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg">🏥</span>
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">ميديفلو</p>
              <p className="text-xs text-gray-500">لوحة الصيدلية</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? 'bg-sky-50 text-sky-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 w-full transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">لوحة التحكم</h1>
          <div className="flex items-center gap-3">
            <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <div className="w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
              ص
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
