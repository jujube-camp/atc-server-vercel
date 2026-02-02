# Deployment Guide

Simple guide for deploying atc-server to AWS ECR and EC2.

## Prerequisites

- AWS CLI installed and configured
- Docker installed and running
- EC2 instance running (for EC2 deployment)
- SSH access to EC2 instance

## First-Time Setup

Run once to create the ECR repository:

```bash
./deploy/setup-aws.sh
```

Optional: If you have EC2 credentials, this will also fix Docker credential helper on EC2:

```bash
EC2_HOST=your-ec2-ip EC2_SSH_KEY=~/.ssh/your-key.pem ./deploy/setup-aws.sh
```

## Deploy to ECR and EC2

Build Docker image, push to ECR, and update EC2 container:

```bash
./deploy/deploy-aws.sh
```

**Options:**
- `--skip-build`: Skip Docker build (use existing local image)
- `--skip-ec2`: Only build and push to ECR (don't update EC2)

**Environment Variables:**
- `EC2_HOST`: EC2 instance IP or hostname (default: `35.80.17.160`)
- `EC2_SSH_KEY`: Path to SSH private key (default: `~/.ssh/arcadea-server-key.pem`)
- `EC2_USER`: EC2 username (default: `ubuntu`)
- `AWS_REGION`: AWS region (default: `us-west-2`)
- `APP_NAME`: ECR repository name (default: `atc-server`)

**Example:**
```bash
EC2_HOST=35.80.17.160 \
EC2_SSH_KEY=~/.ssh/my-key.pem \
./deploy/deploy-aws.sh
```

## EC2 Setup (First Time)

If your EC2 instance doesn't have Docker installed:

### 1. Install Docker

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@your-ec2-ip

# On EC2:
sudo apt-get update
sudo apt-get install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
# Log out and back in for group changes
```

### 2. Configure AWS CLI

If EC2 doesn't have an IAM role with ECR permissions:

```bash
sudo apt-get install -y awscli
aws configure
# Enter AWS credentials
```

### 3. Create .env File on EC2

```bash
cat > .env <<EOF
NODE_ENV=production
DATABASE_URL=postgresql://user:password@db-host:5432/smart_atc?schema=public
JWT_SECRET=your-jwt-secret-min-32-chars
OPENAI_API_KEY=sk-your-openai-key
PORT=3000
LOG_LEVEL=info
EOF

chmod 600 .env
```

**Important:** Do not use quotes around values in `.env` file. Docker's `--env-file` includes quotes as part of the value.

## What the Scripts Do

### `setup-aws.sh`
- Creates ECR repository if it doesn't exist
- Optionally fixes Docker credential helper on EC2

### `deploy-aws.sh`
- Verifies ECR repository exists
- Builds Docker image for ARM (linux/arm64)
- Pushes image to ECR
- If EC2 credentials provided:
  - Logs into ECR on EC2
  - Pulls latest image
  - Stops and removes old container
  - Starts new container with `.env` file
  - Cleans `.env` file (removes quotes from values)

## Troubleshooting

**"ECR repository does not exist"**
- Run `./deploy/setup-aws.sh` first

**"Docker credential helper error"**
- The deploy script automatically fixes this, but you can manually run:
  ```bash
  python3 -c "import json, os; f=os.path.expanduser('~/.docker/config.json'); d=json.load(open(f)) if os.path.exists(f) else {}; d.pop('credHelpers', None); d.pop('credsStore', None); json.dump(d, open(f, 'w'), indent=2)"
  ```

**"DATABASE_URL validation error"**
- Check `.env` file on EC2 - remove quotes around values
- Example: `DATABASE_URL=postgresql://...` not `DATABASE_URL="postgresql://..."`

**"Cannot connect to EC2"**
- Verify EC2_HOST and EC2_SSH_KEY are correct
- Check SSH key permissions: `chmod 600 ~/.ssh/your-key.pem`
- Verify security group allows SSH (port 22)

**"Port 3000 already in use"**
- Check what's using it: `sudo lsof -i :3000`
- Stop conflicting service or use different port

## Useful Commands

**View container logs:**
```bash
docker logs -f atc-server
```

**Check container status:**
```bash
docker ps
```

**Execute commands in container:**
```bash
docker exec -it atc-server sh
```

**Restart container:**
```bash
docker restart atc-server
```

