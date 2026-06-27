'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Calendar, FileText, Users, BarChart3, Settings, LogOut, Stethoscope, UserCog } from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { href: '/dashboard/appointments', label: 'المواعيد', icon: Calendar },
  { href: '/dashboard/prescriptions', label: 'الوصفات الطبية', icon: FileText },
  { href: '/dashboard/patients', label: 'المرضى', icon: Users },
  { href: '/dashboard/employees', label: 'الموظفون', icon: UserCog },
  { href: '/dashboard/analytics', label: 'الإحصائيات', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'الإعدادات', icon: Settings },
];

export default function DoctorDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!localStorage.getItem('doctor-token')) router.push('/auth/login');
  }, [router]);

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-l flex flex-col shadow-sm">
        <div className="p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-500 rounded-xl flex items-center justify-center">
              <Stethoscope className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">بوابة الأطباء</p>
              <p className="text-xs text-gray-500">ميديفلو</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium ${
                  active ? 'bg-teal-50 text-teal-700' : 'text-gray-600 hover:bg-gray-100'
                }`}>
                <Icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <button onClick={() => { localStorage.removeItem('doctor-token'); router.push('/auth/login'); }}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 w-full text-sm font-medium transition-colors">
            <LogOut className="w-5 h-5" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b px-6 py-4">
          <h1 className="font-bold text-gray-900">
            {NAV.find(i => i.href === pathname)?.label || 'لوحة التحكم'}
          </h1>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
