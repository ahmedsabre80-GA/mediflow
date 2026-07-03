'use client';
import { useEffect, useRef } from 'react';

// Module-level WeakSet persists across React StrictMode unmount/remount cycles
const initializedContainers = new WeakSet<HTMLElement>();

interface Props {
  lat: number;
  lng: number;
  onLocationSelect?: (lat: number, lng: number) => void;
  readonly?: boolean;
  height?: string;
}

export default function LocationMap({ lat, lng, onLocationSelect, readonly = false, height = '280px' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const markerRef    = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (initializedContainers.has(containerRef.current)) return;
    initializedContainers.add(containerRef.current);

    // Dynamically import leaflet (client-side only)
    import('leaflet').then(L => {
      // Fix default marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current!).setView([lat, lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([lat, lng], { draggable: !readonly }).addTo(map);
      markerRef.current = marker;
      mapRef.current    = map;

      if (!readonly) {
        marker.on('dragend', () => {
          const { lat: la, lng: lo } = marker.getLatLng();
          onLocationSelect?.(la, lo);
        });
        map.on('click', (e: any) => {
          marker.setLatLng(e.latlng);
          onLocationSelect?.(e.latlng.lat, e.latlng.lng);
        });
      }
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update marker when lat/lng props change externally
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], mapRef.current.getZoom());
  }, [lat, lng]);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={containerRef} style={{ height, width: '100%', borderRadius: '12px', overflow: 'hidden', zIndex: 0 }} />
    </>
  );
}
