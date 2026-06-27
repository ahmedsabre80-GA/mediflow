import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

export default function DriverLoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!identifier || !password) { Alert.alert('خطأ', 'أدخل البريد الإلكتروني وكلمة المرور'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${AUTH_API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.title || 'فشل تسجيل الدخول');
      if (data.data.role !== 'driver') throw new Error('هذا الحساب ليس حساب سائق');
      await SecureStore.setItemAsync('driver_token', data.data.accessToken);
      await SecureStore.setItemAsync('driver_id', data.data.userId);
      router.replace('/dashboard');
    } catch (err: any) {
      Alert.alert('خطأ', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.emoji}>🚗</Text>
        <Text style={styles.title}>بوابة السائقين</Text>
        <Text style={styles.subtitle}>ميديفلو — منصة التوصيل</Text>
      </View>
      <View style={styles.form}>
        <TextInput style={styles.input} value={identifier} onChangeText={setIdentifier}
          placeholder="البريد الإلكتروني" keyboardType="email-address" autoCapitalize="none" textAlign="right" />
        <TextInput style={styles.input} value={password} onChangeText={setPassword}
          placeholder="كلمة المرور" secureTextEntry textAlign="right" />
        <TouchableOpacity style={[styles.loginBtn, loading && styles.btnDisabled]} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>تسجيل الدخول</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdf4' },
  header: { backgroundColor: '#10b981', paddingTop: 80, paddingBottom: 40, alignItems: 'center', gap: 8 },
  emoji: { fontSize: 60 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.8)' },
  form: { padding: 24, gap: 16, marginTop: 24 },
  input: { backgroundColor: '#fff', borderRadius: 14, padding: 16, fontSize: 15, borderWidth: 1.5, borderColor: '#e5e7eb' },
  loginBtn: { backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.7 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
