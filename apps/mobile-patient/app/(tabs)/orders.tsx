import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

const ORDER_API = 'https://medifloworder-service-production.up.railway.app/api/v1';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending_payment: { label: 'في انتظار الدفع', color: '#d97706', bg: '#fef3c7', icon: '⏳' },
  confirmed: { label: 'مؤكد', color: '#0284c7', bg: '#e0f2fe', icon: '✅' },
  preparing: { label: 'جاري التحضير', color: '#7c3aed', bg: '#ede9fe', icon: '⚗️' },
  in_transit: { label: 'في الطريق', color: '#0369a1', bg: '#dbeafe', icon: '🚗' },
  delivered: { label: 'تم التسليم', color: '#15803d', bg: '#dcfce7', icon: '📦' },
  cancelled: { label: 'ملغي', color: '#dc2626', bg: '#fee2e2', icon: '❌' },
};

export default function OrdersScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadOrders(); }, []);

  const loadOrders = async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token');
      if (!token) return;
      const res = await fetch(`${ORDER_API}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setOrders(data.data || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color="#0ea5e9" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>طلباتي</Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>لا توجد طلبات</Text>
            <Text style={styles.emptyDesc}>ابدأ بطلب دواء الآن</Text>
            <TouchableOpacity style={styles.searchBtn} onPress={() => router.push('/(tabs)/search')}>
              <Text style={styles.searchBtnText}>ابحث عن دواء</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.confirmed;
          return (
            <TouchableOpacity style={styles.orderCard} onPress={() => router.push(`/order/${item.id}`)}>
              <View style={styles.orderHeader}>
                <Text style={styles.orderId}>#{item.id?.slice(0, 8).toUpperCase()}</Text>
                <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                  <Text style={[styles.statusText, { color: status.color }]}>
                    {status.icon} {status.label}
                  </Text>
                </View>
              </View>
              <View style={styles.orderDetails}>
                <Text style={styles.orderAmount}>{Number(item.total_amount || 0).toLocaleString('ar-IQ')} د.ع</Text>
                <Text style={styles.orderDate}>{new Date(item.created_at).toLocaleDateString('ar-IQ')}</Text>
              </View>
              {item.status === 'in_transit' && (
                <TouchableOpacity style={styles.trackBtn} onPress={() => router.push(`/order/${item.id}`)}>
                  <Text style={styles.trackBtnText}>📍 تتبع الطلب</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f9ff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#0ea5e9', padding: 24, paddingTop: 60 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', textAlign: 'right' },
  list: { padding: 16, gap: 12 },
  empty: { padding: 40, alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 64 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151' },
  emptyDesc: { fontSize: 14, color: '#6b7280' },
  searchBtn: { backgroundColor: '#0ea5e9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  orderCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  orderHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: 14, fontWeight: '700', color: '#374151', fontFamily: 'monospace' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '700' },
  orderDetails: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
  orderAmount: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  orderDate: { fontSize: 13, color: '#9ca3af' },
  trackBtn: { backgroundColor: '#e0f2fe', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  trackBtnText: { color: '#0284c7', fontWeight: '700', fontSize: 14 },
});
