import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1';

export default function SearchScreen() {
  const params = useLocalSearchParams();
  const [query, setQuery] = useState(params.q as string || '');
  const [medications, setMedications] = useState<any[]>([]);
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'medications' | 'pharmacies'>('medications');

  useEffect(() => {
    if (query.length > 2) search();
    else loadPharmacies();
  }, [query]);

  const search = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${PHARMACY_API}/medications/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setMedications(data.data || []);
    } catch {
      setMedications([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPharmacies = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${PHARMACY_API}/pharmacies/nearby?lat=33.3152&lng=44.3661&radiusKm=15&limit=20`);
      const data = await res.json();
      setPharmacies(data.data || []);
    } catch {
      setPharmacies([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث عن دواء أو صيدلية..."
            textAlign="right"
            autoFocus
          />
          {query ? (
            <TouchableOpacity onPress={() => { setQuery(''); setMedications([]); }}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'medications' && styles.activeTab]}
          onPress={() => setTab('medications')}>
          <Text style={[styles.tabText, tab === 'medications' && styles.activeTabText]}>الأدوية</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'pharmacies' && styles.activeTab]}
          onPress={() => setTab('pharmacies')}>
          <Text style={[styles.tabText, tab === 'pharmacies' && styles.activeTabText]}>الصيدليات</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#0ea5e9" /></View>
      ) : tab === 'medications' ? (
        <FlatList
          data={medications}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{query.length > 2 ? 'لا توجد نتائج' : 'اكتب اسم الدواء للبحث'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.medicationCard}
              onPress={() => router.push(`/medication/request?drugId=${item.id}&drugName=${item.generic_name}`)}>
              <View style={styles.medicationIcon}>
                <Text style={{ fontSize: 28 }}>💊</Text>
              </View>
              <View style={styles.medicationInfo}>
                <Text style={styles.medicationName}>{item.generic_name_ar || item.generic_name}</Text>
                {item.brand_name && <Text style={styles.medicationBrand}>{item.brand_name}</Text>}
                {item.requires_prescription && (
                  <View style={styles.rxBadge}>
                    <Text style={styles.rxBadgeText}>يحتاج وصفة</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity style={styles.orderBtn}
                onPress={() => router.push(`/medication/request?drugId=${item.id}`)}>
                <Text style={styles.orderBtnText}>اطلب</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={pharmacies}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>لا توجد صيدليات</Text></View>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.pharmacyCard} onPress={() => router.push(`/pharmacy/${item.id}`)}>
              <View style={styles.pharmacyIcon}><Text style={{ fontSize: 28 }}>🏥</Text></View>
              <View style={styles.pharmacyInfo}>
                <Text style={styles.pharmacyName}>{item.name}</Text>
                <Text style={styles.pharmacyDist}>{parseFloat(item.distance_km || 0).toFixed(1)} كم</Text>
              </View>
              <Text style={styles.pharmacyRating}>⭐ {item.rating || '4.5'}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f9ff' },
  header: { backgroundColor: '#0ea5e9', padding: 16, paddingTop: 55 },
  searchBar: { backgroundColor: '#fff', borderRadius: 14, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 14 },
  searchInput: { flex: 1, padding: 13, fontSize: 15 },
  clearBtn: { fontSize: 16, color: '#9ca3af', paddingLeft: 8 },
  tabs: { flexDirection: 'row-reverse', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#0ea5e9' },
  tabText: { fontSize: 15, color: '#6b7280', fontWeight: '600' },
  activeTabText: { color: '#0ea5e9' },
  list: { padding: 16, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 15, textAlign: 'center' },
  medicationCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  medicationIcon: { width: 52, height: 52, backgroundColor: '#e0f2fe', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  medicationInfo: { flex: 1, gap: 4 },
  medicationName: { fontSize: 15, fontWeight: '700', color: '#111827', textAlign: 'right' },
  medicationBrand: { fontSize: 13, color: '#6b7280', textAlign: 'right' },
  rxBadge: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-end' },
  rxBadgeText: { fontSize: 11, color: '#d97706', fontWeight: '600' },
  orderBtn: { backgroundColor: '#0ea5e9', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  orderBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  pharmacyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  pharmacyIcon: { width: 52, height: 52, backgroundColor: '#e0f2fe', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  pharmacyInfo: { flex: 1 },
  pharmacyName: { fontSize: 15, fontWeight: '700', color: '#111827', textAlign: 'right' },
  pharmacyDist: { fontSize: 13, color: '#6b7280', textAlign: 'right', marginTop: 3 },
  pharmacyRating: { fontSize: 13, fontWeight: '600', color: '#f59e0b' },
});
