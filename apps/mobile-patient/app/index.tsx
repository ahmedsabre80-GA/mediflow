import { useEffect } from 'react';
import { router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export default function Index() {
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token');
      if (token) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/(auth)/welcome');
      }
    } catch {
      router.replace('/(auth)/welcome');
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0ea5e9' }}>
      <ActivityIndicator size="large" color="#ffffff" />
    </View>
  );
}
