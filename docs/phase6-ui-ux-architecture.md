# PHASE 6 — UI/UX ARCHITECTURE & WIREFRAME SPECIFICATIONS

## Design System

### Color Palette
```
Primary:    #0EA5E9  (Sky Blue)    — Main CTA, links, active states
Secondary:  #14B8A6  (Teal)       — Secondary actions, success
Accent:     #6366F1  (Indigo)     — Highlights, badges
Warning:    #F59E0B  (Amber)      — Alerts, warnings
Danger:     #EF4444  (Red)        — Errors, destructive actions
Success:    #10B981  (Green)      — Confirmations, completed states
Gray-900:   #111827              — Primary text
Gray-600:   #4B5563              — Secondary text
Gray-100:   #F3F4F6              — Backgrounds
White:      #FFFFFF              — Cards, inputs
```

### Typography
```
Arabic (RTL): Noto Sans Arabic — body, headings
English (LTR): Inter — technical content, numbers

Scale:
  xs:   12px / line-height 1.5
  sm:   14px / line-height 1.5
  base: 16px / line-height 1.6
  lg:   18px / line-height 1.5
  xl:   20px / line-height 1.4
  2xl:  24px / line-height 1.3
  3xl:  30px / line-height 1.2
  4xl:  36px / line-height 1.1
```

### Spacing System: 4px base grid (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96)

### Border Radius: sm=6px, md=10px, lg=14px, xl=18px, 2xl=24px, full=9999px

### Shadows:
  sm: 0 1px 2px rgba(0,0,0,0.05)
  md: 0 4px 6px rgba(0,0,0,0.07)
  lg: 0 10px 15px rgba(0,0,0,0.1)
  xl: 0 20px 25px rgba(0,0,0,0.12)

---

## PATIENT WEB APP — SCREEN INVENTORY

### 1. Landing Page (/)
```
LAYOUT: Single-column marketing page

ABOVE THE FOLD:
┌─────────────────────────────────────────────────────┐
│ NAVBAR: Logo | Links | Login | Register              │
├─────────────────────────────────────────────────────┤
│                  HERO SECTION                        │
│  H1: دواؤك في متناول يدك                           │
│  Sub: ابحث، قارن، واحصل على دواءك...               │
│                                                     │
│  ┌─ SEARCH BAR ─────────────────────────────────┐  │
│  │ 🔍 ابحث عن دواء...  | 📍 موقعي | [بحث]      │  │
│  └──────────────────────────────────────────────┘  │
│  أو ارفع وصفتك الطبية                             │
└─────────────────────────────────────────────────────┘

BELOW FOLD:
- Stats bar (pharmacies, users, delivery time)
- Feature cards (3 columns)
- How it works (numbered steps)
- Testimonials carousel
- CTA section
- Footer (4 columns)
```

### 2. Search Results (/search?q=...)
```
LAYOUT: Header + Left Sidebar + Main Content Grid

┌──────────────────────────────────────────────────────┐
│ STICKY HEADER: Search bar + Sort tabs                │
├──────────────┬───────────────────────────────────────┤
│  FILTERS     │  RESULTS GRID                         │
│  ─────────── │                                       │
│  • Category  │  [Drug Card] [Drug Card] [Drug Card]  │
│  • Distance  │  [Drug Card] [Drug Card] [Drug Card]  │
│  • Price     │                                       │
│  • Rating    │  NEARBY PHARMACIES                    │
│  • In Stock  │  [Pharmacy Row]                       │
│  • Open Now  │  [Pharmacy Row]                       │
│              │  [Pharmacy Row]                       │
└──────────────┴───────────────────────────────────────┘

DRUG CARD (160×200px):
  - Product image placeholder
  - Generic name (bold)
  - Brand name (gray)
  - Lowest price badge
  - "Requires Rx" badge (if applicable)
  - [Order Now] button

PHARMACY ROW:
  - Pharmacy photo (80×80)
  - Name + rating stars
  - Distance | Open status | Delivery fee
  - Available items count
  - [View] button
```

### 3. Medication Request Flow (/request)
```
STEP 1 — Medication Selection:
┌─────────────────────────────────┐
│  Request Medication             │
│  ─────────────────────────────  │
│  Search: [paracetamol________]  │
│                                 │
│  ✓ Paracetamol 500mg × [2  +-] │
│  + Add another medication       │
│                                 │
│  Prescription: [Upload file]    │
│  🚨 Emergency request [toggle]  │
│                                 │
│  📍 Your location: Baghdad      │
│  [Change location]              │
│                                 │
│  [Send Request →]               │
└─────────────────────────────────┘

STEP 2 — Waiting for Offers:
┌─────────────────────────────────┐
│  🔍 Searching nearby...         │
│                                 │
│  [Animated pulse on map]        │
│                                 │
│  Checked 3 pharmacies           │
│  ● Al-Amin Pharmacy — Offer!    │
│  ○ Checking Al-Noor...          │
│                                 │
│  OFFERS RECEIVED (1):           │
│  ┌─────────────────────────┐    │
│  │ Al-Amin Pharmacy  ⭐4.8  │    │
│  │ 📍 1.2 km  •  30 min    │    │
│  │ 15,000 IQD + 2,000 del  │    │
│  │ [Select this offer]     │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘

STEP 3 — Payment:
  - Order summary
  - Address selector
  - Payment method selector (card / cash / wallet)
  - Loyalty points toggle
  - [Confirm & Pay] button
```

### 4. Order Tracking (/orders/:id)
```
┌─────────────────────────────────────────────────────┐
│ Order #ABC12345          Status: IN TRANSIT         │
│                                                     │
│ ┌─── LIVE MAP ──────────────────────────────────┐  │
│ │  [Dark map with driver icon moving]            │  │
│ │  ETA: 7 minutes                                │  │
│ └────────────────────────────────────────────────┘  │
│                                                     │
│ PROGRESS TIMELINE:                                  │
│  ✅ Confirmed      11:30 AM                        │
│  ✅ Preparing      11:35 AM                        │
│  ✅ Picked up      11:45 AM                        │
│  🔵 In Transit     (current)                       │
│  ○  Delivered                                      │
│                                                     │
│ DELIVERY TO: بغداد، الكرادة، شارع المتنبي ١٢٣    │
│                                                     │
│ ORDER ITEMS:                                        │
│  Paracetamol 500mg × 2    3,000 IQD               │
│  Amoxicillin 500mg × 1   12,000 IQD               │
│  ─────────────────────────────                     │
│  Delivery fee              2,000 IQD               │
│  Total                    17,000 IQD               │
│                                                     │
│ [📞 Contact Support]  [Rate Pharmacy]              │
└─────────────────────────────────────────────────────┘
```

### 5. Doctor Telemedicine (/doctors)
```
DOCTOR LIST:
┌─────────────────────────────────┐
│ Find a Doctor                   │
│ [Specialty ▼] [Available ▼]    │
├─────────────────────────────────┤
│ DR. AHMED AL-RASHIDI            │
│ 👨‍⚕️  Cardiologist              │
│ ⭐ 4.9 (234 reviews)           │
│ 📍 2.3 km   •  Available today │
│ 💰 25,000 IQD / session        │
│ [Book Video] [Book Chat]       │
│─────────────────────────────── │
│ DR. SARA HASSAN                 │
│ 👩‍⚕️  Pediatrician             │
│ ⭐ 4.7 (189 reviews)           │
│ [Book Video] [Book Chat]       │
└─────────────────────────────────┘

VIDEO CALL ROOM:
┌─────────────────────────────────┐
│ ┌──────────────┐ ┌───────────┐ │
│ │ Dr. Ahmed    │ │  You      │ │
│ │  [VIDEO]     │ │ [VIDEO]   │ │
│ └──────────────┘ └───────────┘ │
│                                 │
│ [🎤 Mute] [📷 Camera] [💬 Chat]│
│ [📋 Prescribe] [❌ End Call]   │
│                                 │
│ Session: 12:34                  │
└─────────────────────────────────┘
```

---

## PHARMACY DASHBOARD — SCREEN INVENTORY

### 1. Dashboard Overview (/dashboard)
```
┌─────────────────────────────────────────────────────┐
│ SIDEBAR                │  MAIN CONTENT               │
│ ──────────────         │                             │
│ 📊 Overview            │  TODAY AT A GLANCE          │
│ 📦 Orders   [12]       │  ┌────┐ ┌────┐ ┌────┐ ┌──┐│
│ 💊 Requests [5]        │  │ 45 │ │750K│ │94% │ │⭐│ │
│ 🗃️ Inventory           │  │Ord │ │Rev │ │Ful │ │4.8│ │
│ 📈 Analytics           │  └────┘ └────┘ └────┘ └──┘│
│ 📣 Campaigns           │                             │
│ 🛒 B2B Orders          │  LIVE REQUESTS (5)          │
│ 👥 Staff               │  ┌─────────────────────┐   │
│ ⚙️ Settings            │  │ 🚨 URGENT — Amoxicil │   │
│                        │  │ Patient: 1.2km away  │   │
│ AL-AMIN PHARMACY       │  │ [Accept] [Decline]   │   │
│ ● Online               │  └─────────────────────┘   │
│                        │  [Request Card]             │
│                        │                             │
│                        │  RECENT ORDERS              │
│                        │  [Order Table rows...]      │
└─────────────────────────────────────────────────────┘
```

### 2. Inventory Management (/dashboard/inventory)
```
┌─────────────────────────────────────────────────────┐
│ Inventory Management    [+ Add Stock] [Import CSV]  │
│                                                     │
│ [🔍 Search...] [Category ▼] [⚠️ Low Stock] [Expiry]│
│                                                     │
│ TABLE:                                              │
│ Drug Name | Stock | Reserved | Price | Expiry | ⚠️  │
│ ─────────────────────────────────────────────────  │
│ Paracetamol 500mg | 145 | 5 | 1,500 | 2026-01 | ✅ │
│ Amoxicillin 500mg | 8   | 0 | 8,000 | 2025-03 | ⚠️ │
│ Ibuprofen 400mg   | 0   | 0 | 2,000 | —       | ❌ │
│                                                     │
│ ⚠️ 3 items low stock  •  📅 1 item expiring soon   │
└─────────────────────────────────────────────────────┘
```

### 3. Analytics Dashboard (/dashboard/analytics)
```
┌─────────────────────────────────────────────────────┐
│ Analytics              [This Week ▼] [Export]       │
│                                                     │
│ ┌── Revenue Trend ──────────────────────────────┐  │
│ │  [Line chart: daily revenue over 30 days]      │  │
│ └────────────────────────────────────────────────┘  │
│                                                     │
│ ┌── Top Products ───┐ ┌── Order Status ──────────┐ │
│ │  [Bar chart]      │ │  [Donut: fulfilled vs not]│ │
│ └───────────────────┘ └──────────────────────────┘ │
│                                                     │
│ ┌── Patient Map ─────────────────────────────────┐ │
│ │  [Heatmap of delivery locations]               │ │
│ └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## ADMIN PORTAL — SCREEN INVENTORY

### 1. Platform Overview (/admin)
```
┌─────────────────────────────────────────────────────┐
│ ADMIN SIDEBAR          │  PLATFORM OVERVIEW          │
│ ─────────────          │                             │
│ 📊 Dashboard           │  KPI CARDS (row of 6):     │
│ 🏥 Pharmacies [12]     │  Users | Orders | Revenue   │
│ 🏭 Warehouses [3]      │  Pharmacies | Drivers | GMV │
│ 👨‍⚕️ Doctors [8]         │                             │
│ 📋 Verifications       │  ALERTS (real-time):        │
│ 💰 Payments            │  ⚠️ New pharmacy application│
│ 🔍 Audit Logs          │  🚨 Drug recall issued      │
│ 🛡️ Security            │  ⚠️ License expiring (3)   │
│ ⚙️ Settings            │                             │
│ 👥 Roles & Permissions │  RECENT ACTIVITY FEED       │
└─────────────────────────────────────────────────────┘
```

### 2. Pharmacy Verification Queue (/admin/pharmacies)
```
FILTERS: [All ▼] [Pending ▼] [Date ▼]

TABLE:
Pharmacy | Owner | Submitted | Documents | Risk | Actions
Al-Amin  | Ahmed | 2025-01-20 | 4/4 ✅   | Low  | [Review] [Approve] [Reject]
Al-Noor  | Sara  | 2025-01-19 | 3/4 ⚠️  | Med  | [Review] [Request Docs]

PHARMACY REVIEW MODAL:
┌─────────────────────────────────────┐
│ Review: Al-Amin Pharmacy            │
│                                     │
│ [Document viewer: National ID]      │
│ [Document viewer: License]          │
│ [Pharmacy front photo]              │
│                                     │
│ AI Fraud Score: 0.04 ✅ Low Risk   │
│ License verified: Yes               │
│ GPS confirmed: Yes                  │
│                                     │
│ [Reject] [Request Docs] [Approve ✓]│
└─────────────────────────────────────┘
```

---

## MOBILE APP — KEY SCREENS (React Native)

### Patient App Screens:

**Home Tab:**
- Header: greeting + search bar + location
- Quick actions: Search, Prescriptions, Doctors, Orders
- Nearby pharmacies horizontal scroll
- Promotions carousel
- Recent orders

**Search Screen (Full Screen):**
- Search input (autofocus)
- Drug results grid
- Pharmacy results list
- Map toggle button

**Active Order Screen:**
- Full-screen map with driver marker
- Bottom sheet: order status + ETA
- Swipe up to see order details

**Profile Tab:**
- User info card
- Health profile section
- Family members
- Addresses
- Loyalty points card
- Settings

### Driver App Screens:

**Online Toggle Screen:**
- Big toggle: Go Online/Offline
- Earnings today
- Delivery requests appear as modal cards

**Active Delivery Screen:**
- Navigation map (full screen)
- Bottom drawer: delivery info + next step button
- [Arrived at Pharmacy] → [Picked Up] → [Delivered]

---

## RTL/LTR Implementation Notes

```
Arabic (RTL):
  - flex-direction: row-reverse for horizontal layouts
  - text-align: right by default
  - Icons flip horizontally: arrows, chevrons (not logos)
  - Margins/paddings swap: mr → ml, pl → pr
  - Scroll direction: right-to-left
  - Form inputs: right-aligned labels

Tailwind RTL classes used:
  rtl:flex-row-reverse
  rtl:text-right
  rtl:mr-auto → rtl:ml-auto
  rtl:pl-4 → rtl:pr-4

Number formatting:
  Arabic-Indic numerals: optional (configurable)
  Currency: د.ع (IQD), $ (USD)
  Dates: localized per locale
```
