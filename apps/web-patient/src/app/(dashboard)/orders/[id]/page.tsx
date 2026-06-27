'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle, Package, Truck, MapPin } from 'lucide-react';

const STATUS_STEPS = [
  { key: 'confirmed', label: 'تم تأكيد الطلب', icon: CheckCircle },
  { key: 'preparing', label: 'جاري التحضير', icon: Package },
  { key: 'in_transit', label: 'في الطريق إليك', icon: Truck },
  { key: 'delivered', label: 'تم التسليم', icon: CheckCircle },
];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/orders/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    })
      .then((r) => r.json())
      .then((d) => setOrder(d.data))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full" /></div>;
  if (!order) return <div className="text-center py-20 text-gray-500">الطلب غير موجود</div>;

  const currentStepIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">طلب #{id.slice(0, 8).toUpperCase()}</h1>
      <div className="bg-white rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-6">حالة الطلب</h2>
        <div className="space-y-4">
          {STATUS_STEPS.map((step, i) => {
            const isCompleted = i <= currentStepIndex;
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCompleted ? 'bg-sky-500' : 'bg-gray-100'}`}>
                  <Icon className={`w-5 h-5 ${isCompleted ? 'text-white' : 'text-gray-400'}`} />
                </div>
                <p className={`font-medium ${isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
              </div>
            );
          })}
        </div>
      </div>
      {order.delivery_address && (
        <div className="bg-white rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-sky-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-gray-900 mb-1">عنوان التوصيل</p>
              <p className="text-gray-600 text-sm">{order.delivery_address}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
