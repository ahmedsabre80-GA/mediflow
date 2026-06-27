'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MapPin, Phone, Star, Clock, Truck, ArrowRight, Package } from 'lucide-react';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function PharmacyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pharmacy, setPharmacy] = useState<any>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${PHARMACY_API}/pharmacies/${id}`).then(r => r.json()),
      fetch(`${PHARMACY_API}/pharmacies/${id}/inventory`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([pharmData, invData]) => {
      setPharmacy(pharmData.data);
      setInventory(invData.data || []);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full" />
    </div>
  );

  if (!pharmacy) return (
    <div className="text-center py-20 text-gray-500" dir="rtl">
      <p>الصيدلية غير موجودة</p>
      <button onClick={() => router.back()} className="mt-4 text-sky-600 hover:underline">العودة</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-sky-500 text-white px-4 py-6 pt-12">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sky-200 mb-4 hover:text-white">
          <ArrowRight className="w-5 h-5" />
          <span className="text-sm">العودة</span>
        </button>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-3xl">🏥</div>
          <div>
            <h1 className="text-xl font-bold">{pharmacy.name_ar || pharmacy.name}</h1>
            <p className="text-sky-200 text-sm mt-1 flex items-center gap-1">
              <MapPin className="w-4 h-4" /> {pharmacy.address}
            </p>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="px-4 py-4 grid grid-cols-3 gap-3 -mt-4">
        {[
          { icon: '⭐', label: 'التقييم', value: parseFloat(pharmacy.rating).toFixed(1) },
          { icon: '🕒', label: 'الحالة', value: 'مفتوح' },
          { icon: '🚗', label: 'التوصيل', value: 'متاح' },
        ].map((item, i) => (
          <div key={i} className="bg-white rounded-xl p-3 text-center shadow-sm">
            <div className="text-xl mb-1">{item.icon}</div>
            <p className="text-sm font-bold text-gray-900">{item.value}</p>
            <p className="text-xs text-gray-500">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Contact */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center">
            <Phone className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">رقم الهاتف</p>
            <p className="font-medium text-gray-900 dir-ltr">{pharmacy.phone}</p>
          </div>
          <a href={`tel:${pharmacy.phone}`}
            className="mr-auto bg-sky-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-sky-600">
            اتصال
          </a>
        </div>
      </div>

      {/* Inventory */}
      <div className="px-4 pb-8">
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-sky-500" />
          الأدوية المتوفرة ({inventory.length})
        </h2>
        {inventory.length === 0 ? (
          <div className="text-center py-8 text-gray-500">لا توجد أدوية مسجلة</div>
        ) : (
          <div className="space-y-3">
            {inventory.map((item: any) => (
              <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3">
                <div className="w-12 h-12 bg-sky-50 rounded-xl flex items-center justify-center text-2xl shrink-0">💊</div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">
                    {item.generic_name_ar || item.generic_name}
                  </p>
                  <p className="text-xs text-gray-500">{item.brand_name}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sky-600 text-sm">{Number(item.selling_price).toLocaleString('ar-IQ')} د.ع</p>
                  <p className="text-xs text-green-600">متوفر ✓</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Order Button */}
        <button className="w-full mt-6 bg-sky-500 hover:bg-sky-600 text-white font-bold py-4 rounded-2xl transition-colors text-lg shadow-lg">
          طلب من هذه الصيدلية
        </button>
      </div>
    </div>
  );
}
