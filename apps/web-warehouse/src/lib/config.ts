// ─── WAREHOUSE PORTAL CONFIGURATION ──────────────────────────────────────────
// Managers can change these settings from Settings → Branding page
// These are the defaults — overridden by database settings per warehouse

export interface WarehouseConfig {
  name: string;
  nameEn: string;
  primaryColor: string;
  secondaryColor: string;
  logoEmoji: string;
  tagline: string;
  currency: string;
  country: string;
}

export const DEFAULT_CONFIG: WarehouseConfig = {
  name: 'بوابة المذاخر',
  nameEn: 'Warehouse Portal',
  primaryColor: '#f59e0b',  // amber — change to any hex color
  secondaryColor: '#d97706',
  logoEmoji: '🏭',
  tagline: 'ميديفلو — إدارة التوزيع',
  currency: 'IQD',
  country: 'IQ',
};

// Load config from localStorage (set by manager in Settings → Branding)
export function loadConfig(): WarehouseConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const stored = localStorage.getItem('warehouse-config');
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return DEFAULT_CONFIG;
}

export function saveConfig(config: Partial<WarehouseConfig>) {
  const current = loadConfig();
  localStorage.setItem('warehouse-config', JSON.stringify({ ...current, ...config }));
}
