# Production Deployment Guide

This guide details how to deploy the **Distributed Job Scheduling Platform** to production environments.

---

## ⚡ Quick Deployment: Render (Backend) + Netlify (Frontend) [100% FREE]

Yes! You can deploy the **Frontend on Netlify** and **Backend Microservices on Render** for **100% free**.

---

### Step 1: Set Up Free Cloud Databases & Message Queue

#### 1. PostgreSQL (Render Free Postgres)
1. Go to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **PostgreSQL**.
3. Name: `scheduler-db`, Region: Oregon (or nearest).
4. Click **Create Database**.
5. Copy the **Internal Database URL** (e.g. `postgresql://user:pass@dbservice:5432/scheduler`).

#### 2. Redis (Render Free Redis)
1. In Render Dashboard, click **New +** -> **Redis**.
2. Name: `scheduler-redis`.
3. Click **Create Redis**.
4. Copy the **Internal Redis URL** (e.g. `redis://redisservice:6379`).

#### 3. RabbitMQ (CloudAMQP Free Tier)
1. Sign up at [CloudAMQP.com](https://www.cloudamqp.com) (Free Little Lemur plan).
2. Click **Create New Instance** -> Name: `scheduler-queue`.
3. Select **Lemur (Free)** plan.
4. Copy your **AMQP URL** (e.g. `amqps://user:pass@hostname.rmq.cloudamqp.com/vhost`).

---

### Step 2: Deploy Backend to Render

1. In Render Dashboard, click **New +** -> **Web Service**.
2. Connect your GitHub repository: `Distributed-Job-Scheduling-Platform`.
3. Configuration:
   - **Name:** `scheduler-api`
   - **Environment:** `Docker`
   - **Docker Context Path:** `.`
   - **Docker Command / File:** Default Dockerfile / docker-compose
4. Add **Environment Variables** in Render:
   - `DATABASE_URL` = *(Your Render PostgreSQL Internal URL)*
   - `RABBITMQ_URL` = *(Your CloudAMQP URL)*
   - `REDIS_URL` = *(Your Render Redis Internal URL)*
   - `JWT_SECRET` = `your-super-secret-jwt-key-32-chars`
   - `ADMIN_EMAIL` = `admin@example.com`
   - `ADMIN_PASSWORD` = `YourPassword123!`
5. Click **Create Web Service**. Render will build and deploy your backend API Gateway URL (e.g., `https://scheduler-api.onrender.com`).

---

### Step 3: Deploy Frontend Dashboard to Netlify

1. Log in to [Netlify](https://app.netlify.com).
2. Click **Add new site** -> **Import an existing project**.
3. Select **GitHub** and authorize repo: `Distributed-Job-Scheduling-Platform`.
4. Configure Build Settings:
   - **Base directory:** `frontend/dashboard`
   - **Build command:** `npm run build`
   - **Publish directory:** `frontend/dashboard/dist`
5. Add **Environment Variable** in Netlify:
   - `VITE_API_BASE_URL` = `https://scheduler-api.onrender.com` *(Your Render API Gateway URL)*
6. Click **Deploy Site**. Netlify will build your dashboard in ~1 minute!

---

## 🐳 VPS / Cloud Server Deployment (Alternative Option)

### Prerequisites
- Any Linux Virtual Private Server (Ubuntu 22.04 LTS or newer recommended)
- Minimum System Specifications: **2 vCPU, 2GB RAM**

```bash
# 1. Install Docker & Compose
sudo apt update && sudo apt install -y git docker.io docker-compose-v2

# 2. Clone Repository
git clone https://github.com/Ramprasadlondhe2005/Distributed-Job-Scheduling-Platform.git
cd Distributed-Job-Scheduling-Platform

# 3. Configure .env
cp .env.example .env

# 4. Start Production Stack
docker compose up -d --build
```
