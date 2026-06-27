'use client';
import { Calendar, Users, FileText, Star, Clock, CheckCircle } from 'lucide-react';

export default function DoctorDashboard() {
  const stats = [
    { label: 'مواعيد اليوم', value: '8', icon: Calendar, color: 'bg-teal-500' },
    { label: 'إجمالي المرضى', value: '124', icon: Users, color: 'bg-sky-500' },
    { label: 'وصفات هذا الشهر', value: '47', icon: FileText, color: 'bg-indigo-500' },
    { label: 'التقييم', value: '4.9', icon: Star, color: 'bg-amber-500' },
  ];

  const upcomingAppointments = [
    { name: 'أحمد محمد علي', time: '10:00 ص', type: 'فيديو', status: 'confirmed' },
    { name: 'فاطمة حسن', time: '10:30 ص', type: 'صوت', status: 'confirmed' },
    { name: 'محمود إبراهيم', time: '11:00 ص', type: 'فيديو', status: 'pending' },
    { name: 'سارة أحمد', time: '11:30 ص', type: 'دردشة', status: 'confirmed' },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className={`w-10 h-10 ${stat.color} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Appointments */}
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-gray-900">مواعيد اليوم</h2>
            <span className="text-xs bg-teal-100 text-teal-700 font-medium px-2.5 py-1 rounded-full">
              {upcomingAppointments.length} مواعيد
            </span>
          </div>
          <div className="p-4 space-y-3">
            {upcomingAppointments.map((apt, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-teal-700 font-bold text-sm">{apt.name[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{apt.name}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {apt.time} — {apt.type}
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
                    apt.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {apt.status === 'confirmed' ? 'مؤكد' : 'معلق'}
                  </span>
                  <button className="text-xs bg-teal-500 text-white px-3 py-1 rounded-lg hover:bg-teal-600">
                    بدء
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="px-6 py-4 border-b">
            <h2 className="font-bold text-gray-900">إجراءات سريعة</h2>
          </div>
          <div className="p-6 grid grid-cols-2 gap-3">
            {[
              { label: 'وصفة طبية جديدة', href: '/dashboard/prescriptions/new', color: 'bg-teal-50 text-teal-700 hover:bg-teal-100', icon: FileText },
              { label: 'موعد جديد', href: '/dashboard/appointments/new', color: 'bg-sky-50 text-sky-700 hover:bg-sky-100', icon: Calendar },
              { label: 'قائمة المرضى', href: '/dashboard/patients', color: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100', icon: Users },
              { label: 'الإحصائيات', href: '/dashboard/analytics', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100', icon: Star },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <a key={action.label} href={action.href}
                  className={`${action.color} p-4 rounded-xl flex flex-col items-center gap-2 text-center transition-colors`}>
                  <Icon className="w-6 h-6" />
                  <span className="text-xs font-medium">{action.label}</span>
                </a>
              );
            })}
          </div>

          {/* Recent Activity */}
          <div className="px-6 pb-6">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">آخر النشاطات</h3>
            <div className="space-y-2">
              {[
                'تم إصدار وصفة طبية لـ أحمد محمد',
                'اكتملت استشارة مع فاطمة حسن',
                'موعد جديد مع محمود إبراهيم',
              ].map((activity, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="w-4 h-4 text-teal-500 shrink-0" />
                  {activity}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
