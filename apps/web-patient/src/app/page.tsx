import Link from 'next/link';
import { Search, MapPin, Pill, Clock, Shield } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 to-teal-50" dir="rtl">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-sky-700">ميديفلو</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <Link href="/pharmacies" className="hover:text-sky-600 transition-colors">الصيدليات</Link>
            <Link href="/doctors" className="hover:text-sky-600 transition-colors">الأطباء</Link>
            <Link href="/about" className="hover:text-sky-600 transition-colors">عن المنصة</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-sky-600">
              تسجيل الدخول
            </Link>
            <Link href="/register" className="bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              إنشاء حساب
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            دواؤك في متناول يدك
            <span className="text-sky-500 block mt-2">في دقائق</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10">
            ابحث عن دواءك، قارن الأسعار، واحصل عليه من أقرب صيدلية مع توصيل سريع إلى باب بيتك
          </p>

          {/* Search Bar */}
          <form action="/search" method="GET" className="bg-white rounded-2xl shadow-lg p-3 flex items-center gap-3 max-w-2xl mx-auto mb-4">
            <div className="flex-1 flex items-center gap-2 px-3">
              <Search className="w-5 h-5 text-gray-400 shrink-0" />
              <input
                name="q"
                type="text"
                placeholder="ابحث عن دواء أو مستحضر..."
                className="w-full text-base outline-none placeholder:text-gray-400 text-right"
                dir="rtl"
              />
            </div>
            <div className="flex items-center gap-2 px-3 border-r border-gray-200">
              <MapPin className="w-5 h-5 text-sky-500 shrink-0" />
              <span className="text-sm text-gray-500 whitespace-nowrap">موقعي الحالي</span>
            </div>
            <button type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-medium px-6 py-3 rounded-xl transition-colors whitespace-nowrap">
              بحث
            </button>
          </form>

        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          لماذا ميديفلو؟
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              icon: <Search className="w-8 h-8 text-sky-500" />,
              title: 'بحث ذكي',
              desc: 'ابحث عن أي دواء واحصل على قائمة بالصيدليات المتوفرة بالقرب منك مع مقارنة الأسعار فوراً',
            },
            {
              icon: <Clock className="w-8 h-8 text-teal-500" />,
              title: 'توصيل سريع',
              desc: 'تتبع طلبك مباشرة على الخريطة ومعرفة وقت الوصول بدقة. توصيل في أقل من ٣٠ دقيقة',
            },
            {
              icon: <Shield className="w-8 h-8 text-indigo-500" />,
              title: 'آمن وموثوق',
              desc: 'جميع الصيدليات مرخصة ومعتمدة. وصفاتك الطبية محفوظة بأعلى معايير الأمان',
            },
          ].map((f) => (
            <div key={f.title} className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow text-center">
              <div className="w-16 h-16 rounded-2xl bg-sky-50 flex items-center justify-center mx-auto mb-4">
                {f.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{f.title}</h3>
              <p className="text-gray-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-sky-500 to-teal-500 py-16">
        <div className="max-w-3xl mx-auto text-center px-4">
          <h2 className="text-3xl font-bold text-white mb-4">ابدأ الآن</h2>
          <p className="text-sky-100 mb-8 text-lg">سجّل حسابك وابحث عن دوائك بسهولة</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="bg-white text-sky-600 font-bold px-8 py-4 rounded-xl hover:bg-sky-50 transition-colors">
              سجل كمريض
            </Link>
            <Link href="/login" className="border-2 border-white text-white font-bold px-8 py-4 rounded-xl hover:bg-sky-600 transition-colors">
              تسجيل الدخول
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h4 className="text-white font-semibold mb-4">للمرضى</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/search" className="hover:text-white">البحث عن دواء</Link></li>
                <li><Link href="/orders" className="hover:text-white">طلباتي</Link></li>
                <li><Link href="/doctors" className="hover:text-white">استشر طبيب</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">الحساب</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/login" className="hover:text-white">تسجيل الدخول</Link></li>
                <li><Link href="/register" className="hover:text-white">إنشاء حساب</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>© {new Date().getFullYear()} MediFlow. جميع الحقوق محفوظة.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
