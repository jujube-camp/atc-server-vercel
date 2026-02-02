# Single-stage build for Smart ATC Backend
# NOTE: Build from within atc-server/ directory with:
#   docker build -f Dockerfile -t atc-server .
#
# Usage:
#   Production: docker build -f Dockerfile -t atc-server .
#   Development: docker build -f Dockerfile -t atc-server --build-arg NODE_ENV=development .

# Use node:20-bullseye-slim (Debian Bullseye) which has OpenSSL 1.1 by default
# This is required for Prisma 5.22.0 which needs libssl.so.1.1
FROM node:20-bullseye-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Build atc-server
WORKDIR /app/atc-server

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm prisma:generate

# Build TypeScript
RUN pnpm build

# Verify .env files are copied (for debugging)
RUN ls -la .env* || echo "No .env files found"

# RUN apt-get update -y && apt-get install -y python3

# RUN update-alternatives --install /usr/bin/python python /usr/bin/python3 10

# RUN apt-get install -y python3-pip

# RUN pip3 install requests

# Expose port
EXPOSE 3000

CMD ["sh", "-c", "pnpm start"]
