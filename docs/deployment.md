# Production Deployment Guide

This guide details how to deploy the **Distributed Job Scheduling Platform** to production environments.

---

## Deployment Options Overview

1. **Option 1: Docker Compose on VPS (Recommended)** — Easiest, full multi-container stack on any cloud server (AWS EC2, DigitalOcean, Hetzner, Linode).
2. **Option 2: Cloud PaaS / Managed Services** — Managed Postgres/Redis/RabbitMQ with Render, Railway, or Fly.io.
3. **Option 3: Kubernetes (K8s)** — For high-scale enterprise deployments.

---

## Option 1: VPS / Cloud Server Deployment (Recommended)

### Prerequisites
- Any Linux Virtual Private Server (Ubuntu 22.04 LTS or newer recommended)
- Minimum System Specifications: **2 vCPU, 2GB RAM**
- Domain name pointed to your VPS IP (e.g., `scheduler.yourdomain.com`)

---

### Step 1: Install Docker and Docker Compose on Server

Log in to your VPS via SSH and install Docker:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git docker.io docker-compose-v2
sudo systemctl enable --now docker
```

---

### Step 2: Clone Repository

```bash
git clone https://github.com/Ramprasadlondhe2005/Distributed-Job-Scheduling-Platform.git
cd Distributed-Job-Scheduling-Platform
```

---

### Step 3: Configure Environment Variables

Create a production `.env` file:

```bash
nano .env
```

Add your production configuration:

```env
NODE_ENV=production

# Database & Infrastructure
DATABASE_URL=postgresql://scheduler:CHANGE_THIS_DB_PASSWORD@postgres:5432/scheduler
RABBITMQ_URL=amqp://scheduler:CHANGE_THIS_RABBITMQ_PASSWORD@rabbitmq:5672
REDIS_URL=redis://redis:6379

# Auth Secrets (MUST be strong secret strings!)
JWT_SECRET=production-secret-jwt-key-replace-with-random-32-chars
JWT_EXPIRES_IN=8h

# Admin Bootstrap Credentials
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_NAME=Platform Admin
ADMIN_PASSWORD=ProductionPassword123!

# Rate Limiting
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX_REQUESTS=120

# Service Ports & Settings
API_GATEWAY_PORT=3000
WORKER_CONCURRENCY=2
SCHEDULER_POLL_INTERVAL_MS=5000
```

---

### Step 4: Build & Launch Container Stack

```bash
docker compose up -d --build
```

Verify that all 9 containers are healthy and running:

```bash
docker compose ps
```

Expected running services:
- `dashboard` (Nginx serving frontend)
- `api-gateway`
- `job-service`
- `execution-service`
- `scheduler-service`
- `worker-service`
- `postgres`
- `rabbitmq`
- `redis`

---

### Step 5: Setup Nginx Reverse Proxy with HTTPS (SSL)

Install Nginx and Certbot on your host machine for free SSL certificates:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create Nginx site configuration:

```bash
sudo nano /etc/nginx/sites-available/scheduler
```

Paste configuration:

```nginx
server {
    server_name scheduler.yourdomain.com;

    # Frontend Dashboard
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API Gateway
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Auth Endpoints
    location /auth/ {
        proxy_pass http://localhost:3000/auth/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site and request SSL certificate:

```bash
sudo ln -s /etc/nginx/sites-available/scheduler /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d scheduler.yourdomain.com
```

---

## Maintenance & Operational Commands

### View Container Logs

```bash
# View logs for all services
docker compose logs -f

# View logs for specific microservice
docker compose logs -f worker-service
docker compose logs -f api-gateway
```

### Update Deployment (Pull & Restart)

```bash
git pull origin main
docker compose up -d --build
```

### Backup Database

```bash
docker compose exec postgres pg_dump -U scheduler scheduler > backup_$(date +%Y%m%d).sql
```

---

## PaaS / Managed Cloud Services (Render / Railway)

If deploying to Managed Cloud Providers without a full VPS:
1. **Managed Database:** Supabase / Neon PostgreSQL
2. **Managed Queue:** CloudAMQP (RabbitMQ)
3. **Managed Caching:** Upstash Redis
4. **Backend Services:** Deploy `api-gateway`, `job-service`, `execution-service`, `scheduler-service`, and `worker-service` as Docker Web Services on Render / Railway.
5. **Frontend:** Deploy `frontend/dashboard` on Vercel or Netlify pointing `VITE_API_BASE_URL` to your API Gateway URL.
