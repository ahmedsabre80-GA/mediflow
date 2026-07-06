'use client';

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function primaryBg(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},0.07)`;
}
function primaryBorder(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},0.2)`;
}
function primaryLight(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},0.12)`;
}

const FONT_SCALE: Record<string, number> = { sm: 0.85, md: 1, lg: 1.18 };

export function PrescriptionPreview({
  rxProfile, certificates, clinicLogo, patientName, patientAge, patientGender, patientFileNo,
  drugs, date, rxId, diagnosis,
}: {
  rxProfile: {
    name: string; degree: string; specialty: string; address: string; phone: string;
    certNumber: string; social?: string; clinicName?: string;
    themeColor?: string; fontSize?: string;
  };
  certificates: string[];
  clinicLogo?: string;
  patientName: string;
  patientAge: string;
  patientGender?: string;
  patientFileNo?: string;
  drugs: { name: string; dose: string; times: string; duration: string; notes: string }[];
  date: string;
  rxId: string;
  diagnosis?: string;
}) {
  const primary = rxProfile.themeColor || '#2d6b5e';
  const scale = FONT_SCALE[rxProfile.fontSize || 'md'] || 1;
  const f = (px: number) => `${Math.round(px * scale)}px`;

  const initials = (rxProfile.name || 'د').split(' ').map(w => w[0]).slice(0, 2).join('');

  const bg = primaryBg(primary);
  const border = primaryBorder(primary);
  const light = primaryLight(primary);

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-sm border border-gray-200 bg-white"
      style={{ fontFamily: "'Cairo', 'Segoe UI', sans-serif", direction: 'rtl', fontSize: f(13) }}
    >

      {/* ── HEADER ── */}
      <div style={{ backgroundColor: primary, padding: `${f(20)} ${f(24)}` }}>
        <div className="flex items-start justify-between gap-4">

          {/* Doctor info — right side */}
          <div className="flex items-center gap-4">
            <div style={{
              width: f(54), height: f(54), borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.2)',
              border: '2px solid rgba(255,255,255,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ color: '#fff', fontSize: f(20), fontWeight: 700 }}>{initials}</span>
            </div>
            <div>
              <p style={{ color: '#fff', fontSize: f(19), fontWeight: 700, margin: 0 }}>
                {rxProfile.name ? `د. ${rxProfile.name}` : 'اسم الطبيب'}
              </p>
              {rxProfile.degree && (
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: f(12), margin: `${f(2)} 0 0` }}>
                  {rxProfile.degree}
                </p>
              )}
              {rxProfile.specialty && (
                <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: f(12), fontWeight: 600, margin: `${f(2)} 0 0` }}>
                  {rxProfile.specialty}
                </p>
              )}
              {rxProfile.certNumber && (
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: f(11), margin: `${f(3)} 0 0` }}>
                  ترخيص رقم : {rxProfile.certNumber}
                </p>
              )}
              {certificates.filter(c => c.trim()).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: f(4), marginTop: f(5) }}>
                  {certificates.filter(c => c.trim()).map((c, i) => (
                    <span key={i} style={{
                      fontSize: f(10), padding: `${f(2)} ${f(8)}`, borderRadius: f(20),
                      backgroundColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)',
                      border: '1px solid rgba(255,255,255,0.25)',
                    }}>{c}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Clinic logo + name — left side */}
          {(clinicLogo || rxProfile.clinicName) && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, gap: f(6) }}>
              {clinicLogo && (
                <div style={{
                  width: f(64), height: f(64), borderRadius: f(10),
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: f(4), overflow: 'hidden',
                }}>
                  <img src={clinicLogo} alt="clinic logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              )}
              {rxProfile.clinicName && (
                <p style={{ color: '#fff', fontSize: f(13), fontWeight: 700, margin: 0, textAlign: 'right' }}>
                  {rxProfile.clinicName}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Accent strip */}
      <div style={{ height: f(4), background: `linear-gradient(to left, ${light}, ${primary})` }} />

      {/* ── PATIENT INFO BOX ── */}
      <div style={{ backgroundColor: bg, padding: `${f(14)} ${f(24)}` }}>
        <div style={{ border: `1px solid ${border}`, borderRadius: f(10), overflow: 'hidden', backgroundColor: '#fff' }}>
          {/* Row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: `1px dashed ${border}` }}>
            {[
              { label: 'اسم المريض', value: patientName },
              { label: 'التاريخ', value: date },
              { label: 'رقم الملف', value: patientFileNo || '—', mono: true },
            ].map((f2, i) => (
              <div key={i} style={{ padding: `${f(10)} ${f(14)}`, borderLeft: i < 2 ? `1px dashed ${border}` : 'none' }}>
                <p style={{ fontSize: f(10), color: '#999', margin: `0 0 ${f(3)}` }}>{f2.label}</p>
                <p style={{ fontSize: f(13), fontWeight: 600, color: '#222', margin: 0, fontFamily: f2.mono ? 'monospace' : 'inherit' }}>{f2.value || '—'}</p>
              </div>
            ))}
          </div>
          {/* Row 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
            {[
              { label: 'العمر', value: patientAge || '—' },
              { label: 'الجنس', value: patientGender || '—' },
              { label: 'الهاتف', value: '' },
            ].map((f2, i) => (
              <div key={i} style={{ padding: `${f(10)} ${f(14)}`, borderLeft: i < 2 ? `1px dashed ${border}` : 'none' }}>
                <p style={{ fontSize: f(10), color: '#999', margin: `0 0 ${f(3)}` }}>{f2.label}</p>
                <p style={{ fontSize: f(13), fontWeight: 600, color: '#222', margin: 0 }}>{f2.value || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RX AREA ── */}
      <div style={{ backgroundColor: bg, padding: `0 ${f(24)} ${f(16)}` }}>
        <div style={{
          border: `1px solid ${border}`, borderRadius: f(10), backgroundColor: '#fff',
          minHeight: f(220), position: 'relative', overflow: 'hidden', padding: `${f(16)} ${f(18)}`,
        }}>
          {/* Rx watermark */}
          <div style={{
            position: 'absolute', bottom: f(12), left: f(16),
            fontSize: f(64), fontWeight: 900, color: light,
            lineHeight: 1, fontFamily: 'Georgia, serif', userSelect: 'none', pointerEvents: 'none',
          }}>Rx</div>

          {/* Diagnosis */}
          {diagnosis && (
            <div style={{
              backgroundColor: bg, border: `1px solid ${border}`,
              borderRadius: f(6), padding: `${f(6)} ${f(10)}`, marginBottom: f(12),
            }}>
              <p style={{ fontSize: f(10), color: primary, margin: `0 0 ${f(2)}`, fontWeight: 600 }}>التشخيص / الملاحظات</p>
              <p style={{ fontSize: f(12), color: '#555', margin: 0 }}>{diagnosis}</p>
            </div>
          )}

          {/* Drugs */}
          {drugs.filter(d => d.name.trim()).length === 0 ? (
            <p style={{ color: '#ccc', fontSize: f(12), fontStyle: 'italic', margin: 0 }}>لم تتم إضافة أدوية بعد</p>
          ) : drugs.filter(d => d.name.trim()).map((drug, i) => (
            <div key={i} style={{ display: 'flex', gap: f(10), marginBottom: f(14), alignItems: 'flex-start' }}>
              <div style={{
                width: f(22), height: f(22), borderRadius: '50%', backgroundColor: primary, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: f(10), fontWeight: 700, flexShrink: 0, marginTop: f(2),
              }}>{i + 1}</div>
              <div>
                <p style={{ fontSize: f(14), fontWeight: 700, color: '#1a1a1a', margin: 0 }}>{drug.name}</p>
                <div style={{ display: 'flex', gap: f(8), flexWrap: 'wrap', marginTop: f(3) }}>
                  {drug.dose && (
                    <span style={{ fontSize: f(11), color: '#fff', backgroundColor: primary, padding: `${f(1)} ${f(7)}`, borderRadius: f(10) }}>{drug.dose}</span>
                  )}
                  {drug.times && <span style={{ fontSize: f(11), color: '#666' }}>· {drug.times}</span>}
                  {drug.duration && <span style={{ fontSize: f(11), color: '#666' }}>· {drug.duration}</span>}
                </div>
                {drug.notes && <p style={{ fontSize: f(11), color: '#888', margin: `${f(2)} 0 0` }}>{drug.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SIGNATURE ROW ── */}
      <div style={{
        backgroundColor: bg, padding: `${f(6)} ${f(24)} ${f(18)}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: f(12), textAlign: 'center',
      }}>
        <div>
          <p style={{ fontSize: f(11), color: primary, fontWeight: 600, margin: `0 0 ${f(24)}` }}>توقيع الطبيب</p>
          <div style={{ borderTop: `1.5px solid ${border}`, width: '80%', margin: '0 auto' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: f(64), height: f(64), borderRadius: '50%',
            border: `2px dashed ${border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: f(10), color: primary, textAlign: 'center', lineHeight: 1.3, opacity: 0.6 }}>ختم<br/>العيادة</span>
          </div>
        </div>
        <div>
          <p style={{ fontSize: f(11), color: primary, fontWeight: 600, margin: `0 0 ${f(24)}` }}>رقم الوصفة</p>
          <p style={{ fontSize: f(9), color: '#aaa', fontFamily: 'monospace', margin: 0 }}>{rxId}</p>
        </div>
      </div>

      {/* ── BOTTOM CONTACT BAR ── */}
      <div style={{ backgroundColor: primary, padding: `${f(12)} ${f(24)}` }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: f(24), flexWrap: 'wrap' }}>
          {rxProfile.address && (
            <span style={{ display: 'flex', alignItems: 'center', gap: f(5), color: 'rgba(255,255,255,0.85)', fontSize: f(11) }}>
              <svg style={{ width: f(13), height: f(13), flexShrink: 0 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              {rxProfile.address}
            </span>
          )}
          {rxProfile.phone && (
            <span style={{ display: 'flex', alignItems: 'center', gap: f(5), color: 'rgba(255,255,255,0.85)', fontSize: f(11) }} dir="ltr">
              <svg style={{ width: f(13), height: f(13), flexShrink: 0 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
              {rxProfile.phone}
            </span>
          )}
          {rxProfile.social && (
            <span style={{ display: 'flex', alignItems: 'center', gap: f(5), color: 'rgba(255,255,255,0.85)', fontSize: f(11) }}>
              <svg style={{ width: f(13), height: f(13), flexShrink: 0 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
              </svg>
              {rxProfile.social}
            </span>
          )}
        </div>
      </div>

    </div>
  );
}
