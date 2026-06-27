import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MediFlow Admin',
  description: 'MediFlow Platform Administration',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-gray-100 antialiased">{children}</body>
    </html>
  );
}
