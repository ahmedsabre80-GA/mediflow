# PHASE 8 — DEVOPS ARCHITECTURE, CI/CD & MONITORING

## Environment Strategy

| Environment | Purpose | Deploy Trigger | Infrastructure |
|---|---|---|---|
| development | Local dev | Manual | docker-compose |
| staging | Integration testing | Push to develop | EKS (reduced) |
| production | Live system | Push to main + approval | EKS (full HA) |

---

## CI/CD Pipeline Design

### Pipeline: Pull Request Check (ci.yml)
```yaml
Triggers: pull_request to develop or main
Steps:
  1. Checkout code
  2. Install dependencies (pnpm install --frozen-lockfile)
  3. Lint (eslint, prettier check)
  4. Type check (tsc --noEmit)
  5. Unit tests (jest --coverage)
  6. Coverage gate (fail if < 80%)
  7. SAST scan (Semgrep)
  8. Dependency vulnerability scan (npm audit)
  9. Build Docker image (verify it builds)
  10. Pact contract tests (consumer contracts)
```

### Pipeline: Staging Deploy (cd-staging.yml)
```yaml
Triggers: push to develop branch
Steps:
  1. Run full CI pipeline
  2. Build Docker images for changed services only (Turborepo affected)
  3. Tag images: {service}:{commit-sha}
  4. Push to ECR
  5. Trivy scan Docker images (fail on CRITICAL CVE)
  6. Update Kubernetes manifests (image tag)
  7. Deploy to EKS staging (kubectl apply -k overlays/staging)
  8. Wait for rollout (kubectl rollout status, 5min timeout)
  9. Run smoke tests (critical path E2E tests)
  10. Run DAST scan (OWASP ZAP against staging)
  11. Notify Slack: deploy success/failure
```

### Pipeline: Production Deploy (cd-production.yml)
```yaml
Triggers: push to main branch + manual approval gate
Steps:
  1. Manual approval required from 2 engineers
  2. Build production Docker images
  3. Push to ECR with tag: {service}:v{semver}-{commit-sha}
  4. Run database migrations (pre-deploy)
  5. Canary deploy (10% traffic to new version)
  6. Monitor error rate for 5 minutes
  7. If error rate < 0.1%: full rollout
  8. If error rate >= 0.1%: automatic rollback
  9. Post-deploy smoke tests
  10. Notify: Slack, PagerDuty clear
```

### Pipeline: Security Scan (security-scan.yml)
```yaml
Triggers: daily at 03:00 UTC + push to main
Steps:
  1. Trivy: full vulnerability scan of all images
  2. Checkov: IaC security scan (Terraform, K8s manifests)
  3. gitleaks: secret detection in codebase
  4. OWASP dependency check
  5. Generate security report → S3
  6. Alert on CRITICAL findings
```

---

## GitHub Actions Workflow Files

### .github/workflows/ci.yml
```yaml
name: CI — Test & Lint

on:
  pull_request:
    branches: [develop, main]

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '8'

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      services: ${{ steps.filter.outputs.changes }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            auth-service: services/auth-service/**
            order-service: services/order-service/**
            pharmacy-service: services/pharmacy-service/**

  test:
    runs-on: ubuntu-latest
    needs: detect-changes
    strategy:
      matrix:
        service: ${{ fromJSON(needs.detect-changes.outputs.services) }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: '${{ env.PNPM_VERSION }}' }
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter ${{ matrix.service }} lint
      - run: pnpm --filter ${{ matrix.service }} type-check
      - run: pnpm --filter ${{ matrix.service }} test:coverage
      - uses: codecov/codecov-action@v4

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Semgrep SAST
        uses: semgrep/semgrep-action@v1
        with:
          config: >-
            p/typescript
            p/nodejs
            p/owasp-top-ten
      - name: Check for secrets
        uses: gitleaks/gitleaks-action@v2
```

### .github/workflows/cd-production.yml
```yaml
name: CD — Production Deploy

on:
  push:
    branches: [main]

jobs:
  approval:
    runs-on: ubuntu-latest
    environment: production  # requires 2 approvers in GitHub Environments
    steps:
      - run: echo "Approved for production deploy"

  build-and-push:
    needs: approval
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    strategy:
      matrix:
        service: [auth-service, order-service, pharmacy-service, payment-service]
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/mediflow-github-deploy
          aws-region: me-south-1
      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push
        run: |
          IMAGE="${{ secrets.ECR_REGISTRY }}/mediflow-${{ matrix.service }}"
          TAG="${GITHUB_SHA::8}"
          docker build -t "$IMAGE:$TAG" -t "$IMAGE:latest" \
            -f services/${{ matrix.service }}/Dockerfile .
          docker push "$IMAGE:$TAG"
          docker push "$IMAGE:latest"
      - name: Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: "${{ secrets.ECR_REGISTRY }}/mediflow-${{ matrix.service }}:${{ github.sha }}"
          exit-code: 1
          severity: CRITICAL

  migrate:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run DB migrations
        run: |
          kubectl exec -n mediflow-core deploy/auth-service -- \
            node dist/infrastructure/database/migrate.js

  deploy:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Configure kubectl
        uses: aws-actions/amazon-eks-update-kubeconfig@v1
        with:
          cluster-name: mediflow-production
          region: me-south-1
      - name: Deploy canary (10%)
        run: |
          kubectl set image deployment/order-service \
            order-service=${{ secrets.ECR_REGISTRY }}/mediflow-order-service:${GITHUB_SHA::8} \
            -n mediflow-commerce
          kubectl annotate deployment/order-service \
            deployment.kubernetes.io/revision=$(date +%s)
      - name: Monitor canary
        run: |
          sleep 300  # 5 minutes
          ERROR_RATE=$(kubectl exec -n mediflow-observability deploy/prometheus -- \
            promtool query instant \
            'rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])')
          if (( $(echo "$ERROR_RATE > 0.01" | bc -l) )); then
            echo "Error rate too high: $ERROR_RATE — rolling back"
            kubectl rollout undo deployment/order-service -n mediflow-commerce
            exit 1
          fi
```

---

## Kubernetes Manifests (Key Services)

### infrastructure/kubernetes/services/auth-service/deployment.yaml
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  namespace: mediflow-core
  labels:
    app: auth-service
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: auth-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0  # zero-downtime
  template:
    metadata:
      labels:
        app: auth-service
        version: v1
      annotations:
        vault.hashicorp.com/agent-inject: "true"
        vault.hashicorp.com/role: "auth-service"
        vault.hashicorp.com/agent-inject-secret-config: "secret/mediflow/production/auth-service/config"
    spec:
      serviceAccountName: auth-service
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
        - name: auth-service
          image: ECR_REGISTRY/mediflow-auth-service:latest
          ports:
            - containerPort: 8001
              name: http
          env:
            - name: NODE_ENV
              value: production
            - name: PORT
              value: "8001"
          envFrom:
            - configMapRef:
                name: auth-service-config
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 1000m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8001
            initialDelaySeconds: 10
            periodSeconds: 30
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8001
            initialDelaySeconds: 5
            periodSeconds: 10
            failureThreshold: 3
          volumeMounts:
            - name: vault-secrets
              mountPath: /vault/secrets
              readOnly: true
      volumes:
        - name: vault-secrets
          emptyDir:
            medium: Memory
---
apiVersion: v1
kind: Service
metadata:
  name: auth-service
  namespace: mediflow-core
spec:
  selector:
    app: auth-service
  ports:
    - port: 8001
      targetPort: 8001
      name: http
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: auth-service
  namespace: mediflow-core
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: auth-service
  minReplicas: 3
  maxReplicas: 15
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: auth-service
  namespace: mediflow-core
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: auth-service
```

### infrastructure/kubernetes/base/namespaces/namespaces.yaml
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: mediflow-core
  labels:
    istio-injection: enabled
---
apiVersion: v1
kind: Namespace
metadata:
  name: mediflow-commerce
  labels:
    istio-injection: enabled
---
apiVersion: v1
kind: Namespace
metadata:
  name: mediflow-provider
  labels:
    istio-injection: enabled
---
apiVersion: v1
kind: Namespace
metadata:
  name: mediflow-clinical
  labels:
    istio-injection: enabled
---
apiVersion: v1
kind: Namespace
metadata:
  name: mediflow-logistics
  labels:
    istio-injection: enabled
---
apiVersion: v1
kind: Namespace
metadata:
  name: mediflow-engagement
  labels:
    istio-injection: enabled
---
apiVersion: v1
kind: Namespace
metadata:
  name: mediflow-platform
  labels:
    istio-injection: enabled
---
apiVersion: v1
kind: Namespace
metadata:
  name: mediflow-observability
---
apiVersion: v1
kind: Namespace
metadata:
  name: mediflow-infra
```

---

## Monitoring & Alerting

### Prometheus Alert Rules
```yaml
# infrastructure/kubernetes/overlays/production/prometheus-rules.yaml
groups:
  - name: mediflow.slo
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
          / sum(rate(http_requests_total[5m])) by (service) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.service }}"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.99,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (service, le)
          ) > 0.5
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "High p99 latency on {{ $labels.service }}"

      - alert: ServiceDown
        expr: up{job=~"mediflow-.*"} == 0
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"

      - alert: KafkaConsumerLag
        expr: kafka_consumer_group_lag > 10000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Kafka consumer lag on {{ $labels.topic }}"

      - alert: LowDiskSpace
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.15
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Low disk space on {{ $labels.instance }}"

      - alert: DatabaseConnectionPoolExhausted
        expr: pg_stat_activity_count > pg_settings_max_connections * 0.85
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL connection pool near exhaustion"
```

---

## Terraform — Core Infrastructure

### infrastructure/terraform/modules/eks/main.tf
```hcl
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = "1.29"

  vpc_id     = var.vpc_id
  subnet_ids = var.private_subnet_ids

  cluster_endpoint_private_access = true
  cluster_endpoint_public_access  = false

  cluster_addons = {
    coredns    = { most_recent = true }
    kube-proxy = { most_recent = true }
    vpc-cni    = { most_recent = true }
    aws-ebs-csi-driver = { most_recent = true }
  }

  eks_managed_node_groups = {
    general = {
      instance_types = ["t3.xlarge"]
      min_size       = 6
      max_size       = 30
      desired_size   = 6
      disk_size      = 100
      labels = { role = "general" }
    }
    gpu = {
      instance_types = ["g4dn.xlarge"]
      min_size       = 2
      max_size       = 8
      desired_size   = 2
      labels = { role = "gpu" }
      taints = [{ key = "nvidia.com/gpu", effect = "NO_SCHEDULE" }]
    }
    memory = {
      instance_types = ["r5.xlarge"]
      min_size       = 3
      max_size       = 10
      desired_size   = 3
      labels = { role = "memory" }
    }
  }

  tags = var.common_tags
}
```

### infrastructure/terraform/environments/production/main.tf
```hcl
terraform {
  required_version = ">= 1.5"
  backend "s3" {
    bucket         = "mediflow-terraform-state-prod"
    key            = "production/terraform.tfstate"
    region         = "me-south-1"
    encrypt        = true
    dynamodb_table = "mediflow-terraform-locks"
  }
}

module "vpc" {
  source = "../../modules/vpc"
  environment     = "production"
  vpc_cidr        = "10.0.0.0/16"
  azs             = ["me-south-1a", "me-south-1b", "me-south-1c"]
  private_subnets = ["10.0.10.0/23", "10.0.12.0/23", "10.0.14.0/23"]
  public_subnets  = ["10.0.1.0/24",  "10.0.2.0/24",  "10.0.3.0/24"]
  data_subnets    = ["10.0.20.0/24", "10.0.21.0/24", "10.0.22.0/24"]
}

module "eks" {
  source             = "../../modules/eks"
  cluster_name       = "mediflow-production"
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  common_tags        = local.common_tags
}

module "rds" {
  source             = "../../modules/rds"
  identifier         = "mediflow-production"
  instance_class     = "db.r6g.2xlarge"
  allocated_storage  = 500
  max_storage        = 2000
  multi_az           = true
  read_replicas      = 2
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.data_subnet_ids
  common_tags        = local.common_tags
}

module "elasticache" {
  source          = "../../modules/elasticache"
  cluster_id      = "mediflow-production"
  node_type       = "cache.r6g.xlarge"
  num_shards      = 3
  replicas_per_shard = 2
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.data_subnet_ids
  common_tags     = local.common_tags
}
```

---

## Backup Strategy

```
POSTGRESQL:
  - Continuous WAL archiving to S3 (PITR — point-in-time recovery)
  - Daily automated snapshot: retained 35 days
  - Weekly snapshot: retained 1 year
  - Monthly snapshot: retained 7 years
  - Cross-region copy: daily snapshot copied to DR region

REDIS:
  - AOF (append-only file) persistence: fsync every second
  - Daily RDB snapshot to S3
  - Retained 7 days

ELASTICSEARCH:
  - Snapshot repository: S3
  - Hourly incremental snapshots
  - Daily full snapshots retained 30 days

S3:
  - Versioning enabled on all buckets
  - Cross-region replication: primary → DR
  - Lifecycle rules:
    - prescription bucket: move to Glacier after 2 years
    - audit logs: move to Glacier after 1 year
    - media: move to IA after 90 days

BACKUP TESTING:
  - Monthly restore drill from backup
  - Quarterly DR failover simulation
  - Results documented in runbook
```
