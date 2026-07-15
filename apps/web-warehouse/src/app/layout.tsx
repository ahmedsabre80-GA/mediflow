import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};
import './globals.css';
export const metadata: Metadata = { title: 'MediFlow — Warehouse Portal', description: 'MediFlow Warehouse Management' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ar" dir="rtl"><body className="bg-gray-50 antialiased">{children}</body></html>;
}
