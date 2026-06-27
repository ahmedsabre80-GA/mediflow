import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { router } from 'expo-router';

const MOCK_PRESCRIPTIONS = [
  { id: 'RX-001', doctorName: 'د. أحمد الراوي', date: '2026-06-20', status: 'active', medications: ['أموكسيسيلين 500mg', 'باراسيتامول 500mg'] },
  { id: 'RX-002', doctorName: 'د. سارة حسن', date: '2026-06-15', status: 'dispensed', medications: ['إيبوبروفين 400mg'] },
  { id: 'RX-003', doctorName: 'د. محمد علي', date: '2026-06-01', status: 'expired', medications: ['أوميبرازول 20mg', 'ميتفورمين 500mg'] },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'نشطة', color: '#15803d', bg: '#dcfce7' },
  dispensed: { label: 'تم الصرف', color: '#0284c7', bg: '#e0f2fe' },
  expired: { label: 'منتهية', color: '#dc2626', bg: '#fee2e2' },
};

export default function PrescriptionsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>وصفاتي الطبية</Text>
      </View>

      <FlatList
        data={MOCK_PRESCRIPTIONS}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>لا توجد وصفات</Text>
            <TouchableOpacity style={styles.consultBtn} onPress={() => router.push('/(tabs)/search')}>
              <Text style={styles.consultBtnText}>استشر طبيب</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const status = STATUS_CONFIG[item.status];
          return (
            <View style={styles.rxCard}>
              <View style={styles.rxHeader}>
                <Text style={styles.rxId}>{item.id}</Text>
                <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                  <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>
              <Text style={styles.doctorName}>{item.doctorName}</Text>
              <Text style={styles.rxDate}>{item.date}</Text>
              <View style={styles.medications}>
                {item.medications.map((med, i) => (
                  <View key={i} style={styles.medBadge}>
                    <Text style={styles.medBadgeText}>💊 {med}</Text>
                  </View>
                ))}
              </View>
              {item.status === 'active' && (
                <TouchableOpacity style={styles.useBtn}>
                  <Text style={styles.useBtnText}>استخدام في طلب</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f9ff' },
  header: { backgroundColor: '#0ea5e9', padding: 24, paddingTop: 60 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', textAlign: 'right' },
  list: { padding: 16, gap: 12 },
  empty: { padding: 40, alignItems: 'center', gap: 12 },
  emptyIcon: { fontSize: 64 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#374151' },
  consultBtn: { backgroundColor: '#0ea5e9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
  consultBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  rxCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  rxHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  rxId: { fontSize: 14, fontWeight: '700', color: '#374151', fontFamily: 'monospace' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '700' },
  doctorName: { fontSize: 15, fontWeight: '600', color: '#111827', textAlign: 'right' },
  rxDate: { fontSize: 13, color: '#9ca3af', textAlign: 'right' },
  medications: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  medBadge: { backgroundColor: '#f0fdf4', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  medBadgeText: { fontSize: 12, color: '#15803d', fontWeight: '600' },
  useBtn: { backgroundColor: '#0ea5e9', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  useBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
