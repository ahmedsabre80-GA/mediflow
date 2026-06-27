import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, FlatList } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function HomeScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [nearbyPharmacies, setNearbyPharmacies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let lat = 33.3152;
      let lng = 44.3661;

      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        lat = location.coords.latitude;
        lng = location.coords.longitude;
      }

      const res = await fetch(`${PHARMACY_API}/pharmacies/nearby?lat=${lat}&lng=${lng}&radiusKm=10&limit=5`);
      const data = await res.json();
      setNearbyPharmacies(data.data || []);
    } catch {
      setNearbyPharmacies([]);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    { icon: '💊', label: 'طلب دواء', onPress: () => router.push('/medication/request') },
    { icon: '👨‍⚕️', label: 'طبيب', onPress: () => router.push('/(tabs)/search') },
    { icon: '📋', label: 'وصفاتي', onPress: () => router.push('/(tabs)/prescriptions') },
    { icon: '📦', label: 'طلباتي', onPress: () => router.push('/(tabs)/orders') },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>مرحباً 👋</Text>
          <Text style={styles.headerSubtitle}>ابحث عن دوائك الآن</Text>
        </View>
        <TouchableOpacity style={styles.notifBtn}>
          <Text style={styles.notifIcon}>🔔</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="ابحث عن دواء أو صيدلية..."
          textAlign="right"
          onSubmitEditing={() => router.push(`/(tabs)/search?q=${searchQuery}`)}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={() => router.push(`/(tabs)/search?q=${searchQuery}`)}>
          <Text style={{ color: '#fff', fontSize: 18 }}>🔍</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ماذا تريد؟</Text>
        <View style={styles.quickActions}>
          {quickActions.map((action, i) => (
            <TouchableOpacity key={i} style={styles.quickAction} onPress={action.onPress}>
              <View style={styles.quickActionIcon}>
                <Text style={{ fontSize: 24 }}>{action.icon}</Text>
              </View>
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Emergency Request Banner */}
      <TouchableOpacity style={styles.emergencyBanner} onPress={() => router.push('/medication/request')}>
        <View>
          <Text style={styles.emergencyTitle}>🚨 طلب طارئ</Text>
          <Text style={styles.emergencyDesc}>اطلب دواءك بأولوية قصوى</Text>
        </View>
        <Text style={styles.emergencyArrow}>←</Text>
      </TouchableOpacity>

      {/* Nearby Pharmacies */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/search')}>
            <Text style={styles.seeAll}>عرض الكل</Text>
          </TouchableOpacity>
          <Text style={styles.sectionTitle}>صيدليات قريبة</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>جاري التحميل...</Text>
          </View>
        ) : nearbyPharmacies.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا توجد صيدليات قريبة</Text>
          </View>
        ) : (
          nearbyPharmacies.map((pharmacy, i) => (
            <TouchableOpacity key={i} style={styles.pharmacyCard}
              onPress={() => router.push(`/pharmacy/${pharmacy.id}`)}>
              <View style={styles.pharmacyIcon}>
                <Text style={{ fontSize: 28 }}>🏥</Text>
              </View>
              <View style={styles.pharmacyInfo}>
                <Text style={styles.pharmacyName}>{pharmacy.name}</Text>
                <Text style={styles.pharmacyDetails}>
                  {parseFloat(pharmacy.distance_km || 0).toFixed(1)} كم • مفتوح
                </Text>
              </View>
              <View style={styles.pharmacyRating}>
                <Text style={styles.ratingText}>⭐ {pharmacy.rating || '4.5'}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Loyalty Points */}
      <View style={styles.loyaltyCard}>
        <Text style={styles.loyaltyTitle}>نقاط المكافآت ⭐</Text>
        <Text style={styles.loyaltyPoints}>0 نقطة</Text>
        <Text style={styles.loyaltyDesc}>اطلب الآن لتجميع النقاط</Text>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f9ff' },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: 60, backgroundColor: '#0ea5e9' },
  greeting: { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'right' },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'right', marginTop: 4 },
  notifBtn: { width: 42, height: 42, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  notifIcon: { fontSize: 20 },
  searchContainer: { flexDirection: 'row-reverse', margin: 16, backgroundColor: '#fff', borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, overflow: 'hidden' },
  searchInput: { flex: 1, padding: 14, fontSize: 15 },
  searchBtn: { backgroundColor: '#0ea5e9', paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', textAlign: 'right', marginBottom: 12 },
  seeAll: { color: '#0ea5e9', fontSize: 14, fontWeight: '600' },
  quickActions: { flexDirection: 'row-reverse', gap: 12 },
  quickAction: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  quickActionIcon: { width: 52, height: 52, backgroundColor: '#e0f2fe', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  quickActionLabel: { fontSize: 12, fontWeight: '600', color: '#374151', textAlign: 'center' },
  emergencyBanner: { margin: 16, backgroundColor: '#fef2f2', borderWidth: 1.5, borderColor: '#fca5a5', borderRadius: 16, padding: 16, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  emergencyTitle: { fontSize: 16, fontWeight: 'bold', color: '#dc2626', textAlign: 'right' },
  emergencyDesc: { fontSize: 13, color: '#ef4444', textAlign: 'right', marginTop: 2 },
  emergencyArrow: { fontSize: 20, color: '#dc2626' },
  pharmacyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  pharmacyIcon: { width: 52, height: 52, backgroundColor: '#e0f2fe', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  pharmacyInfo: { flex: 1 },
  pharmacyName: { fontSize: 15, fontWeight: '700', color: '#111827', textAlign: 'right' },
  pharmacyDetails: { fontSize: 13, color: '#6b7280', textAlign: 'right', marginTop: 3 },
  pharmacyRating: { alignItems: 'center' },
  ratingText: { fontSize: 13, fontWeight: '600', color: '#f59e0b' },
  loadingContainer: { padding: 20, alignItems: 'center' },
  loadingText: { color: '#6b7280', textAlign: 'center' },
  emptyContainer: { padding: 20, alignItems: 'center' },
  emptyText: { color: '#6b7280', textAlign: 'center' },
  loyaltyCard: { margin: 16, backgroundColor: '#6366f1', borderRadius: 20, padding: 20, alignItems: 'center' },
  loyaltyTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 8 },
  loyaltyPoints: { fontSize: 36, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  loyaltyDesc: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
});
