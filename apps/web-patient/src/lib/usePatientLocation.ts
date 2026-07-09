'use client';
import { useState, useEffect, useCallback } from 'react';

const LAT_KEY = 'patient-saved-lat';
const LNG_KEY = 'patient-saved-lng';

export const DEFAULT_LAT = 33.3152;
export const DEFAULT_LNG = 44.3661;

export function usePatientLocation() {
  const [lat, setLat] = useState<number>(DEFAULT_LAT);
  const [lng, setLng] = useState<number>(DEFAULT_LNG);
  const [gpsReady, setGpsReady] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Load cached location on mount
  useEffect(() => {
    const cachedLat = localStorage.getItem(LAT_KEY);
    const cachedLng = localStorage.getItem(LNG_KEY);
    if (cachedLat && cachedLng) {
      setLat(Number(cachedLat));
      setLng(Number(cachedLng));
      setGpsReady(true);
    } else {
      // Try silently on first load
      navigator.geolocation?.getCurrentPosition(
        pos => {
          const { latitude, longitude } = pos.coords;
          setLat(latitude); setLng(longitude); setGpsReady(true);
          localStorage.setItem(LAT_KEY, String(latitude));
          localStorage.setItem(LNG_KEY, String(longitude));
        },
        () => {} // silent fail — user can click button manually
      );
    }
  }, []);

  const requestGPS = useCallback(() => {
    setGpsLoading(true);
    navigator.geolocation?.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude); setLng(longitude); setGpsReady(true); setGpsLoading(false);
        localStorage.setItem(LAT_KEY, String(latitude));
        localStorage.setItem(LNG_KEY, String(longitude));
      },
      () => {
        setGpsLoading(false);
        alert('تعذر الحصول على موقعك. تأكد من منح الإذن من إعدادات المتصفح.');
      }
    );
  }, []);

  return { lat, lng, gpsReady, gpsLoading, requestGPS };
}
