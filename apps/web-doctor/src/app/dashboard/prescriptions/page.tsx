'use client';
import { useState, useEffect, useMemo } from 'react';
import { Search, Calendar, FileText, ChevronLeft, ChevronRight, X, Printer, Send, Stethoscope, Palette } from 'lucide-react';
import { PrescriptionPreview } from '@/components/PrescriptionPreview';

const PT_RX_KEY    = 'doctor-patient-rx-history';
const PHARMACY_API = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies';
const NOTIF_API    = 'https://mediflow-production-d815.up.railway.app/api/v1/pharmacies/portal-notifications';

interface RxRecord {
  patientName: string;
  rxId: string;
  date: string;
  rxText: string;
}

interface Pharmacy { id: string; name: string; name_ar: string; owner_id?: string; }

type Range   = 'day' | 'week' | 'month' | 'all';
type RxTab   = 'diagnosis' | 'prescription' | 'printed';

function getRxList(): RxRecord[] {
  try { return JSON.parse(localStorage.getItem(PT_RX_KEY) || '[]'); } catch { return []; }
}
function drToken() { try { return localStorage.getItem('doctor-token') || ''; } catch { return ''; } }
function drName()  { try { return localStorage.getItem('doctor-name')  || 'الطبيب'; } catch { return 'الطبيب'; } }

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseDiagnosis(rxText: string): string {
  const line = rxText.split('\n').find(l => l.startsWith('التشخيص:'));
  return line ? line.replace('التشخيص:', '').trim() : '—';
}

function parseDrugs(rxText: string): { num: string; name: string; detail: string }[] {
  const lines = rxText.split('\n');
  const start = lines.findIndex(l => l === 'الأدوية:');
  if (start === -1) return [];
  return lines.slice(start + 1)
    .filter(l => /^\d+\./.test(l.trim()))
    .map(l => {
      const m = l.match(/^(\d+)\.\s*(.+)/);
      if (!m) return { num: '', name: l, detail: '' };
      const parts = m[2].split(' - ');
      return { num: m[1], name: parts[0].trim(), detail: parts.slice(1).join(' - ').trim() };
    });
}

function parseRevisit(rxText: string): string {
  const line = rxText.split('\n').find(l => l.startsWith('موعد المراجعة:'));
  return line ? line.replace('موعد المراجعة:', '').trim() : '';
}

/* Parse detail string into dose/times/duration/notes — handles both:
   OLD: "50 | 3 | 10 (notes)"
   NEW: "50mg - 3 مرة/يوم - 10 يوم (notes)" */
function parseDetail(detail: string) {
  if (!detail) return { dose: '', times: '', duration: '', notes: '' };

  // Extract notes in parentheses at end
  const notesMatch = detail.match(/\(([^)]+)\)\s*$/);
  const notes = notesMatch ? notesMatch[1] : '';
  const body  = notesMatch ? detail.slice(0, notesMatch.index).trim() : detail.trim();

  // Old format: separated by " | "
  if (body.includes(' | ')) {
    const parts = body.split(' | ');
    return {
      dose:     parts[0]?.trim() || '',
      times:    parts[1]?.trim() || '',
      duration: parts[2]?.trim() || '',
      notes,
    };
  }

  // New format: "50mg - 3 مرة/يوم - 10 يوم"
  const parts = body.split(' - ');
  return {
    dose:     (parts[0] || '').replace('mg', '').trim(),
    times:    (parts[1] || '').replace('مرة/يوم', '').trim(),
    duration: (parts[2] || '').replace('يوم', '').trim(),
    notes,
  };
}

/* Build drug array for PrescriptionPreview from rxText */
function buildDrugsForPreview(rxText: string) {
  return parseDrugs(rxText).map(d => {
    const { dose, times, duration, notes } = parseDetail(d.detail);
    return { name: d.name, dose, times, duration, notes };
  });
}

function startOf(range: Range, offset = 0): { from: Date; to: Date; label: string } {
  const now = new Date();
  if (range === 'day') {
    const d = new Date(now); d.setDate(d.getDate() + offset); d.setHours(0,0,0,0);
    const e = new Date(d); e.setHours(23,59,59,999);
    return { from: d, to: e, label: d.toLocaleDateString('ar-IQ', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) };
  }
  if (range === 'week') {
    const sun = new Date(now); sun.setDate(now.getDate() - now.getDay() + offset * 7); sun.setHours(0,0,0,0);
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6); sat.setHours(23,59,59,999);
    return { from: sun, to: sat, label: `${sun.toLocaleDateString('ar-IQ',{day:'numeric',month:'long'})} — ${sat.toLocaleDateString('ar-IQ',{day:'numeric',month:'long',year:'numeric'})}` };
  }
  if (range === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); e.setHours(23,59,59,999);
    return { from: d, to: e, label: d.toLocaleDateString('ar-IQ', { month:'long', year:'numeric' }) };
  }
  return { from: new Date(0), to: new Date(9999,0), label: 'جميع الوصفات' };
}


function printPreview() {
  const el = document.getElementById('rx-preview-print');
  if (!el) return;
  const html = el.innerHTML;
  const w = window.open('', '_blank', 'width=620,height=760');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
    <style>body{margin:0;padding:12px;font-family:'Cairo','Segoe UI',sans-serif;background:#fff}
    @media print{body{padding:0}@page{size:A5;margin:8mm}}</style>
    </head><body>${html}<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);})<\/script></body></html>`);
  w.document.close();
}

export default function PrescriptionsPage() {
  const [records, setRecords]     = useState<RxRecord[]>([]);
  const [range, setRange]         = useState<Range>('week');
  const [offset, setOffset]       = useState(0);
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<RxRecord | null>(null);
  const [rxTab, setRxTab]         = useState<RxTab>('diagnosis');

  // Resend to pharmacy
  const [pharmacies, setPharmacies]           = useState<Pharmacy[]>([]);
  const [pharmLoading, setPharmLoading]       = useState(false);
  const [pharmSearch, setPharmSearch]         = useState('');
  const [selectedPharmId, setSelectedPharmId] = useState('');
  const [sending, setSending]                 = useState(false);
  const [sendDone, setSendDone]               = useState(false);

  // Dr profile for preview
  const [drProfile, setDrProfile] = useState<any>({});
  const [certificates, setCertificates] = useState<string[]>([]);
  const [clinicLogo, setClinicLogo] = useState('');
  const [doctorImage, setDoctorImage] = useState('');

  // Inline design controls
  const [showDesign, setShowDesign] = useState(false);
  const [localColor, setLocalColor] = useState('#2d6b5e');
  const [localFontSize, setLocalFontSize] = useState('md');

  const loadPharmacies = async () => {
    setPharmLoading(true);
    try {
      const token = drToken();
      const res = await fetch(`${PHARMACY_API}/active`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
      );
      const data = await res.json();
      const list: Pharmacy[] = Array.isArray(data) ? data : (data.data || data.pharmacies || []);
      setPharmacies(list);
    } catch (e) {
      console.error('pharmacy load failed', e);
    }
    setPharmLoading(false);
  };

  useEffect(() => {
    setRecords(getRxList());
    loadPharmacies();
    try {
      const raw = localStorage.getItem('doctor-rx-profile');
      if (raw) {
        const rx = JSON.parse(raw);
        setDrProfile(rx);
        setCertificates(rx.certificates || []);
        setClinicLogo(rx.clinicLogo || '');
        setLocalColor(rx.themeColor || '#2d6b5e');
        setLocalFontSize(rx.fontSize || 'md');
      }
    } catch {}
    const img = localStorage.getItem('doctor-logo-image');
    if (img) setDoctorImage(img);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setOffset(0); }, [range]);

  const { from, to, label } = useMemo(() => startOf(range, offset), [range, offset]);

  const filtered = useMemo(() => records.filter(r => {
    if (search.trim() && !r.patientName.toLowerCase().includes(search.toLowerCase())) return false;
    if (range === 'all') return true;
    const m = r.rxId.match(/(\d{2})-(\d{2})-(\d{4})_(\d{2}):(\d{2}):(\d{2})/);
    if (m) { const d = new Date(+m[3],+m[2]-1,+m[1],+m[4],+m[5],+m[6]); return d >= from && d <= to; }
    return true;
  }), [records, range, offset, search, from, to]);

  const openRecord = (r: RxRecord) => {
    setSelected(r);
    setRxTab('diagnosis');
    setSelectedPharmId('');
    setPharmSearch('');
    setSendDone(false);
    // Reload if empty (e.g. token wasn't ready on mount)
    if (pharmacies.length === 0) loadPharmacies();
  };

  const resend = async () => {
    if (!selected || !selectedPharmId) return;
    setSending(true);
    try {
      const pharm = pharmacies.find(p => p.id === selectedPharmId);
      const recipientId = pharm?.owner_id || selectedPharmId;
      await fetch(NOTIF_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${drToken()}` },
        body: JSON.stringify({
          portalType: 'pharmacy',
          recipientId,
          senderName: `د. ${drName()}`,
          message: `💊 وصفة طبية\nالمريض: ${selected.patientName}\n\n${selected.rxText}[prescription_id:${selected.rxId}][patient_id:][delivery:pickup]`,
        }),
      });
      setSendDone(true);
    } catch {}
    setSending(false);
  };

  const closeModal = () => { setSelected(null); };

  const saveDesign = (color: string, size: string) => {
    try {
      const raw = localStorage.getItem('doctor-rx-profile');
      const base = raw ? JSON.parse(raw) : {};
      localStorage.setItem('doctor-rx-profile', JSON.stringify({ ...base, themeColor: color, fontSize: size }));
    } catch {}
  };

  // Build preview props from rxText — use live design values
  const previewDrProfile = {
    name:       drProfile?.name       || drName(),
    degree:     drProfile?.degree     || '',
    specialty:  drProfile?.specialty  || '',
    address:    drProfile?.address    || '',
    phone:      drProfile?.phone      || '',
    social:     drProfile?.social     || '',
    certNumber: drProfile?.certNumber || '',
    clinicName: drProfile?.clinicName || '',
    themeColor: localColor,
    fontSize:   localFontSize,
  };

  const TABS: { key: RxTab; label: string }[] = [
    { key: 'diagnosis',    label: 'التشخيص' },
    { key: 'prescription', label: 'الوصفة' },
    { key: 'printed',      label: 'الوصفة كما طبعت' },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">سجل الوصفات الطبية</h1>
        <p className="text-sm text-gray-500 mt-1">استعراض الوصفات حسب الفترة أو اسم المريض</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-2 flex-wrap">
          {([{ k:'day',l:'يوم'},{k:'week',l:'أسبوع'},{k:'month',l:'شهر'},{k:'all',l:'الكل'}] as {k:Range;l:string}[]).map(({k,l})=>(
            <button key={k} onClick={()=>setRange(k)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${range===k?'border-teal-500 bg-teal-50 text-teal-700':'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {l}
            </button>
          ))}
        </div>
        {range !== 'all' && (
          <div className="flex items-center gap-2 mr-2">
            <button onClick={()=>setOffset(o=>o-1)} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50"><ChevronRight className="w-4 h-4 text-gray-600"/></button>
            <span className="text-sm font-medium text-gray-700 min-w-48 text-center">{label}</span>
            <button onClick={()=>setOffset(o=>Math.min(o+1,0))} disabled={offset>=0} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-40"><ChevronLeft className="w-4 h-4 text-gray-600"/></button>
          </div>
        )}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث باسم المريض..."
            className="w-full pr-9 pl-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          {search && <button onClick={()=>setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4"/></button>}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">{range!=='all'?label:'جميع الوصفات'}</span>
          <span className="text-xs text-gray-400">{filtered.length} وصفة</span>
        </div>
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3"/>
            <p className="text-gray-400 text-sm">لا توجد وصفات في هذه الفترة</p>
          </div>
        ) : filtered.map((r,i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
            onClick={() => openRecord(r)}>
            <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
              <span className="text-teal-700 font-bold text-sm">{r.patientName?.[0]||'م'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">{r.patientName}</p>
              <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                <Calendar className="w-3 h-3"/><span>{r.date}</span>
              </div>
            </div>
            <FileText className="w-4 h-4 text-gray-300 shrink-0"/>
          </div>
        ))}
      </div>

      {/* DETAIL MODAL — three tabs */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <p className="font-bold text-gray-900">{selected.patientName}</p>
                <p className="text-xs text-gray-400 mt-0.5">{selected.date} · {selected.rxId.split('_')[1] || ''}</p>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5 text-gray-500"/></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setRxTab(t.key)}
                  className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${rxTab===t.key?'border-teal-500 text-teal-600':'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">

              {/* ── TAB: التشخيص ── */}
              {rxTab === 'diagnosis' && (
                <div className="px-5 py-6">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-5">
                    <p className="text-sm font-semibold text-amber-700 flex items-center gap-2 mb-3">
                      <Stethoscope className="w-4 h-4"/> التشخيص
                    </p>
                    <p className="text-base text-gray-800 leading-relaxed">{parseDiagnosis(selected.rxText)}</p>
                  </div>
                  {parseRevisit(selected.rxText) && (
                    <div className="mt-4 bg-teal-50 border border-teal-200 rounded-xl px-5 py-4">
                      <p className="text-xs text-teal-600 font-semibold mb-1">موعد المراجعة</p>
                      <p className="text-sm font-bold text-teal-800">{parseRevisit(selected.rxText)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: الوصفة ── */}
              {rxTab === 'prescription' && (
                <div className="px-5 py-4 space-y-4">
                  {/* Drugs */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">الأدوية</p>
                    {parseDrugs(selected.rxText).length === 0 ? (
                      <p className="text-sm text-gray-400">لا توجد أدوية مسجلة</p>
                    ) : (
                      <div className="space-y-2">
                        {parseDrugs(selected.rxText).map((d, i) => {
                          const pd = parseDetail(d.detail);
                          return (
                            <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3">
                              <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{d.num}</span>
                              <div>
                                <p className="text-sm font-semibold text-gray-800">{d.name}</p>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {pd.dose     && <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">{pd.dose}mg</span>}
                                  {pd.times    && <span className="text-xs text-gray-500">{pd.times} مرة/يوم</span>}
                                  {pd.duration && <span className="text-xs text-gray-500">{pd.duration} يوم</span>}
                                  {pd.notes    && <span className="text-xs text-gray-400">({pd.notes})</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* Diagnosis summary */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-amber-700 font-semibold mb-1">التشخيص</p>
                    <p className="text-sm text-gray-800">{parseDiagnosis(selected.rxText)}</p>
                  </div>
                </div>
              )}

              {/* ── TAB: الوصفة كما طبعت ── */}
              {rxTab === 'printed' && (
                <div className="p-4 space-y-3">

                  {/* Design controls bar */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                    <button onClick={() => setShowDesign(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                      <span className="flex items-center gap-2"><Palette className="w-4 h-4 text-teal-500"/>تخصيص التصميم</span>
                      <span className="text-xs text-gray-400">{showDesign ? '▲' : '▼'}</span>
                    </button>
                    {showDesign && (
                      <div className="px-4 pb-4 space-y-4 border-t border-gray-200 pt-3">
                        {/* Color */}
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium text-gray-600 shrink-0 w-20">لون الثيم</span>
                          <div className="flex items-center gap-2 flex-wrap flex-1">
                            {['#2d6b5e','#0369a1','#7c3aed','#b45309','#be123c','#1f2937','#065f46','#9333ea'].map(c => (
                              <button key={c} onClick={() => { setLocalColor(c); saveDesign(c, localFontSize); }}
                                style={{ backgroundColor: c }}
                                className={`w-7 h-7 rounded-full border-2 transition-all ${localColor === c ? 'border-white ring-2 ring-offset-1 ring-gray-400 scale-110' : 'border-transparent'}`}
                              />
                            ))}
                            <input type="color" value={localColor}
                              onChange={e => { setLocalColor(e.target.value); saveDesign(e.target.value, localFontSize); }}
                              className="w-7 h-7 rounded-full border border-gray-200 cursor-pointer bg-transparent"
                              title="لون مخصص"
                            />
                          </div>
                        </div>
                        {/* Font size */}
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium text-gray-600 shrink-0 w-20">حجم الخط</span>
                          <div className="flex gap-2">
                            {[{k:'sm',l:'صغير'},{k:'md',l:'متوسط'},{k:'lg',l:'كبير'}].map(({k,l}) => (
                              <button key={k} onClick={() => { setLocalFontSize(k); saveDesign(localColor, k); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${localFontSize===k?'border-teal-500 bg-teal-50 text-teal-700':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                {l}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div id="rx-preview-print">
                    <PrescriptionPreview
                      rxProfile={previewDrProfile}
                      certificates={certificates}
                      clinicLogo={clinicLogo}
                      doctorImage={doctorImage}
                      patientName={selected.patientName}
                      patientAge=""
                      drugs={buildDrugsForPreview(selected.rxText)}
                      date={selected.date}
                      rxId={selected.rxId}
                      diagnosis={parseDiagnosis(selected.rxText)}
                    />
                  </div>
                  {parseRevisit(selected.rxText) && (
                    <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-sm text-teal-800">
                      <span className="font-semibold">موعد المراجعة: </span>{parseRevisit(selected.rxText)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions — only on الوصفة كما طبعت */}
            {rxTab === 'printed' && (
              <div className="px-5 py-4 border-t space-y-3">
                {/* Pharmacy resend */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500">إرسال لصيدلية</p>
                    <button onClick={loadPharmacies} disabled={pharmLoading}
                      className="text-xs text-teal-600 hover:text-teal-800 disabled:opacity-50">
                      {pharmLoading ? 'جاري التحميل...' : '↻ تحديث'}
                    </button>
                  </div>
                  {sendDone ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-700 font-medium text-center">✅ تم الإرسال بنجاح</div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute right-3 top-2.5 w-3.5 h-3.5 text-gray-400"/>
                        <input value={pharmSearch} onChange={e=>setPharmSearch(e.target.value)} placeholder="ابحث عن صيدلية..."
                          className="w-full pr-8 pl-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
                      </div>
                      <div className="max-h-28 overflow-y-auto border border-gray-200 rounded-xl">
                        {pharmLoading ? (
                          <p className="text-xs text-gray-400 text-center py-3">جاري التحميل...</p>
                        ) : pharmacies.filter(p => {
                            const n = (p.name_ar||p.name||'').toLowerCase();
                            return !pharmSearch.trim() || n.includes(pharmSearch.toLowerCase());
                          }).length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-3">لا توجد صيدليات</p>
                        ) : pharmacies.filter(p => {
                            const n = (p.name_ar||p.name||'').toLowerCase();
                            return !pharmSearch.trim() || n.includes(pharmSearch.toLowerCase());
                          }).map(p => (
                          <button key={p.id} onClick={() => setSelectedPharmId(p.id)}
                            className={`w-full text-right px-3 py-2 text-sm transition-colors border-b last:border-0 ${selectedPharmId===p.id?'bg-teal-50 text-teal-700 font-semibold':'hover:bg-gray-50 text-gray-700'}`}>
                            {p.name_ar||p.name}
                            {selectedPharmId===p.id && <span className="float-left text-teal-500">✓</span>}
                          </button>
                        ))}
                      </div>
                      <button onClick={resend} disabled={!selectedPharmId||sending}
                        className="w-full flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
                        {sending?<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>جاري الإرسال...</>:<><Send className="w-4 h-4"/>إرسال للصيدلية</>}
                      </button>
                    </>
                  )}
                </div>
                {/* Print + close */}
                <div className="flex gap-3">
                  <button onClick={printPreview}
                    className="flex items-center justify-center gap-2 flex-1 bg-teal-500 hover:bg-teal-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
                    <Printer className="w-4 h-4"/> طباعة
                  </button>
                  <button onClick={closeModal}
                    className="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                    إغلاق
                  </button>
                </div>
              </div>
            )}
            {rxTab !== 'printed' && (
              <div className="px-5 py-4 border-t">
                <button onClick={closeModal}
                  className="w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                  إغلاق
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
