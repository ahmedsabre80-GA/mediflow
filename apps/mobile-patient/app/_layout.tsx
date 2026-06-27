import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nManager } from 'react-native';

// Force RTL for Arabic
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60000, retry: 1 } },
});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" backgroundColor="#0ea5e9" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="order/[id]" options={{ headerShown: true, title: 'تفاصيل الطلب', headerTintColor: '#0ea5e9' }} />
        <Stack.Screen name="pharmacy/[id]" options={{ headerShown: true, title: 'الصيدلية', headerTintColor: '#0ea5e9' }} />
        <Stack.Screen name="medication/request" options={{ headerShown: true, title: 'طلب دواء', headerTintColor: '#0ea5e9' }} />
        <Stack.Screen name="doctors/[id]" options={{ headerShown: true, title: 'الطبيب', headerTintColor: '#0ea5e9' }} />
      </Stack>
    </QueryClientProvider>
  );
}
