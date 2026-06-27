import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';

const GIS_API = 'https://medifloworder-service-production.up.railway.app/api/v1';

export default function DriverDashboard() {
  const [isOnline, setIsOnline] = useState(false);
  const [earnings, setEarnings] = useState({ today: 45000, week: 285000, total: 1250000 });
  const [deliveries, setDeliveries] = useState({ today: 8, week: 47, rating: 4.8 });
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  const locationInterval = useRef<any>(null);

  const toggleOnline = async (value: boolean) => {
    if (value) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('تحذير', 'يجب السماح بالوصول إلى الموقع للعمل');
        return;
      }
      setIsOnline(true);
      startLocationTracking();
      Alert.alert('✅ أنت الآن متاح', 'ستبدأ في استقبال طلبات التوصيل');
    } else {
      setIsOnline(false);
      stopLocationTracking();
      Alert.alert('تم', 'أنت الآن غير متاح');
    }
  };

  const startLocationTracking = () => {
    locationInterval.current = setInterval(async () => {
      try {
        const location = await Location.getCurrentPositionAsync({});
        const token = await SecureStore.getItemAsync('driver_token');
        const driverId = await SecureStore.getItemAsync('driver_id');
        // Send location to GIS service
        // await fetch(`${GIS_API}/gis/drivers/${driverId}/location`, { ... });
      } catch { /* ignore */ }
    }, 5000);
  };

  const stopLocationTracking = () => {
    if (locationInterval.current) {
      clearInterval(locationInterval.current);
      locationInterval.current = null;
    }
  };

  useEffect(() => { return () => stopLocationTracking(); }, []);

  const handleLogout = async () => {
    Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: async () => {
        stopLocationTracking();
        await SecureStore.deleteItemAsync('driver_token');
        router.replace('/login');
      }},
    ]);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutBtn}>خروج</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>لوحة السائق</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Online Toggle */}
      <View style={[styles.onlineCard, isOnline ? styles.onlineCardActive : styles.onlineCardInactive]}>
        <View>
          <Text style={styles.onlineTitle}>{isOnline ? '🟢 أنت متاح' : '🔴 أنت غير متاح'}</Text>
          <Text style={styles.onlineDesc}>{isOnline ? 'تستقبل طلبات التوصيل' : 'اضغط للبدء في العمل'}</Text>
        </View>
        <Switch
          value={isOnline}
          onValueChange={toggleOnline}
          trackColor={{ false: '#d1d5db', true: '#10b981' }}
          thumbColor="#fff"
          style={{ transform: [{ scaleX: 1.3 }, { scaleY: 1.3 }] }}
        />
      </View>

      {/* Active Delivery */}
      {activeDelivery && (
        <View style={styles.activeDeliveryCard}>
          <Text style={styles.activeDeliveryTitle}>🚗 توصيل نشط</Text>
          <Text style={styles.activeDeliveryAddress}>{activeDelivery.address}</Text>
          <View style={styles.deliveryActions}>
            <TouchableOpacity style={styles.arrivedBtn}>
              <Text style={styles.arrivedBtnText}>وصلت للصيدلية ✅</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mapBtn}>
              <Text style={styles.mapBtnText}>📍 الخريطة</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsGrid}>
        {[
          { label: 'أرباح اليوم', value: `${earnings.today.toLocaleString('ar-IQ')} د.ع`, icon: '💰' },
          { label: 'توصيلات اليوم', value: deliveries.today, icon: '📦' },
          { label: 'أرباح الأسبوع', value: `${earnings.week.toLocaleString('ar-IQ')} د.ع`, icon: '📊' },
          { label: 'تقييمي', value: `⭐ ${deliveries.rating}`, icon: '🏆' },
        ].map((stat, i) => (
          <View key={i} style={styles.statCard}>
            <Text style={styles.statIcon}>{stat.icon}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Recent Deliveries */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>آخر التوصيلات</Text>
        {[
          { address: 'الكرادة، شارع المتنبي 123', time: '11:30 ص', amount: 7500, status: 'delivered' },
          { address: 'المنصور، شارع 14 رمضان', time: '10:15 ص', amount: 5000, status: 'delivered' },
          { address: 'الجادرية، جانب الجامعة', time: '09:00 ص', amount: 6500, status: 'delivered' },
        ].map((delivery, i) => (
          <View key={i} style={styles.deliveryCard}>
            <View style={styles.deliveryInfo}>
              <Text style={styles.deliveryAddress}>{delivery.address}</Text>
              <Text style={styles.deliveryTime}>{delivery.time}</Text>
            </View>
            <View style={styles.deliveryAmount}>
              <Text style={styles.amountText}>{delivery.amount.toLocaleString('ar-IQ')} د.ع</Text>
              <Text style={styles.deliveredText}>✅ تم</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdf4' },
  header: { backgroundColor: '#10b981', flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  logoutBtn: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  placeholder: { width: 40 },
  onlineCard: { margin: 16, borderRadius: 20, padding: 20, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  onlineCardActive: { backgroundColor: '#dcfce7', borderWidth: 2, borderColor: '#10b981' },
  onlineCardInactive: { backgroundColor: '#f3f4f6', borderWidth: 2, borderColor: '#d1d5db' },
  onlineTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', textAlign: 'right' },
  onlineDesc: { fontSize: 13, color: '#6b7280', textAlign: 'right', marginTop: 4 },
  activeDeliveryCard: { margin: 16, backgroundColor: '#0ea5e9', borderRadius: 20, padding: 20 },
  activeDeliveryTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', textAlign: 'right', marginBottom: 8 },
  activeDeliveryAddress: { fontSize: 14, color: 'rgba(255,255,255,0.9)', textAlign: 'right', marginBottom: 12 },
  deliveryActions: { flexDirection: 'row-reverse', gap: 10 },
  arrivedBtn: { flex: 1, backgroundColor: '#fff', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  arrivedBtnText: { color: '#0ea5e9', fontWeight: '700', fontSize: 13 },
  mapBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  mapBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  statsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', padding: 8, gap: 0 },
  statCard: { width: '50%', padding: 8 },
  statCardInner: { backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', gap: 6, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  statIcon: { fontSize: 28 },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#111827', textAlign: 'center' },
  statLabel: { fontSize: 12, color: '#6b7280', textAlign: 'center' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', textAlign: 'right', marginBottom: 12 },
  deliveryCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  deliveryInfo: { flex: 1 },
  deliveryAddress: { fontSize: 14, fontWeight: '600', color: '#111827', textAlign: 'right' },
  deliveryTime: { fontSize: 12, color: '#9ca3af', textAlign: 'right', marginTop: 3 },
  deliveryAmount: { alignItems: 'flex-start', gap: 4 },
  amountText: { fontSize: 14, fontWeight: 'bold', color: '#10b981' },
  deliveredText: { fontSize: 12, color: '#10b981' },
});
