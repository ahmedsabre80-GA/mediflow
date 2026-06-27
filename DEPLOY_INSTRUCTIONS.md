# MediFlow — Deployment Instructions

## Step 1: Push to GitHub

### Option A: Using GitHub CLI (recommended)
```powershell
# Install GitHub CLI if not installed
winget install GitHub.cli

# Authenticate
gh auth login

# Create repository and push (from D:\mediflow)
cd D:\mediflow
gh repo create mediflow --public --source=. --remote=origin --push
```

### Option B: Manual (GitHub website)
1. Go to https://github.com/new
2. Repository name: `mediflow`
3. Set to Public or Private
4. Do NOT initialize with README (we already have one)
5. Click "Create repository"
6. Run these commands from D:\mediflow:

```powershell
cd D:\mediflow
git remote add origin https://github.com/YOUR_USERNAME/mediflow.git
git branch -M main
git push -u origin main
```

---

## Step 2: Deploy Frontend to Vercel (Patient Web App)

Vercel is the fastest way to get the frontend online for free.

### Via Vercel CLI:
```powershell
# Install Vercel CLI
npm install -g vercel

# Deploy patient web app
cd D:\mediflow\apps\web-patient
vercel

# Follow prompts:
# - Link to existing project? No
# - Project name: mediflow-patient
# - Which directory? ./
# - Override settings? No
```

### Via Vercel Website:
1. Go to https://vercel.com/new
2. Import your GitHub repository `mediflow`
3. Set Root Directory: `apps/web-patient`
4. Add Environment Variables:
   - NEXT_PUBLIC_API_URL = https://api.mediflow.io/api/v1
   - NEXT_PUBLIC_WS_URL = wss://gis.mediflow.io
   - NEXT_PUBLIC_MAPBOX_TOKEN = your_mapbox_token
5. Click Deploy

Your frontend will be live at: https://mediflow-patient.vercel.app

---

## Step 3: Deploy Backend Services to Railway (Quick Option)

Railway provides easy deployment for backend services with a free tier.

### Steps:
1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your `mediflow` repository
4. For each service (start with auth-service):
   - Root Directory: `services/auth-service`
   - Add environment variables from `.env.example`
5. Railway auto-detects Dockerfile and deploys

### Services to deploy first (minimum viable):
1. auth-service (port 8001)
2. pharmacy-service (port 8005)
3. order-service (port 8010)
4. gis-service (port 8017)
5. notification-service (port 8014)

### Databases on Railway:
- Add PostgreSQL plugin → copy DATABASE_URL
- Add Redis plugin → copy REDIS_URL

---

## Step 4: Deploy to AWS (Production)

### Prerequisites:
- AWS Account with appropriate permissions
- AWS CLI configured: `aws configure`
- Terraform installed: https://terraform.io/downloads
- kubectl installed

### Deploy Infrastructure:
```bash
cd D:\mediflow\infrastructure\terraform\environments\production

# Initialize
terraform init

# Plan
terraform plan -out=tfplan

# Apply (creates VPC, EKS, RDS, ElastiCache, MSK)
terraform apply tfplan
```

### Deploy Services to Kubernetes:
```bash
# Configure kubectl
aws eks update-kubeconfig --region me-south-1 --name mediflow-production

# Apply namespaces
kubectl apply -f infrastructure/kubernetes/base/namespaces/

# Deploy all services
kubectl apply -k infrastructure/kubernetes/overlays/production/
```

---

## Quick Demo (Local)

Run the full stack locally with Docker:

```powershell
cd D:\mediflow

# Start all infrastructure
docker-compose up -d postgres redis kafka elasticsearch minio

# Wait 30 seconds, then initialize database
docker exec mediflow-postgres psql -U mediflow -d mediflow -f /docker-entrypoint-initdb.d/001_init_schemas.sql

# Install dependencies
pnpm install

# Start services
pnpm dev
```

Access:
- Patient App: http://localhost:3000
- Kafka UI: http://localhost:8080
- MinIO: http://localhost:9001 (mediflow / mediflow_dev_password)

---

## Environment Variables Required

Copy `.env.example` to `.env.local` and fill in:
- Database credentials
- JWT key paths (generate with: openssl genrsa -out jwt-private.pem 2048)
- Twilio (SMS)
- SendGrid (Email)
- Mapbox (Maps)
- Stripe/PayTabs (Payments)
- Firebase (Push Notifications)
