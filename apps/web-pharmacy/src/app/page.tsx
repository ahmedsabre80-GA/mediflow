import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-teal-50" dir="rtl">
      <div className="text-center max-w-md px-4">
        <div className="w-16 h-16 bg-sky-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-white text-3xl">🏥</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">لوحة تحكم الصيدلية</h1>
        <p className="text-gray-600 mb-8">أدر صيدليتك بكفاءة عالية</p>
        <div className="space-y-3">
          <Link href="/auth/login" className="block w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors">
            تسجيل الدخول
          </Link>
          <Link href="/auth/register" className="block w-full border-2 border-sky-500 text-sky-600 font-semibold py-3 px-6 rounded-xl hover:bg-sky-50 transition-colors">
            تسجيل صيدلية جديدة
          </Link>
        </div>
      </div>
    </div>
  );
}
