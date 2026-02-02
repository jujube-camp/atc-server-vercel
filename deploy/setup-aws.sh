#!/bin/bash

# First-time AWS setup: Create ECR repository
# Usage: ./deploy/setup-aws.sh

set -e

# Configuration
AWS_REGION=${AWS_REGION:-us-west-2}
APP_NAME=${APP_NAME:-atc-server}
AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text 2>/dev/null)}

# Validation
if ! command -v aws &> /dev/null; then
  echo "❌ AWS CLI not installed"
  exit 1
fi

if [ -z "$AWS_ACCOUNT_ID" ]; then
  echo "❌ Could not determine AWS Account ID. Configure AWS CLI."
  exit 1
fi

ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${APP_NAME}"

echo "🔧 Setting up AWS ECR repository"
echo "Region: $AWS_REGION | Account: $AWS_ACCOUNT_ID | Repository: $APP_NAME"
echo ""

# Create ECR repository if it doesn't exist
echo "📦 Creating ECR repository..."
if aws ecr describe-repositories --repository-names "$APP_NAME" --region "$AWS_REGION" &>/dev/null; then
  echo "✅ ECR repository already exists"
else
  aws ecr create-repository \
    --repository-name "$APP_NAME" \
    --region "$AWS_REGION" \
    --image-scanning-configuration scanOnPush=true
  echo "✅ ECR repository created"
fi

# Optional: Fix Docker credential helper on EC2 if credentials are provided
EC2_HOST=${EC2_HOST:-}
EC2_USER=${EC2_USER:-ubuntu}
EC2_SSH_KEY=${EC2_SSH_KEY:-}

if [ -n "$EC2_HOST" ] && [ -n "$EC2_SSH_KEY" ]; then
  echo ""
  echo "🔧 Fixing Docker credential helper on EC2..."
  SSH_CMD="ssh -i $EC2_SSH_KEY -o StrictHostKeyChecking=no $EC2_USER@$EC2_HOST"
  $SSH_CMD "mkdir -p ~/.docker && python3 -c \"import json, os; f=os.path.expanduser('~/.docker/config.json'); d=json.load(open(f)) if os.path.exists(f) else {}; d.pop('credHelpers', None); d.pop('credsStore', None); json.dump(d, open(f, 'w'), indent=2)\" 2>/dev/null || true" && {
    echo "✅ Docker credential helper fixed on EC2"
  } || {
    echo "⚠️  Could not fix Docker credential helper on EC2 (will be fixed during deployment)"
  }
fi

echo ""
echo "✅ Setup complete!"
echo "ECR URI: ${ECR_URI}"
echo ""
echo "Next steps:"
echo "1. Run ./deploy/deploy-aws.sh to build and deploy your Docker image"
if [ -z "$EC2_HOST" ] || [ -z "$EC2_SSH_KEY" ]; then
  echo "2. Set EC2_HOST and EC2_SSH_KEY environment variables to enable EC2 updates"
fi

