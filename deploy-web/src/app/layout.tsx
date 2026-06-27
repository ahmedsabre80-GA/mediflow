import type { Metadata } from 'next';
import { Inter, Noto_Sans_Arabic } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const arabic = Noto_Sans_Arabic({ subsets: ['arabic'], variable: '--font-arabic' });

export const metadata: Metadata = {
  title: 'MediFlow — Your Digital Pharmacy',
  description: 'Find medications, compare prices, and get them delivered.',
  manifest: '/manifest.json',
  themeColor: '#0ea5e9',
  openGraph: {
    title: 'MediFlow',
    description: 'Your Digital Pharmacy',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${inter.variable} ${arabic.variable} font-arabic antialiased bg-gray-50`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
