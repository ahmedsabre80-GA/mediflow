import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

const AUTH_API = 'https://mediflowauth-service-production.up.railway.app/api/v1';

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!identifier || !password) {
      Alert.alert('خطأ', 'يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${AUTH_API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.title || 'فشل تسجيل الدخول');

      await SecureStore.setItemAsync('access_token', data.data.accessToken);
      await SecureStore.setItemAsync('refresh_token', data.data.refreshToken);
      await SecureStore.setItemAsync('user_id', data.data.userId);
      await SecureStore.setItemAsync('user_role', data.data.role);

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
        <Text style={styles.title}>مرحباً بعودتك 👋</Text>
        <Text style={styles.subtitle}>سجّل دخولك للمتابعة</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>البريد الإلكتروني أو رقم الهاتف</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="example@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            textAlign="left"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>كلمة المرور</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              textAlign="left"
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.forgotBtn}>
          <Text style={styles.forgotText}>نسيت كلمة المرور؟</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
          onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>تسجيل الدخول</Text>}
        </TouchableOpacity>

        <View style={styles.registerRow}>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.registerLink}>سجّل الآن مجاناً</Text>
          </TouchableOpacity>
          <Text style={styles.registerText}>ليس لديك حساب؟ </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f9ff' },
  content: { flexGrow: 1, padding: 24 },
  header: { paddingTop: 60, paddingBottom: 40, alignItems: 'flex-end' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111827', textAlign: 'right', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#6b7280', textAlign: 'right' },
  form: { backgroundColor: '#fff', borderRadius: 24, padding: 24, gap: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  inputGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', textAlign: 'right' },
  input: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 14, padding: 14, fontSize: 15, backgroundColor: '#f9fafb' },
  passwordContainer: { position: 'relative' },
  passwordInput: { paddingLeft: 48 },
  eyeBtn: { position: 'absolute', left: 12, top: 12 },
  eyeIcon: { fontSize: 20 },
  forgotBtn: { alignItems: 'flex-start' },
  forgotText: { color: '#0ea5e9', fontSize: 14, fontWeight: '500' },
  loginBtn: { backgroundColor: '#0ea5e9', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 8 },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  registerRow: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  registerText: { color: '#6b7280', fontSize: 14 },
  registerLink: { color: '#0ea5e9', fontSize: 14, fontWeight: '700' },
});
