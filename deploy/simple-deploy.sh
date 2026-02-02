#!/bin/bash

set -e  # Exit on error

# Configuration
ECR_REGISTRY="928451053053.dkr.ecr.us-west-2.amazonaws.com"
ECR_REPOSITORY="atc-server"
ECR_REGION="us-west-2"
SSH_KEY="arcadea-server-key.pem"
CONTAINER_NAME="atc-server"

# Server list - add your servers here
SERVERS=(
  "ubuntu@ec2-35-80-17-160.us-west-2.compute.amazonaws.com"
  "ubuntu@ec2-34-222-207-106.us-west-2.compute.amazonaws.com"
)

# Build and push Docker image
echo "🔨 Building Docker image..."
docker build -f Dockerfile -t ${ECR_REPOSITORY}:latest .

echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region ${ECR_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

echo "📦 Tagging and pushing image..."
docker tag ${ECR_REPOSITORY}:latest ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest
docker push ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest

# Set SSH key permissions
chmod 400 "${SSH_KEY}"

# Function to deploy to a single server
deploy_to_server() {
  local server=$1
  echo ""
  echo "🚀 Deploying to ${server}..."

  echo "📋 Copying .env.production to server..."
  scp -i "${SSH_KEY}" .env.production "${server}:~/.env.production"
  if [ $? -ne 0 ]; then
    echo "❌ Failed to copy .env.production to ${server}"
    return 1
  fi
  echo "✅ .env.production copied successfully"

  
  # Capture SSH exit code properly
  ssh -i "${SSH_KEY}" "${server}" bash -s << EOF
ECR_REGISTRY="${ECR_REGISTRY}"
ECR_REPOSITORY="${ECR_REPOSITORY}"
ECR_REGION="${ECR_REGION}"
CONTAINER_NAME="${CONTAINER_NAME}"

echo "📥 Logging in to ECR..."
if ! aws ecr get-login-password --region \${ECR_REGION} | docker login --username AWS --password-stdin \${ECR_REGISTRY}; then
  echo "❌ Failed to login to ECR"
  exit 1
fi

echo "⬇️  Pulling latest image..."
if ! docker pull \${ECR_REGISTRY}/\${ECR_REPOSITORY}:latest; then
  echo "❌ Failed to pull image"
  exit 1
fi

echo "🛑 Stopping existing container..."
docker stop \${CONTAINER_NAME} 2>/dev/null || true

echo "🗑️  Removing existing container..."
docker rm \${CONTAINER_NAME} 2>/dev/null || true

echo "▶️  Starting new container..."
if ! docker run -d --name \${CONTAINER_NAME} --restart unless-stopped -p 3000:3000 -p 5555:5555 --env-file .env.production \${ECR_REGISTRY}/\${ECR_REPOSITORY}:latest; then
  echo "❌ Failed to start container"
  exit 1
fi

echo "⏳ Waiting for container to start..."
sleep 5

echo "🔍 Checking container status..."
CONTAINER_STATUS=\$(docker inspect -f '{{.State.Status}}' \${CONTAINER_NAME} 2>/dev/null || echo "not found")

if [ "\$CONTAINER_STATUS" = "running" ]; then
  echo "✅ Container is running successfully!"
  docker ps --filter name=\${CONTAINER_NAME} --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
  exit 0
else
  echo "❌ Container status: \$CONTAINER_STATUS"
  echo "📋 Container logs:"
  docker logs \${CONTAINER_NAME} 2>&1 | tail -20 || true
  exit 1
fi
EOF

  local ssh_exit_code=$?
  
  if [ $ssh_exit_code -eq 0 ]; then
    echo "✅ Successfully deployed to ${server}"
    return 0
  else
    echo "❌ Failed to deploy to ${server} (SSH exit code: $ssh_exit_code)"
    return 1
  fi
}

# Deploy to each server sequentially
for server in "${SERVERS[@]}"; do
  if deploy_to_server "${server}"; then
    echo "✅ Deployment to ${server} completed successfully"
  else
    echo "❌ Deployment to ${server} failed. Stopping deployment process."
    exit 1
  fi
done

echo ""
echo "🎉 All servers deployed successfully!"

# docker exec -it atc-server /bin/bash

# # Use the production-safe command
# pnpm prisma migrate diff --from-url "***" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/2025xxx_training_mode/migration.sql
# pnpm prisma:deploy:prod
# # pnpm prisma:migrate:prod

# nohup pnpm prisma:studio > /dev/null 2>&1 &

# sudo apt install postgresql-client

# psql -h database-atc-server-1.cra26uekm1qv.us-west-2.rds.amazonaws.com -p 5432 -U postgres -d smart-atc

# SELECT 
#   migration_name,
#   applied_steps_count,
#   started_at,
#   finished_at
# FROM _prisma_migrations
# ORDER BY started_at DESC;