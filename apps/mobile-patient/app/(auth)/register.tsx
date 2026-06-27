import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

export default function RegisterScreen() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const [loading, setLoading] = useState(false);

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleRegister = async () => {
    if (!form.firstName || !form.email || !form.password) {
      Alert.alert('خطأ', 'يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    if (form.password.length < 8) {
      Alert.alert('خطأ', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${AUTH_API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: 'patient' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.title || 'فشل إنشاء الحساب');

      await SecureStore.setItemAsync('access_token', data.data.accessToken);
      await SecureStore.setItemAsync('refresh_token', data.data.refreshToken);
      await SecureStore.setItemAsync('user_id', data.data.userId);
      await SecureStore.setItemAsync('user_role', 'patient');

      router.replace('/(tabs)/home');
    } catch (err: any) {
      Alert.alert('خطأ', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>إنشاء حساب جديد</Text>
        <Text style={styles.subtitle}>انضم لمنصة ميديفلو مجاناً</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>الاسم الأول *</Text>
            <TextInput style={styles.input} value={form.firstName} onChangeText={v => update('firstName', v)}
              placeholder="أحمد" textAlign="right" />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>الاسم الأخير *</Text>
            <TextInput style={styles.input} value={form.lastName} onChangeText={v => update('lastName', v)}
              placeholder="محمد" textAlign="right" />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>البريد الإلكتروني *</Text>
          <TextInput style={styles.input} value={form.email} onChangeText={v => update('email', v)}
            placeholder="example@email.com" keyboardType="email-address" autoCapitalize="none" textAlign="left" />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>رقم الهاتف</Text>
          <TextInput style={styles.input} value={form.phone} onChangeText={v => update('phone', v)}
            placeholder="+9647801234567" keyboardType="phone-pad" textAlign="left" />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>كلمة المرور *</Text>
          <TextInput style={styles.input} value={form.password} onChangeText={v => update('password', v)}
            placeholder="8 أحرف على الأقل" secureTextEntry textAlign="left" />
        </View>

        <TouchableOpacity style={[styles.registerBtn, loading && styles.btnDisabled]}
          onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.registerBtnText}>إنشاء الحساب</Text>}
        </TouchableOpacity>

        <View style={styles.loginRow}>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.loginLink}>تسجيل الدخول</Text>
          </TouchableOpacity>
          <Text style={styles.loginText}>لديك حساب؟ </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f9ff' },
  content: { flexGrow: 1, padding: 24 },
  header: { paddingTop: 60, paddingBottom: 32, alignItems: 'flex-end' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#111827', textAlign: 'right', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'right' },
  form: { backgroundColor: '#fff', borderRadius: 24, padding: 20, gap: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  row: { flexDirection: 'row-reverse', gap: 12 },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', textAlign: 'right' },
  input: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, padding: 13, fontSize: 14, backgroundColor: '#f9fafb' },
  registerBtn: { backgroundColor: '#0ea5e9', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 6 },
  btnDisabled: { opacity: 0.7 },
  registerBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginRow: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center' },
  loginText: { color: '#6b7280', fontSize: 14 },
  loginLink: { color: '#0ea5e9', fontSize: 14, fontWeight: '700' },
});
