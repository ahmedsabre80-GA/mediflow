import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

export default function ProfileScreen() {
  const [userId, setUserId] = useState('');

  useEffect(() => {
    SecureStore.getItemAsync('user_id').then(id => setUserId(id || ''));
  }, []);

  const handleLogout = async () => {
    Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تسجيل الخروج',
        style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('access_token');
          await SecureStore.deleteItemAsync('refresh_token');
          await SecureStore.deleteItemAsync('user_id');
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  };

  const menuItems = [
    { icon: '👤', label: 'معلوماتي الشخصية', onPress: () => {} },
    { icon: '📍', label: 'عناويني', onPress: () => {} },
    { icon: '👨‍👩‍👧‍👦', label: 'أفراد العائلة', onPress: () => {} },
    { icon: '❤️', label: 'ملفي الصحي', onPress: () => {} },
    { icon: '⭐', label: 'نقاط المكافآت', onPress: () => {} },
    { icon: '🎁', label: 'كود الإحالة', onPress: () => {} },
    { icon: '🔔', label: 'الإشعارات', onPress: () => {} },
    { icon: '🔒', label: 'الأمان والخصوصية', onPress: () => {} },
    { icon: '❓', label: 'المساعدة والدعم', onPress: () => {} },
  ];

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>👤</Text>
        </View>
        <Text style={styles.userName}>مستخدم ميديفلو</Text>
        <Text style={styles.userId}>ID: {userId?.slice(0, 8)}</Text>
        <TouchableOpacity style={styles.editBtn}>
          <Text style={styles.editBtnText}>تعديل الملف الشخصي</Text>
        </TouchableOpacity>
      </View>

      {/* Loyalty Card */}
      <View style={styles.loyaltyCard}>
        <View>
          <Text style={styles.loyaltyLabel}>نقاط المكافآت</Text>
          <Text style={styles.loyaltyPoints}>0 نقطة</Text>
        </View>
        <Text style={{ fontSize: 36 }}>⭐</Text>
      </View>

      {/* Menu */}
      <View style={styles.menu}>
        {menuItems.map((item, i) => (
          <TouchableOpacity key={i} style={[styles.menuItem, i < menuItems.length - 1 && styles.menuItemBorder]}
            onPress={item.onPress}>
            <Text style={styles.menuArrow}>›</Text>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Text style={styles.menuIcon}>{item.icon}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>🚪 تسجيل الخروج</Text>
      </TouchableOpacity>

      <Text style={styles.version}>ميديفلو v1.0.0</Text>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f9ff' },
  header: { backgroundColor: '#0ea5e9', paddingTop: 60, paddingBottom: 30, alignItems: 'center', gap: 8 },
  avatar: { width: 80, height: 80, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 40 },
  userName: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  userId: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  editBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, marginTop: 4 },
  editBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  loyaltyCard: { margin: 16, backgroundColor: '#6366f1', borderRadius: 16, padding: 20, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  loyaltyLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'right' },
  loyaltyPoints: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'right' },
  menu: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  menuItem: { flexDirection: 'row-reverse', alignItems: 'center', padding: 16, gap: 12 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  menuIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  menuLabel: { flex: 1, fontSize: 15, color: '#374151', textAlign: 'right', fontWeight: '500' },
  menuArrow: { fontSize: 20, color: '#d1d5db' },
  logoutBtn: { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#fca5a5' },
  logoutText: { color: '#dc2626', fontSize: 15, fontWeight: '700' },
  version: { textAlign: 'center', color: '#9ca3af', fontSize: 13, marginBottom: 8 },
});
