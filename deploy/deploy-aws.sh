#!/bin/bash

# Build and deploy Docker image to AWS ECR and update EC2 container
# Usage: ./deploy/deploy-aws.sh [--skip-build] [--skip-ec2]
#   --skip-build: Skip Docker build (use existing image)
#   --skip-ec2: Skip EC2 update (only build and push to ECR)

set -e

# Configuration
AWS_REGION=${AWS_REGION:-us-west-2}
APP_NAME=${APP_NAME:-atc-server}
AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text 2>/dev/null)}
EC2_HOST=${EC2_HOST:-35.80.17.160}
EC2_USER=${EC2_USER:-ubuntu}
EC2_SSH_KEY=${EC2_SSH_KEY:-~/.ssh/arcadea-server-key.pem}
CONTAINER_NAME=${CONTAINER_NAME:-atc-server}
SKIP_BUILD=${SKIP_BUILD:-false}
SKIP_EC2=${SKIP_EC2:-false}

# Check for flags
for arg in "$@"; do
  if [[ "$arg" == "--skip-build" ]]; then
    SKIP_BUILD=true
  elif [[ "$arg" == "--skip-ec2" ]]; then
    SKIP_EC2=true
  fi
done

# Validation
if ! command -v aws &> /dev/null; then
  echo "❌ AWS CLI not installed"
  exit 1
fi

if ! command -v docker &> /dev/null || ! docker info &> /dev/null; then
  echo "❌ Docker not running"
  exit 1
fi

if [ -z "$AWS_ACCOUNT_ID" ]; then
  echo "❌ Could not determine AWS Account ID. Configure AWS CLI."
  exit 1
fi

ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${APP_NAME}"

# Verify ECR repository exists
if ! aws ecr describe-repositories --repository-names "$APP_NAME" --region "$AWS_REGION" &>/dev/null; then
  echo "❌ ECR repository '$APP_NAME' does not exist."
  echo "   Run ./deploy/setup-aws.sh first to create the repository."
  exit 1
fi

echo "🚀 Deploying to ECR"
echo "Region: $AWS_REGION | Account: $AWS_ACCOUNT_ID | Repository: $APP_NAME"
echo ""

# Login to ECR
echo "🔐 Logging into ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_URI" &>/dev/null
echo "✅ Logged in"

# Build Docker image for ARM, tag and push (unless skipped)
if [[ "$SKIP_BUILD" == "false" ]]; then
  echo "🐳 Building Docker image for linux/arm64..."
  # Script is in atc-server/deploy/, so we need to go up two levels to project root
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  cd "$PROJECT_ROOT"
  docker build \
    --platform linux/arm64 \
    -f atc-server/Dockerfile \
    -t "$APP_NAME:latest" \
    .
  cd "$SCRIPT_DIR/.."
  echo "✅ Image built (linux/arm64)"
  
  # Tag and push
  echo "📤 Pushing image to ECR..."
  docker tag "$APP_NAME:latest" "${ECR_URI}:latest"
  docker push "${ECR_URI}:latest"
  echo "✅ Image pushed"
else
  echo "⏭️  Skipping Docker build and push (image should already be in ECR)"
fi

# Update EC2 container if configured
if [[ "$SKIP_EC2" == "false" ]]; then
  if [ -z "$EC2_HOST" ]; then
    echo ""
    echo "⚠️  EC2_HOST not set. Skipping EC2 update."
    echo "   Set EC2_HOST environment variable to update EC2 container."
    echo "   Example: EC2_HOST=ec2-xx-xx-xx-xx.us-west-2.compute.amazonaws.com ./deploy/deploy-aws.sh"
    echo ""
  elif [ -z "$EC2_SSH_KEY" ]; then
    echo ""
    echo "⚠️  EC2_SSH_KEY not set. Skipping EC2 update."
    echo "   Set EC2_SSH_KEY environment variable to update EC2 container."
    echo "   Example: EC2_SSH_KEY=~/.ssh/my-key.pem ./deploy/deploy-aws.sh"
    echo ""
  else
    echo ""
    echo "🔄 Updating EC2 container..."
    
    # Prepare SSH command
    SSH_CMD="ssh -i $EC2_SSH_KEY -o StrictHostKeyChecking=no $EC2_USER@$EC2_HOST"
    
    # Login to ECR on EC2
    echo "  🔐 Logging into ECR on EC2..."
    # Login to ECR (credentials will be stored directly in config.json)
    $SSH_CMD "aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URI" || {
      echo "❌ Failed to login to ECR on EC2"
      exit 1
    }
    
    # Pull latest image
    echo "  📥 Pulling latest image..."
    $SSH_CMD "docker pull ${ECR_URI}:latest" || {
      echo "❌ Failed to pull image on EC2"
      exit 1
    }
    
    # Stop and remove old container
    echo "  🛑 Stopping old container..."
    $SSH_CMD "docker stop $CONTAINER_NAME 2>/dev/null || true"
    $SSH_CMD "docker rm $CONTAINER_NAME 2>/dev/null || true"
    
    # Run new container (using existing env file if it exists)
    echo "  ▶️  Starting new container..."
    if $SSH_CMD "test -f .env"; then
      # Fix .env file: remove quotes from values (Docker --env-file includes quotes as part of value)
      echo "  🔧 Cleaning .env file (removing quotes from values)..."
      $SSH_CMD "python3 -c \"
import re
with open('.env', 'r') as f:
    lines = f.readlines()
with open('.env', 'w') as f:
    for line in lines:
        # Remove quotes from values: KEY=\"value\" -> KEY=value
        line = re.sub(r'^([^=]+)=\"([^\"]+)\"$', r'\\1=\\2', line)
        line = re.sub(r'^([^=]+)=\'([^\']+)\'$', r'\\1=\\2', line)
        f.write(line)
\"" || true
      $SSH_CMD "docker run -d \
        --name $CONTAINER_NAME \
        --restart unless-stopped \
        -p 3000:3000 \
        --env-file .env \
        ${ECR_URI}:latest" || {
        echo "❌ Failed to start container on EC2"
        exit 1
      }
    else
      echo "  ⚠️  No .env file found on EC2. Starting container without env file."
      echo "     Make sure to set environment variables manually or create .env file."
      $SSH_CMD "docker run -d \
        --name $CONTAINER_NAME \
        --restart unless-stopped \
        -p 3000:3000 \
        ${ECR_URI}:latest" || {
        echo "❌ Failed to start container on EC2"
        exit 1
      }
    fi
    
    
    echo "✅ EC2 container updated"
  fi
fi

echo ""
echo "✅ Deployment complete!"
echo "Image URI: ${ECR_URI}:latest"
