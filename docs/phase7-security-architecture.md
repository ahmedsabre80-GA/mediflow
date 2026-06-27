# PHASE 7 — SECURITY ARCHITECTURE & COMPLIANCE

## Security Principles
1. Zero Trust — never assume, always verify
2. Defense in Depth — multiple overlapping control layers
3. Least Privilege — minimum permissions for every actor and service
4. Secure by Default — opt-in to less secure options, never opt-out of security

---

## Authentication & Authorization Architecture

### JWT Token Design
```
Access Token (RS256 — asymmetric signing):
Header: { "alg": "RS256", "typ": "JWT", "kid": "key-2025-01" }
Payload:
{
  "sub": "user-uuid",
  "iss": "https://auth.mediflow.io",
  "aud": "https://api.mediflow.io",
  "iat": 1706000000,
  "exp": 1706000900,  // 15 minutes
  "role": "pharmacy_manager",
  "permissions": ["orders:read", "orders:write", "inventory:read"],
  "pharmacyId": "uuid",
  "tenantId": "uuid",
  "deviceId": "fingerprint-hash"
}

Refresh Token:
  - Opaque 256-bit random string
  - Stored as SHA-256 hash in Redis
  - TTL: 30 days
  - Rotated on every use (refresh token rotation)
  - Old token immediately invalidated after rotation
```

### RBAC Permission Matrix

| Resource | Action | Patient | Doctor | Pharmacist | Pharmacy Mgr | Warehouse Mgr | Driver | Admin | Auditor |
|---|---|---|---|---|---|---|---|---|---|
| own-profile | read/write | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| health-records | read | self | - | consent | consent | - | - | ✓ | - |
| prescriptions | create | - | ✓ | - | - | - | - | - | - |
| prescriptions | verify | - | - | ✓ | ✓ | - | - | - | - |
| orders | create | ✓ | - | - | - | - | - | - | - |
| orders | fulfill | - | - | ✓ | ✓ | - | - | - | - |
| pharmacy-inventory | write | - | - | ✓ | ✓ | - | - | ✓ | - |
| pharmacy-admin | manage | - | - | - | ✓ | - | - | ✓ | - |
| users | suspend | - | - | - | - | - | - | ✓ | - |
| audit-logs | read | - | - | - | - | - | - | ✓ | ✓ |
| platform-config | write | - | - | - | - | - | - | SuperAdmin | - |

---

## Security Controls by Layer

### Layer 1: Network Security
```
- CloudFront WAF rules:
    • Block OWASP Top 10 patterns (SQLi, XSS, path traversal)
    • Geographic blocking for non-target countries (configurable)
    • Bot detection and CAPTCHA challenge
    • DDoS protection (AWS Shield Advanced)
    • Rate limiting at edge: 10,000 req/min per IP

- VPC Security:
    • All services in private subnets (no public IPs)
    • Internet access only via NAT Gateway
    • Security Groups: allowlist-only, no 0.0.0.0/0 inbound
    • VPC Flow Logs enabled (CloudWatch)
    • AWS Network Firewall for deep packet inspection
```

### Layer 2: API Gateway Security
```
- TLS 1.3 minimum (TLS 1.0/1.1 disabled)
- HSTS header: max-age=31536000; includeSubDomains; preload
- Certificate: Let's Encrypt with auto-renewal
- JWT validation on every protected endpoint
- Rate limiting per user and per IP
- Request size limits (50MB max for file uploads)
- Input sanitization (strip null bytes, control chars)
- Security headers:
    X-Content-Type-Options: nosniff
    X-Frame-Options: DENY
    Content-Security-Policy: default-src 'self'
    X-XSS-Protection: 1; mode=block
    Referrer-Policy: strict-origin-when-cross-origin
```

### Layer 3: Service Mesh Security (Istio)
```
- mTLS enforced for all pod-to-pod communication
- Certificate rotation every 24 hours (SPIFFE/SPIRE)
- AuthorizationPolicy: deny-by-default, explicit allowlist
  Example: only order-service can call payment-service
- PeerAuthentication: STRICT mTLS mode in all namespaces
- Service identity: SPIFFE SVIDs (X.509)
```

### Layer 4: Application Security
```
- Input validation on ALL endpoints (Zod schemas)
- Output encoding to prevent XSS
- Parameterized queries ONLY — no string concatenation in SQL
- File upload validation:
    • Allowed MIME types only
    • Virus scanning (ClamAV) on upload
    • File content validation (not just extension)
    • Stored with random UUID name (no original filename)
- CSRF protection for web (SameSite cookies + CSRF token)
- Clickjacking: X-Frame-Options DENY
- Secure session management:
    • HttpOnly cookies for web refresh tokens
    • Secure flag (HTTPS only)
    • SameSite=Strict
```

### Layer 5: Data Security
```
Encryption at Rest:
- PostgreSQL: AWS RDS storage encrypted (AES-256, AWS KMS)
- Redis: ElastiCache encryption at rest
- S3: Server-side encryption (SSE-KMS)
- Secrets: HashiCorp Vault (AES-256-GCM)
- Application-level encryption for PII:
    • Patient health data: AES-256-GCM with per-patient key
    • Prescription content: AES-256-GCM
    • Audit log state fields: AES-256-GCM

Encryption in Transit:
- All service-to-service: mTLS (Istio)
- All client-to-server: TLS 1.3
- All DB connections: SSL required (reject non-SSL)
- Kafka: TLS + SASL_SSL
- Redis: TLS enabled

Key Management:
- Master keys in AWS KMS (HSM-backed)
- Service keys in HashiCorp Vault (auto-rotated 90 days)
- No secrets in environment variables (use Vault Agent injection)
- No secrets in code or Docker images
- No secrets in git history (git-secrets pre-commit hook)
```

---

## Multi-Factor Authentication

```
REQUIRED FOR:
  - All admin roles (mandatory, cannot be disabled)
  - Doctors (mandatory)
  - Pharmacy managers (mandatory)
  - Patients (optional, strongly recommended)

MFA METHODS (in order of preference):
  1. TOTP (Time-based OTP — Google Authenticator, Authy)
     - RFC 6238 compliant
     - 30-second window
     - Backup codes: 8 codes × 10 chars, one-time use
  
  2. SMS OTP
     - 6 digits
     - 5-minute expiry
     - Max 3 attempts before lockout
     - Rate limited: 3 per hour, 10 per day per number
  
  3. Email OTP (fallback)
     - 6 digits
     - 5-minute expiry

ADAPTIVE MFA:
  Trigger forced MFA when:
  - Login from new country
  - Login from new device
  - Login after 30-day absence
  - High-value transaction (configurable threshold)
  - Multiple failed login attempts on account
```

---

## Secrets Management (HashiCorp Vault)

```
VAULT ARCHITECTURE:
  - 3-node HA cluster (Raft storage)
  - Auto-unsealing via AWS KMS
  - Audit logging to CloudWatch

SECRET PATHS:
  secret/mediflow/production/auth-service/database
  secret/mediflow/production/auth-service/jwt-keys
  secret/mediflow/production/payment-service/stripe
  secret/mediflow/production/payment-service/paytabs
  secret/mediflow/production/notification-service/twilio
  secret/mediflow/production/ai-service/openai

DYNAMIC SECRETS:
  - Database credentials: generated per-service, TTL 1 hour, auto-renewed
  - AWS credentials: STS assume-role, TTL 1 hour
  - Kafka credentials: SCRAM authentication, rotated daily

K8S INTEGRATION:
  - Vault Agent Injector: auto-injects secrets as mounted files
  - No secrets passed as env vars
  - Services read from /vault/secrets/config
```

---

## Security Monitoring & Intrusion Detection

```
SIEM: AWS Security Hub + custom CloudWatch dashboards

MONITORED EVENTS:
  Authentication:
    - Failed login attempts > 5 in 5 min → alert + temp block
    - Login from new country → MFA challenge
    - Password spray detection (many accounts, slow attempts)
    - Credential stuffing detection (known breach list check)

  Authorization:
    - Permission denied events > 10/min per user → alert
    - Admin role escalation → immediate alert
    - Off-hours admin access → alert

  Data Access:
    - Bulk data export by any user → alert
    - Patient health record access without consent → block + alert
    - Prescription data accessed > 100/hour per actor → alert

  Transactions:
    - Order value > configured threshold → manual review
    - Multiple orders from same IP (different accounts) → fraud flag
    - Rapid order cancellations (> 3 in 1 hour) → fraud flag

  Infrastructure:
    - Unexpected port scan → block IP + alert
    - New service → certificate mismatch → block
    - Kubernetes pod crash loop → alert

AUTOMATED RESPONSES:
  - IP block: > 100 failed auths in 10 min → auto-block 24h
  - Account lock: > 5 failed logins → 15 min lockout
  - Emergency freeze: unusual bulk transaction → wallet freeze pending review

SECURITY TOOLS:
  - Trivy: container image scanning in CI/CD
  - Falco: runtime security (K8s pod behavior monitoring)
  - AWS GuardDuty: threat detection
  - AWS Config: compliance monitoring
  - Checkov: IaC security scanning
  - OWASP ZAP: DAST in staging pipeline
  - Semgrep: SAST in CI
```

---

## Compliance Architecture

### Healthcare Data Compliance
```
PATIENT DATA CLASSIFICATION:
  Class A (Most Sensitive):
    - Blood type, allergies, chronic conditions
    - Prescriptions and medication history
    - Telemedicine recordings
    - Mental health or substance abuse data
    Controls: Encrypt at rest+transit, access logging, consent required, 
              patient controls sharing, right to erasure

  Class B (Sensitive):
    - Order history
    - Chat with pharmacists/doctors
    - Payment information
    Controls: Encrypt at rest+transit, access logging

  Class C (Internal):
    - Anonymized analytics
    - Platform usage metrics
    Controls: Standard security

DATA RESIDENCY:
  - Iraqi patient data: stays in me-south-1 (Bahrain) or local DC
  - Cross-border transfer: explicit patient consent required
  - Government data sharing: only via official legal process

RIGHT TO ERASURE PROCESS:
  Patient requests deletion →
    1. Account deactivated immediately
    2. PII anonymized within 30 days (name → "Deleted User", email → null)
    3. Health data deleted (encrypted keys destroyed = crypto shredding)
    4. Financial records anonymized (patient_id → random ID, amounts kept)
    5. Prescription records: de-identified, retained per law (10 years)
    6. Audit logs: pseudonymized actor references
    7. Confirmation sent to patient
```

### License Compliance Monitoring
```
AUTOMATED MONITORING:
  Scheduled job runs daily at 06:00 UTC:
  
  For each active pharmacy/warehouse/doctor:
    1. Check all document expiry dates
    2. If expiryDate = today + 90 days → send 90-day warning
    3. If expiryDate = today + 60 days → send 60-day warning + admin alert
    4. If expiryDate = today + 30 days → send 30-day warning + escalation
    5. If expiryDate = today + 7 days → URGENT alert + admin action required
    6. If expiryDate = today → suspend account automatically
    7. If expiryDate < today → account remains suspended until renewed

RENEWAL PROCESS:
  Provider uploads new document →
  Admin reviews and verifies →
  Expiry date updated in system →
  Account reactivated
```

### Product Recall Compliance
```
RECALL WORKFLOW:
  1. Recall issued (by manufacturer, admin, or regulatory authority)
  2. System identifies all affected batches across all pharmacies/warehouses
  3. All affected stock immediately flagged: RECALLED, removed from listings
  4. Notifications sent to all holding parties within 5 minutes
  5. Audit trail created for all affected units
  6. Pharmacies/warehouses confirm recall acknowledgment
  7. Disposal confirmation required within 7 days
  8. Recall report generated for regulatory submission
```

---

## Penetration Testing Schedule

| Type | Frequency | Scope |
|---|---|---|
| External Pentest | Before each major release | Public APIs, web apps |
| Internal Pentest | Annually | Internal services, database |
| DAST (automated) | Every CI/CD run | Staging environment |
| SAST (automated) | Every commit | Source code |
| Dependency scan | Daily | npm audit, Trivy |
| Social Engineering | Bi-annually | Staff phishing simulation |
| Chaos/DR test | Monthly | Infrastructure resilience |

---

## Incident Response Plan

```
SEVERITY LEVELS:
  P0 — Platform down > 30 sec → all hands, 5min response
  P1 — Data breach suspected → security team, 15min response
  P2 — Service degraded → on-call engineer, 30min response
  P3 — Non-critical issue → next business day

P1 DATA BREACH PROTOCOL:
  0-15 min:  Detect → isolate affected system → preserve logs
  15-60 min: Assess scope → notify CISO and legal
  1-4 hrs:   Contain breach → revoke compromised credentials
  4-24 hrs:  Investigate root cause → notify affected users if required
  24-72 hrs: Regulatory notification (72hr requirement in many jurisdictions)
  1 week:    Full incident report → remediation plan
  1 month:   Post-mortem → security improvements deployed
```
