'use client';
import { useState } from 'react';
import { Plus, Megaphone, Eye, BarChart2 } from 'lucide-react';

const MOCK_CAMPAIGNS = [
  { id: 1, title: 'عرض رمضان على المضادات الحيوية', target: 12, delivered: 12, opened: 8, clicked: 5, status: 'completed', date: '2026-06-20' },
  { id: 2, title: 'خصم 15% على مسكنات الألم', target: 8, delivered: 8, opened: 6, clicked: 4, status: 'active', date: '2026-06-25' },
  { id: 3, title: 'منتجات جديدة — أدوية السكري', target: 15, delivered: 0, opened: 0, clicked: 0, status: 'scheduled', date: '2026-07-01' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'نشطة', color: 'bg-green-100 text-green-700' },
  completed: { label: 'مكتملة', color: 'bg-gray-100 text-gray-700' },
  scheduled: { label: 'مجدولة', color: 'bg-sky-100 text-sky-700' },
  draft: { label: 'مسودة', color: 'bg-amber-100 text-amber-700' },
};

export default function CampaignsPage() {
  const [showNew, setShowNew] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ title: '', targetPharmacies: '', scheduledAt: '', body: '' });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">الحملات الإعلانية</h1>
        <button onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> حملة جديدة
        </button>
      </div>

      {/* New Campaign Form */}
      {showNew && (
        <div className="bg-white rounded-2xl shadow-sm p-6 border-2 border-amber-200">
          <h2 className="font-bold text-gray-900 mb-4">إنشاء حملة جديدة</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">عنوان الحملة</label>
              <input value={newCampaign.title} onChange={e => setNewCampaign({...newCampaign, title: e.target.value})}
                placeholder="عرض خاص على..."
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">نص الرسالة</label>
              <textarea value={newCampaign.body} onChange={e => setNewCampaign({...newCampaign, body: e.target.value})}
                placeholder="تفاصيل العرض..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">عدد الصيدليات المستهدفة</label>
              <input type="number" value={newCampaign.targetPharmacies} onChange={e => setNewCampaign({...newCampaign, targetPharmacies: e.target.value})}
                placeholder="10"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">تاريخ الإرسال</label>
              <input type="datetime-local" value={newCampaign.scheduledAt} onChange={e => setNewCampaign({...newCampaign, scheduledAt: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowNew(false)}
              className="flex-1 border border-gray-300 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">إلغاء</button>
            <button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
              إنشاء الحملة
            </button>
          </div>
        </div>
      )}

      {/* Campaigns List */}
      <div className="space-y-4">
        {MOCK_CAMPAIGNS.map(campaign => {
          const status = STATUS_LABELS[campaign.status];
          const openRate = campaign.delivered > 0 ? ((campaign.opened / campaign.delivered) * 100).toFixed(0) : 0;
          const clickRate = campaign.opened > 0 ? ((campaign.clicked / campaign.opened) * 100).toFixed(0) : 0;
          return (
            <div key={campaign.id} className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                    <Megaphone className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{campaign.title}</p>
                    <p className="text-xs text-gray-500">{campaign.date}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
              </div>
              <div className="grid grid-cols-4 gap-4 bg-gray-50 rounded-xl p-4">
                {[
                  { label: 'المستهدفون', value: campaign.target },
                  { label: 'تم التسليم', value: campaign.delivered },
                  { label: 'معدل الفتح', value: `${openRate}%` },
                  { label: 'معدل النقر', value: `${clickRate}%` },
                ].map(metric => (
                  <div key={metric.label} className="text-center">
                    <p className="text-xl font-bold text-gray-900">{metric.value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{metric.label}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
