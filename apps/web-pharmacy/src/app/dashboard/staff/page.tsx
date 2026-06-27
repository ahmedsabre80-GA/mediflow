'use client';
import { Plus, User, Mail, Phone } from 'lucide-react';

const STAFF = [
  { name: 'أحمد محمد', role: 'صيدلاني', email: 'ahmed@pharmacy.com', phone: '+9647801234567', status: 'نشط' },
  { name: 'سارة علي', role: 'صراف', email: 'sara@pharmacy.com', phone: '+9647801234568', status: 'نشط' },
  { name: 'محمد حسن', role: 'مساعد', email: 'mohammed@pharmacy.com', phone: '+9647801234569', status: 'إجازة' },
];

export default function StaffPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">إدارة الموظفين</h2>
        <button className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white font-medium px-4 py-2 rounded-xl transition-colors text-sm">
          <Plus className="w-4 h-4" />
          إضافة موظف
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STAFF.map((member) => (
          <div key={member.name} className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">{member.name}</p>
                <p className="text-xs text-gray-500">{member.role}</p>
              </div>
              <span className={`mr-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                member.status === 'نشط' ? 'text-green-600 bg-green-50' : 'text-yellow-600 bg-yellow-50'
              }`}>
                {member.status}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="w-4 h-4 text-gray-400" />
                <span dir="ltr">{member.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-4 h-4 text-gray-400" />
                <span dir="ltr">{member.phone}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
