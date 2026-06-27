# MediFlow — Enterprise Healthcare Ecosystem Platform

[![CI](https://github.com/mediflow-io/mediflow/actions/workflows/ci.yml/badge.svg)](https://github.com/mediflow-io/mediflow/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

MediFlow is a production-ready, enterprise-grade healthcare marketplace ecosystem connecting patients, doctors, pharmacies, drug warehouses, delivery drivers, and platform administrators through a unified digital platform.

## Architecture

- **25 microservices** — each independently deployable
- **Domain-Driven Design** with Clean Architecture
- **Event-Driven** via Apache Kafka
- **Zero Trust** security with Istio service mesh
- **Multi-region** AWS deployment (primary: me-south-1, DR: eu-west-1)
- **Multi-language**: Arabic (RTL), English, Kurdish, Turkish

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + TypeScript (services), Python (AI) |
| Frontend | Next.js 14 + React + Tailwind CSS |
| Mobile | React Native + Expo |
| Database | PostgreSQL 16 + PostGIS |
| Cache | Redis 7 Cluster |
| Search | Elasticsearch 8 |
| Storage | MinIO (S3-compatible) |
| Messaging | Apache Kafka |
| Container | Docker + Kubernetes |
| Service Mesh | Istio |
| API Gateway | Kong |
| CI/CD | GitHub Actions |
| IaC | Terraform + Helm |
| Monitoring | Prometheus + Grafana + Jaeger |
| Secrets | HashiCorp Vault |

## Repository Structure

```
mediflow/
├── apps/
│   ├── web-patient/        # Next.js — Patient web application
│   ├── web-pharmacy/       # Next.js — Pharmacy dashboard
│   ├── web-warehouse/      # Next.js — Warehouse dashboard
│   ├── web-doctor/         # Next.js — Doctor portal
│   ├── web-admin/          # Next.js — Admin portal
│   ├── mobile-patient/     # React Native — Patient mobile app
│   ├── mobile-pharmacy/    # React Native — Pharmacy mobile app
│   └── mobile-driver/      # React Native — Driver mobile app
├── services/               # 25 microservices
├── packages/               # Shared libraries
├── infrastructure/         # Terraform, Kubernetes, Helm
├── database/               # SQL migrations and seeds
├── docs/                   # Architecture documentation
└── .github/workflows/      # CI/CD pipelines
```

## Quick Start (Local Development)

### Prerequisites
- Docker Desktop 4.x+
- Node.js 20+
- pnpm 8+

### 1. Clone and Install
```bash
git clone https://github.com/your-org/mediflow.git
cd mediflow
pnpm install
```

### 2. Start Infrastructure
```bash
docker-compose up -d postgres redis kafka elasticsearch minio
```

### 3. Initialize Database
```bash
docker exec mediflow-postgres psql -U mediflow -d mediflow \
  -f /docker-entrypoint-initdb.d/001_init_schemas.sql
```

### 4. Configure Environment
```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

### 5. Start Services
```bash
# Start all services in development mode
pnpm dev

# Or start specific services
pnpm --filter @mediflow/auth-service dev
pnpm --filter @mediflow/web-patient dev
```

### Service URLs (Development)
| Service | URL |
|---|---|
| Patient Web App | http://localhost:3000 |
| Auth API | http://localhost:8001 |
| Pharmacy API | http://localhost:8005 |
| Order API | http://localhost:8010 |
| GIS API | http://localhost:8017 |
| Kafka UI | http://localhost:8080 |
| MinIO Console | http://localhost:9001 |

## Documentation

| Document | Location |
|---|---|
| Business Requirements (BRD) | `docs/phase1-brd-srs.md` |
| Use Cases & Process Flows | `docs/phase2-use-cases.md` |
| Architecture Design | `docs/phase3-architecture.md` |
| Database Design & ERDs | `docs/phase4-database-design.md` |
| API Specification | `docs/phase5-api-specification.md` |
| UI/UX Architecture | `docs/phase6-ui-ux-architecture.md` |
| Security Architecture | `docs/phase7-security-architecture.md` |
| DevOps Architecture | `docs/phase8-devops-architecture.md` |

## Microservices

| # | Service | Port | Description |
|---|---|---|---|
| 1 | api-gateway | 80/443 | Kong — routing, auth, rate limiting |
| 2 | auth-service | 8001 | Authentication, JWT, MFA, OAuth2 |
| 3 | user-service | 8002 | Profiles, addresses, family accounts |
| 4 | patient-service | 8003 | Health records, consents |
| 5 | doctor-service | 8004 | Doctor profiles, availability |
| 6 | pharmacy-service | 8005 | Pharmacy management, inventory |
| 7 | warehouse-service | 8006 | Warehouse management, B2B |
| 8 | driver-service | 8007 | Driver profiles, earnings |
| 9 | product-catalog-service | 8008 | Drug database, categories |
| 10 | inventory-service | 8009 | Stock, batches, reservations |
| 11 | order-service | 8010 | Cascade engine, order lifecycle |
| 12 | prescription-service | 8011 | E-prescriptions, QR codes |
| 13 | delivery-service | 8012 | Delivery assignments, tracking |
| 14 | payment-service | 8013 | Payments, wallets, commissions |
| 15 | notification-service | 8014 | Push, SMS, email, in-app |
| 16 | messaging-service | 8015 | Real-time chat, WebSocket |
| 17 | advertisement-service | 8016 | Campaigns, analytics |
| 18 | gis-service | 8017 | Maps, routing, live tracking |
| 19 | analytics-service | 8018 | Dashboards, reports |
| 20 | ai-service | 8019 | Drug interactions, forecasting |
| 21 | reporting-service | 8020 | PDF/Excel generation |
| 22 | loyalty-service | 8021 | Points, referrals, rewards |
| 23 | verification-service | 8022 | Document verification, AI vision |
| 24 | insurance-service | 8023 | Coverage, claims |
| 25 | audit-service | 8024 | Immutable audit logs |

## Testing

```bash
# Run all tests
pnpm test

# With coverage
pnpm test:coverage

# Specific service
pnpm --filter @mediflow/auth-service test

# E2E tests
pnpm --filter @mediflow/e2e test
```

## Deployment

### Staging
```bash
git push origin develop  # auto-deploys to staging
```

### Production
```bash
git push origin main  # triggers production workflow (requires 2 approvers)
```

### Manual Kubernetes Deploy
```bash
# Configure kubectl
aws eks update-kubeconfig --region me-south-1 --name mediflow-production

# Deploy a specific service
kubectl set image deployment/auth-service \
  auth-service=ECR_REGISTRY/mediflow-auth-service:TAG \
  -n mediflow-core

# Check rollout
kubectl rollout status deployment/auth-service -n mediflow-core
```

## Security

- All APIs protected with RS256 JWT (15-minute access tokens)
- MFA enforced for all provider and admin accounts
- mTLS between all services (Istio)
- Secrets managed by HashiCorp Vault
- Patient health data encrypted at rest (AES-256-GCM)
- OWASP Top 10 mitigations enforced
- Automated SAST/DAST in CI/CD pipeline

## License

MIT License — see [LICENSE](LICENSE) for details.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting pull requests.

---

Built with ❤️ for better healthcare access.
