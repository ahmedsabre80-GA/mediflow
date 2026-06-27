'use client';
import { useState } from 'react';
import { Plus, Megaphone, Eye, MousePointer, ShoppingCart } from 'lucide-react';

export default function CampaignsPage() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">الحملات الإعلانية</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white font-medium px-4 py-2 rounded-xl transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          حملة جديدة
        </button>
      </div>

      {/* Info Card */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
        <p className="text-sm text-sky-700">
          📢 يمكنك إرسال حملة واحدة كل 24 يوماً لما يصل إلى 6 مرضى محفوظين.
        </p>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4">إنشاء حملة جديدة</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">عنوان الحملة</label>
              <input placeholder="عروض رمضان على الفيتامينات" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">نص الرسالة</label>
              <textarea rows={3} placeholder="احصل على خصم 20% على جميع الفيتامينات..." className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
              <button className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-2 rounded-xl text-sm font-medium transition-colors">إرسال الحملة</button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      <div className="bg-white rounded-2xl p-12 shadow-sm text-center">
        <Megaphone className="w-12 h-12 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">لا توجد حملات سابقة</p>
        <p className="text-gray-400 text-sm mt-1">أنشئ حملتك الأولى للتواصل مع مرضاك</p>
      </div>
    </div>
  );
}
