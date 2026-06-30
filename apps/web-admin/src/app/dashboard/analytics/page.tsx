'use client';
import { TrendingUp, Users, ShoppingCart, Building2, DollarSign } from 'lucide-react';

export default function AnalyticsPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">التحليلات والإحصائيات</h1>
        <p className="text-sm text-gray-500 mt-1">ستظهر البيانات الحقيقية هنا بعد بدء العمليات</p>
      </div>

      {/* KPI Cards - Real zeros */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الإيرادات', value: '0 د.ع', icon: DollarSign, color: 'bg-green-500' },
          { label: 'إجمالي الطلبات', value: '0', icon: ShoppingCart, color: 'bg-sky-500' },
          { label: 'المستخدمون', value: '0', icon: Users, color: 'bg-indigo-500' },
          { label: 'الصيدليات النشطة', value: '0', icon: Building2, color: 'bg-teal-500' },
        ].map(kpi => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className={`w-10 h-10 ${kpi.color} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{kpi.label}</p>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      <div className="bg-white rounded-2xl shadow-sm p-16 text-center">
        <TrendingUp className="w-16 h-16 text-gray-200 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-400 mb-2">لا توجد بيانات بعد</h2>
        <p className="text-gray-400 text-sm">ستظهر التحليلات والرسوم البيانية هنا بعد بدء تسجيل الصيدليات والطلبات الحقيقية</p>
      </div>
    </div>
  );
}
