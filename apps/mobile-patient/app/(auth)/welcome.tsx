import { View, Text, TouchableOpacity, Image, StyleSheet, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const { width, height } = Dimensions.get('window');

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Background gradient */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoIcon}>💊</Text>
        </View>
        <Text style={styles.appName}>ميديفلو</Text>
        <Text style={styles.tagline}>دواؤك في متناول يدك</Text>
      </View>

      {/* Features */}
      <View style={styles.features}>
        {[
          { icon: '🔍', title: 'ابحث عن دواء', desc: 'قارن الأسعار من آلاف الصيدليات' },
          { icon: '🚀', title: 'توصيل سريع', desc: 'استلم دواءك في أقل من 30 دقيقة' },
          { icon: '👨‍⚕️', title: 'استشر طبيب', desc: 'استشارة طبية فورية عبر الفيديو' },
        ].map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{f.icon}</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Buttons */}
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/(auth)/register')}>
          <Text style={styles.primaryBtnText}>إنشاء حساب مجاناً</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.secondaryBtnText}>تسجيل الدخول</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { backgroundColor: '#0ea5e9', paddingTop: 80, paddingBottom: 40, alignItems: 'center' },
  logoContainer: { width: 80, height: 80, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoIcon: { fontSize: 40 },
  appName: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  tagline: { fontSize: 16, color: 'rgba(255,255,255,0.85)' },
  features: { flex: 1, paddingHorizontal: 24, paddingTop: 32, gap: 20 },
  featureRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16 },
  featureIcon: { fontSize: 32, width: 50, textAlign: 'center' },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'right', marginBottom: 4 },
  featureDesc: { fontSize: 14, color: '#6b7280', textAlign: 'right' },
  buttons: { paddingHorizontal: 24, paddingBottom: 48, gap: 12 },
  primaryBtn: { backgroundColor: '#0ea5e9', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { borderWidth: 2, borderColor: '#0ea5e9', paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  secondaryBtnText: { color: '#0ea5e9', fontSize: 16, fontWeight: '600' },
});
