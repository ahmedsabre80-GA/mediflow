import { useEffect } from 'react';
import { router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export default function Index() {
  useEffect(() => {
    SecureStore.getItemAsync('driver_token').then(token => {
      if (token) router.replace('/dashboard');
      else router.replace('/login');
    });
  }, []);
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#10b981' }}><ActivityIndicator size="large" color="#fff" /></View>;
}
