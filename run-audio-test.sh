#!/bin/bash

# OpenAI Audio Test Runner
# This script runs the OpenAI audio test with proper environment setup

echo "🎯 OpenAI Audio Test Runner"
echo "=========================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the atc-server directory"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found"
    echo "Please make sure you have set OPENAI_API_KEY in your environment or .env file"
    echo ""
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Run the test
echo "🚀 Running OpenAI Audio Test..."
echo ""

# Use tsx to run the TypeScript file directly
npx tsx test-openai-audio.ts



