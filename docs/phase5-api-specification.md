# PHASE 5 — API DESIGN & SPECIFICATIONS

## API Design Standards

- **Style**: RESTful with JSON bodies
- **Versioning**: URI-based `/api/v1/`
- **Auth**: Bearer JWT in Authorization header
- **Pagination**: Cursor-based `?cursor=&limit=` (default 20, max 100)
- **Errors**: RFC 7807 Problem Details format
- **Dates**: ISO 8601 UTC strings
- **IDs**: UUID v4 strings

---

## Standard Response Envelopes

```json
// Success
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 150, "cursor": "abc" }
}

// Error (RFC 7807)
{
  "success": false,
  "error": {
    "type": "https://mediflow.io/errors/validation-failed",
    "title": "Validation Failed",
    "status": 422,
    "detail": "The email field is required.",
    "instance": "/api/v1/auth/register",
    "errors": [{ "field": "email", "message": "required" }],
    "traceId": "abc123def456"
  }
}
```

---

## AUTH SERVICE API

### POST /api/v1/auth/register
Register new account.
```json
Request:
{
  "firstName": "Ahmed",
  "lastName": "Hassan",
  "email": "ahmed@example.com",
  "phone": "+9647801234567",
  "password": "Secure@Pass1",
  "role": "patient"
}
Response 201:
{
  "success": true,
  "data": {
    "userId": "uuid",
    "verificationSent": true,
    "verificationMethod": "email"
  }
}
```

### POST /api/v1/auth/login
```json
Request: { "identifier": "ahmed@example.com", "password": "..." }
Response 200: { "data": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900, "mfaRequired": false } }
Response 202 (MFA required): { "data": { "mfaToken": "...", "mfaMethod": "totp" } }
```

### POST /api/v1/auth/mfa/verify
```json
Request: { "mfaToken": "...", "otp": "123456" }
Response 200: { "data": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 } }
```

### POST /api/v1/auth/token/refresh
```json
Request: { "refreshToken": "..." }
Response 200: { "data": { "accessToken": "...", "expiresIn": 900 } }
```

### POST /api/v1/auth/logout
```json
Request: { "refreshToken": "..." }
Response 204: No content
```

### POST /api/v1/auth/password/reset/request
```json
Request: { "identifier": "ahmed@example.com" }
Response 200: { "data": { "message": "Reset link sent" } }
```

### POST /api/v1/auth/password/reset/confirm
```json
Request: { "token": "...", "newPassword": "NewSecure@1" }
Response 200: { "data": { "message": "Password updated" } }
```

---

## PATIENT API

### GET /api/v1/patients/me
Get own patient profile.

### PATCH /api/v1/patients/me
Update patient profile.
```json
Request: { "firstName": "Ahmed", "preferredLang": "ar" }
```

### GET /api/v1/patients/me/health-profile
```json
Response: { "data": { "bloodType": "A+", "allergies": [...], "chronicConditions": [...], "currentMedications": [...] } }
```

### PATCH /api/v1/patients/me/health-profile
```json
Request: { "bloodType": "A+", "heightCm": 175, "weightKg": 70 }
```

### POST /api/v1/patients/me/allergies
```json
Request: { "allergen": "Penicillin", "severity": "severe", "reaction": "Anaphylaxis" }
Response 201: { "data": { "id": "uuid", ... } }
```

### GET /api/v1/patients/me/family
### POST /api/v1/patients/me/family/members
```json
Request: { "name": "Fatima Hassan", "relationship": "child", "dateOfBirth": "2015-03-15", "gender": "female" }
```

### POST /api/v1/patients/me/addresses
```json
Request: { "label": "Home", "fullAddress": "123 Al-Rasheed St, Baghdad", "latitude": 33.3152, "longitude": 44.3661, "isDefault": true }
```

### GET /api/v1/patients/me/orders
### GET /api/v1/patients/me/prescriptions
### GET /api/v1/patients/me/loyalty
### POST /api/v1/patients/me/loyalty/redeem
```json
Request: { "points": 500, "orderId": "uuid" }
```

### POST /api/v1/patients/me/consent
Grant health data access to provider.
```json
Request: { "accessorId": "uuid", "accessorType": "doctor", "dataTypes": ["allergies", "medications"], "expiresAt": "2025-12-31T00:00:00Z" }
```

---

## MEDICATION REQUEST API

### POST /api/v1/medication-requests
Create new medication request (triggers cascade engine).
```json
Request:
{
  "items": [
    { "drugId": "uuid", "quantity": 2 },
    { "drugId": "uuid", "quantity": 1 }
  ],
  "prescriptionId": "uuid",
  "latitude": 33.3152,
  "longitude": 44.3661,
  "isEmergency": false,
  "deliveryType": "delivery",
  "notes": ""
}
Response 201:
{
  "data": {
    "requestId": "uuid",
    "status": "searching",
    "searchRadiusKm": 5,
    "estimatedResponseTime": "2-5 minutes"
  }
}
```

### GET /api/v1/medication-requests/{requestId}
```json
Response:
{
  "data": {
    "id": "uuid",
    "status": "offers_received",
    "offers": [
      {
        "offerId": "uuid",
        "pharmacyId": "uuid",
        "pharmacyName": "Al-Amin Pharmacy",
        "distanceKm": 1.2,
        "totalPrice": 15000,
        "deliveryFee": 2000,
        "estimatedEtaMin": 30,
        "currency": "IQD"
      }
    ],
    "expiresAt": "..."
  }
}
```

### POST /api/v1/medication-requests/{requestId}/select-offer
```json
Request: { "offerId": "uuid", "paymentMethod": "card", "cardToken": "tok_xxx" }
Response 200: { "data": { "orderId": "uuid", "status": "pending_payment" } }
```

### DELETE /api/v1/medication-requests/{requestId}
Cancel active request.

### GET /api/v1/medication-requests
List patient's requests with filters.

---

## PHARMACY API

### POST /api/v1/pharmacies/register
```json
Request:
{
  "name": "Al-Amin Pharmacy",
  "nameAr": "صيدلية الأمين",
  "licenseNumber": "PH-2024-001234",
  "licenseExpiry": "2026-12-31",
  "phone": "+9647801234567",
  "email": "alamin@pharmacy.iq",
  "address": "Al-Karrada, Baghdad",
  "latitude": 33.3152,
  "longitude": 44.3661,
  "operatingHours": {
    "saturday": { "open": "09:00", "close": "22:00" },
    "sunday": { "open": "09:00", "close": "22:00" }
  }
}
```

### GET /api/v1/pharmacies/{pharmacyId}
Public pharmacy profile.

### GET /api/v1/pharmacies/nearby
```
Query: ?lat=33.315&lng=44.366&radiusKm=5&drugId=uuid&limit=10
```
```json
Response:
{
  "data": [
    {
      "pharmacyId": "uuid",
      "name": "Al-Amin Pharmacy",
      "distanceKm": 1.2,
      "rating": 4.7,
      "deliveryFee": 2000,
      "isOpen": true,
      "hasStock": true,
      "price": 15000
    }
  ]
}
```

### PATCH /api/v1/pharmacies/{pharmacyId}
Update pharmacy details (manager+).

### GET /api/v1/pharmacies/{pharmacyId}/inventory
```
Query: ?page=1&limit=20&search=paracetamol&lowStock=true&nearExpiry=true
```

### POST /api/v1/pharmacies/{pharmacyId}/inventory
Add product to inventory.
```json
Request:
{
  "drugId": "uuid",
  "quantity": 100,
  "sellingPrice": 1500,
  "currency": "IQD",
  "reorderLevel": 20
}
```

### PUT /api/v1/pharmacies/{pharmacyId}/inventory/{stockId}
Update stock quantity / price.

### POST /api/v1/pharmacies/{pharmacyId}/inventory/batches
Add stock batch.
```json
Request:
{
  "drugId": "uuid",
  "batchNumber": "BATCH-2024-001",
  "quantity": 200,
  "manufactureDate": "2024-01-01",
  "expiryDate": "2026-01-01",
  "purchasePrice": 1000
}
```

### GET /api/v1/pharmacies/{pharmacyId}/orders
List incoming orders.
```
Query: ?status=preparing&page=1
```

### PATCH /api/v1/pharmacies/{pharmacyId}/orders/{orderId}/status
```json
Request: { "status": "preparing", "estimatedReadyMin": 20 }
```

### POST /api/v1/pharmacies/{pharmacyId}/offers
Submit offer to medication request.
```json
Request:
{
  "requestId": "uuid",
  "totalPrice": 15000,
  "deliveryFee": 2000,
  "currency": "IQD",
  "estimatedEtaMin": 30,
  "notes": "All items available"
}
```

### GET /api/v1/pharmacies/{pharmacyId}/analytics
```json
Response:
{
  "data": {
    "today": { "orders": 45, "revenue": 750000 },
    "thisMonth": { "orders": 1200, "revenue": 18500000 },
    "topProducts": [...],
    "orderFulfillmentRate": 0.94
  }
}
```

---

## WAREHOUSE API

### POST /api/v1/warehouses/register
Full warehouse registration with documents.

### GET /api/v1/warehouses/{warehouseId}/inventory
Warehouse stock with batch details.

### POST /api/v1/warehouses/{warehouseId}/inventory
Add warehouse stock.

### GET /api/v1/warehouses/{warehouseId}/rfqs
List received RFQs from pharmacies.

### POST /api/v1/rfqs
Pharmacy creates RFQ.
```json
Request:
{
  "targetWarehouseIds": ["uuid1", "uuid2"],
  "items": [
    { "drugId": "uuid", "quantity": 1000, "notes": "Need before 2025-02-01" }
  ],
  "requiredDeliveryDate": "2025-02-01",
  "notes": ""
}
```

### POST /api/v1/rfqs/{rfqId}/quotations
Warehouse responds with quote.
```json
Request:
{
  "items": [
    { "drugId": "uuid", "availableQuantity": 1000, "unitPrice": 900, "currency": "IQD" }
  ],
  "deliveryDate": "2025-01-28",
  "paymentTerms": "net30",
  "minimumOrderValue": 500000,
  "notes": ""
}
```

### POST /api/v1/rfqs/{rfqId}/quotations/{quotationId}/accept
Pharmacy accepts quotation → creates PO.

### POST /api/v1/rfqs/{rfqId}/quotations/{quotationId}/negotiate
```json
Request: { "counterItems": [...], "counterNote": "Can you do 850 per unit?" }
```

---

## DOCTOR API

### POST /api/v1/doctors/register
Doctor registration with license.

### GET /api/v1/doctors
Search doctors.
```
Query: ?specialization=cardiology&available=true&lat=33.31&lng=44.36
```

### GET /api/v1/doctors/{doctorId}
Doctor profile (public).

### GET /api/v1/doctors/{doctorId}/availability
```
Query: ?from=2025-01-20&to=2025-01-27
```

### POST /api/v1/appointments
Book appointment.
```json
Request:
{
  "doctorId": "uuid",
  "scheduledAt": "2025-01-22T10:00:00Z",
  "type": "video",
  "patientId": "uuid",
  "notes": "Chest pain concerns"
}
```

### GET /api/v1/appointments/{appointmentId}/join
Returns WebRTC room credentials.
```json
Response: { "data": { "roomId": "...", "token": "...", "serverUrl": "wss://livekit.mediflow.io" } }
```

### POST /api/v1/prescriptions
Doctor creates prescription.
```json
Request:
{
  "patientId": "uuid",
  "appointmentId": "uuid",
  "items": [
    {
      "drugId": "uuid",
      "dosage": "500mg",
      "frequency": "3x daily",
      "duration": "7 days",
      "quantity": 21,
      "instructions": "Take after meals"
    }
  ],
  "diagnosis": "Upper respiratory tract infection",
  "notes": "",
  "validityDays": 30
}
```

### GET /api/v1/prescriptions/{prescriptionId}
### GET /api/v1/prescriptions/{prescriptionId}/qr
Returns QR code image.

### POST /api/v1/prescriptions/verify
Pharmacy verifies QR.
```json
Request: { "qrToken": "eyJ..." }
Response:
{
  "data": {
    "valid": true,
    "prescription": {
      "id": "uuid",
      "doctorName": "Dr. Mohammed Al-Rawi",
      "patientName": "Ahmed Hassan",
      "issuedAt": "2025-01-20T10:00:00Z",
      "expiresAt": "2025-02-20T10:00:00Z",
      "items": [...]
    }
  }
}
```

### POST /api/v1/prescriptions/{id}/dispense
Mark items as dispensed.

---

## ORDER & PAYMENT API

### GET /api/v1/orders/{orderId}
Order details with timeline.

### PATCH /api/v1/orders/{orderId}/cancel
Cancel order.

### POST /api/v1/orders/{orderId}/pay
Process payment.
```json
Request:
{
  "method": "card",
  "gateway": "stripe",
  "token": "tok_xxxx",
  "saveCard": false,
  "loyaltyPointsToRedeem": 200
}
Response 200:
{
  "data": {
    "transactionId": "uuid",
    "status": "success",
    "amount": 17000,
    "currency": "IQD"
  }
}
```

### POST /api/v1/orders/{orderId}/refund
Request refund.

### GET /api/v1/payments/history
Patient payment history.

### GET /api/v1/wallets/me
Own wallet balance.

---

## DELIVERY & GIS API

### GET /api/v1/gis/pharmacies/nearby
```
Query: ?lat=33.31&lng=44.36&radiusKm=10&drugId=uuid
```

### GET /api/v1/gis/route
```
Query: ?fromLat=33.31&fromLng=44.36&toLat=33.32&toLng=44.37
```

### GET /api/v1/deliveries/{deliveryId}/track
```json
Response:
{
  "data": {
    "driverLocation": { "lat": 33.318, "lng": 44.362, "heading": 180, "speedKmh": 25 },
    "etaMinutes": 7,
    "status": "in_transit"
  }
}
```

### WS /ws/deliveries/{deliveryId}/live
WebSocket: real-time location stream.

### WS /ws/messaging/{conversationId}
WebSocket: real-time chat.

---

## NOTIFICATION API

### GET /api/v1/notifications
```
Query: ?unreadOnly=true&page=1
```

### PATCH /api/v1/notifications/{id}/read
### PATCH /api/v1/notifications/read-all
### PATCH /api/v1/notifications/preferences
```json
Request:
{
  "push": true,
  "sms": true,
  "email": false,
  "channels": {
    "orderUpdates": ["push", "sms"],
    "promotions": ["push"],
    "reminders": ["push", "email"]
  }
}
```

---

## ADMIN API

### GET /api/v1/admin/dashboard
Platform overview stats.

### GET /api/v1/admin/pharmacies
```
Query: ?status=pending_verification&page=1
```

### PATCH /api/v1/admin/pharmacies/{id}/status
```json
Request: { "status": "active", "reason": "Documents verified" }
```

### GET /api/v1/admin/users
### PATCH /api/v1/admin/users/{id}/suspend
### GET /api/v1/admin/audit-logs
```
Query: ?actorId=uuid&action=pharmacy.approved&from=2025-01-01&to=2025-01-31
```

### POST /api/v1/admin/roles
Create RBAC role.
```json
Request:
{
  "name": "regional_manager",
  "description": "Can manage pharmacies in assigned region",
  "permissions": ["pharmacies:read", "pharmacies:approve", "users:read"]
}
```

### GET /api/v1/admin/analytics/platform
Full platform analytics.

---

## ADVERTISEMENT API

### POST /api/v1/advertisements/campaigns
Create campaign.
```json
Request:
{
  "title": "Ramadan Discount on Vitamins",
  "body": "Get 20% off all vitamins this Ramadan!",
  "imageUrl": "https://...",
  "ctaText": "Shop Now",
  "targetType": "patients",
  "targetIds": ["uuid1", "uuid2", "uuid3"],
  "scheduledAt": "2025-03-01T08:00:00Z"
}
```

### GET /api/v1/advertisements/campaigns/{id}/analytics
```json
Response:
{
  "data": {
    "delivered": 6,
    "opened": 4,
    "clicked": 2,
    "conversions": 1,
    "openRate": 0.667,
    "clickRate": 0.333,
    "conversionRate": 0.167
  }
}
```

---

## AI API

### POST /api/v1/ai/drug-interactions/check
```json
Request: { "drugIds": ["uuid1", "uuid2", "uuid3"], "patientId": "uuid" }
Response:
{
  "data": {
    "interactions": [
      {
        "drugA": "Warfarin",
        "drugB": "Aspirin",
        "severity": "major",
        "description": "Increased bleeding risk",
        "recommendation": "Monitor INR closely or choose alternative"
      }
    ],
    "overallSeverity": "major"
  }
}
```

### POST /api/v1/ai/recommendations/products
```json
Request: { "patientId": "uuid", "context": "browse", "limit": 10 }
```

### POST /api/v1/ai/demand/forecast
```json
Request: { "pharmacyId": "uuid", "drugId": "uuid", "forecastDays": 30 }
Response:
{
  "data": {
    "forecastedDemand": 145,
    "confidence": 0.82,
    "breakdown": [
      { "date": "2025-01-21", "demand": 5 },
      ...
    ]
  }
}
```

---

## ERROR CODES

| Code | HTTP | Meaning |
|---|---|---|
| AUTH_001 | 401 | Token missing or invalid |
| AUTH_002 | 401 | Token expired |
| AUTH_003 | 403 | Insufficient permissions |
| AUTH_004 | 429 | Rate limit exceeded |
| AUTH_005 | 401 | MFA required |
| USER_001 | 404 | User not found |
| USER_002 | 409 | Email already registered |
| USER_003 | 409 | Phone already registered |
| ORDER_001 | 404 | Order not found |
| ORDER_002 | 422 | No pharmacy available |
| ORDER_003 | 422 | Prescription required |
| ORDER_004 | 409 | Inventory reservation failed |
| PAY_001 | 402 | Payment failed |
| PAY_002 | 422 | Insufficient wallet balance |
| RX_001 | 404 | Prescription not found |
| RX_002 | 422 | Prescription expired |
| RX_003 | 422 | Already dispensed |
| PHARM_001 | 403 | Pharmacy not verified |
| PHARM_002 | 429 | Campaign limit reached |
| VAL_001 | 422 | Validation failed |
| INT_001 | 500 | Internal server error |
