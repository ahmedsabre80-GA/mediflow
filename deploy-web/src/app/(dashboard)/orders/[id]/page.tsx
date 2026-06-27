'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { CheckCircle, Clock, MapPin, Truck, Package, Phone } from 'lucide-react';
import { ordersApi, deliveryApi } from '@/services/api.client';

const STATUS_STEPS = [
  { key: 'confirmed', label: 'تم تأكيد الطلب', icon: CheckCircle },
  { key: 'preparing', label: 'جاري التحضير', icon: Package },
  { key: 'in_transit', label: 'في الطريق إليك', icon: Truck },
  { key: 'delivered', label: 'تم التسليم', icon: CheckCircle },
];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const socketRef = useRef<Socket | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [eta, setEta] = useState<number | null>(null);

  const { data: order, refetch } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.getOrder(id).then((r) => r.data.data),
    refetchInterval: 30000,
  });

  // Live delivery tracking via WebSocket
  useEffect(() => {
    if (!order?.delivery_id) return;

    const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8017', {
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.emit('track:delivery', order.delivery_id);

    socket.on('location:updated', (data: { lat: number; lng: number; etaMinutes: number }) => {
      setDriverLocation({ lat: data.lat, lng: data.lng });
      setEta(data.etaMinutes);
    });

    socket.on('status:updated', () => refetch());

    return () => { socket.disconnect(); };
  }, [order?.delivery_id, refetch]);

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const currentStepIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        طلب #{order.id.slice(0, 8).toUpperCase()}
      </h1>
      <p className="text-gray-500 mb-8 text-sm">
        {new Date(order.created_at).toLocaleDateString('ar-IQ', {
          year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })}
      </p>

      {/* Live Map (when in_transit) */}
      {order.status === 'in_transit' && (
        <div className="bg-gray-900 rounded-2xl overflow-hidden mb-6 relative h-56">
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <div className="text-center">
              <Truck className="w-10 h-10 mx-auto mb-2 text-sky-400" />
              <p className="font-bold">السائق في الطريق</p>
              {eta && <p className="text-sky-400 text-sm mt-1">الوصول خلال {eta} دقيقة</p>}
            </div>
          </div>
          {/* In production: embed Mapbox map here with driverLocation */}
        </div>
      )}

      {/* Progress Steps */}
      <div className="bg-white rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-6">حالة الطلب</h2>
        <div className="space-y-4">
          {STATUS_STEPS.map((step, i) => {
            const isCompleted = i <= currentStepIndex;
            const isCurrent = i === currentStepIndex;
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  isCompleted ? 'bg-sky-500' : 'bg-gray-100'
                }`}>
                  <Icon className={`w-5 h-5 ${isCompleted ? 'text-white' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1">
                  <p className={`font-medium ${isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>
                    {step.label}
                  </p>
                  {isCurrent && (
                    <p className="text-sm text-sky-600 mt-0.5">الحالة الحالية</p>
                  )}
                </div>
                {isCompleted && <CheckCircle className="w-5 h-5 text-sky-500" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Order Items */}
      <div className="bg-white rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">تفاصيل الطلب</h2>
        <div className="space-y-3">
          {(order.items || []).map((item: any) => (
            <div key={item.drug_id} className="flex justify-between items-center">
              <div>
                <p className="font-medium text-gray-900">{item.drug_name}</p>
                <p className="text-sm text-gray-500">الكمية: {item.quantity}</p>
              </div>
              <p className="font-bold text-gray-900">
                {Number(item.total_price).toLocaleString('ar-IQ')} د.ع
              </p>
            </div>
          ))}
          <div className="border-t pt-3 mt-3 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>المجموع الفرعي</span>
              <span>{Number(order.subtotal).toLocaleString('ar-IQ')} د.ع</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>رسوم التوصيل</span>
              <span>{Number(order.delivery_fee).toLocaleString('ar-IQ')} د.ع</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 text-lg border-t pt-2">
              <span>المجموع الكلي</span>
              <span>{Number(order.total_amount).toLocaleString('ar-IQ')} د.ع</span>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Address */}
      <div className="bg-white rounded-2xl p-6 mb-6">
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-sky-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-gray-900 mb-1">عنوان التوصيل</p>
            <p className="text-gray-600 text-sm">{order.delivery_address}</p>
          </div>
        </div>
      </div>

      {/* Contact Support */}
      {['confirmed', 'preparing', 'in_transit'].includes(order.status) && (
        <button className="w-full border border-gray-300 py-3 rounded-xl flex items-center justify-center gap-2 text-gray-700 hover:bg-gray-50 transition-colors">
          <Phone className="w-4 h-4" />
          تواصل مع الدعم
        </button>
      )}
    </div>
  );
}
