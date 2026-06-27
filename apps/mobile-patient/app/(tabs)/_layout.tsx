import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#0ea5e9',
      tabBarInactiveTintColor: '#9ca3af',
      tabBarStyle: { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingBottom: 8, paddingTop: 8, height: 70 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    }}>
      <Tabs.Screen name="home" options={{
        title: 'الرئيسية',
        tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🏠</Text>,
      }} />
      <Tabs.Screen name="search" options={{
        title: 'البحث',
        tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🔍</Text>,
      }} />
      <Tabs.Screen name="orders" options={{
        title: 'طلباتي',
        tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📦</Text>,
      }} />
      <Tabs.Screen name="prescriptions" options={{
        title: 'وصفاتي',
        tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📋</Text>,
      }} />
      <Tabs.Screen name="profile" options={{
        title: 'حسابي',
        tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>👤</Text>,
      }} />
    </Tabs>
  );
}
