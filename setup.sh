#!/bin/bash

# Smart ATC Server Setup Script
# This script helps you set up the development environment

set -e

echo "🚀 Smart ATC Server Setup"
echo "=========================="
echo ""

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Installing pnpm..."
    npm install -g pnpm
fi

# Check if Docker is running (for local database)
if command -v docker &> /dev/null && docker info &> /dev/null; then
    echo "✅ Docker is running"
    echo ""
    echo "Starting PostgreSQL database..."
    docker-compose up -d
    echo "⏳ Waiting for database to be ready..."
    sleep 5
else
    echo "⚠️  Docker is not running. You'll need to provide your own PostgreSQL database."
    echo "   Update DATABASE_URL in your .env file."
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "Creating .env file..."
    cp env.example .env
    
    # Generate a random JWT secret
    JWT_SECRET=$(openssl rand -base64 32)
    
    # Update .env with generated secret
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|JWT_SECRET=.*|JWT_SECRET=\"$JWT_SECRET\"|" .env
        sed -i '' "s|DATABASE_URL=.*|DATABASE_URL=\"postgresql://postgres:postgres@localhost:5432/smart_atc?schema=public\"|" .env
    else
        # Linux
        sed -i "s|JWT_SECRET=.*|JWT_SECRET=\"$JWT_SECRET\"|" .env
        sed -i "s|DATABASE_URL=.*|DATABASE_URL=\"postgresql://postgres:postgres@localhost:5432/smart_atc?schema=public\"|" .env
    fi
    
    echo "✅ Created .env file with generated JWT secret"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "Installing dependencies..."
pnpm install

echo ""
echo "Generating Prisma client..."
pnpm prisma:generate

echo ""
echo "Running database migrations..."
pnpm prisma:migrate

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Review your .env file and update if needed"
echo "  2. Run 'pnpm dev' to start the development server"
echo "  3. Visit http://localhost:3000/health to verify"
echo ""

