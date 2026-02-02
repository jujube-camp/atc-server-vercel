# Smart ATC Backend Server (Vercel + Neon)

This repository is the **Vercel + Neon** deployment of the Smart ATC backend. It was created by copying from `atc-server` and adapting for Vercel serverless and Neon PostgreSQL. The original `atc-server` (EC2 + RDS) is unchanged.

Backend API for the Smart ATC training application.

## Prerequisites

- **Node.js** 20+
- **pnpm** 8+ (or Docker for Docker-based setup)
- **PostgreSQL** (if running with pnpm locally)

## Running Locally

### Option 1: Docker (Recommended)

The easiest way to run everything locally with Docker:

```bash
# From the atc-server directory
docker-compose up
```

This will:
- Start PostgreSQL database
- Build and start the server
- Load environment variables from `.env.development`

The server will be available at http://localhost:3000

**To stop:**
```bash
docker-compose down
```

### Option 2: pnpm (Local Development)

For local development with hot reload:

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up database:**
   - Start PostgreSQL (locally or via Docker)
   - Ensure `DATABASE_URL` in `.env.development` points to your database

3. **Generate Prisma client and run migrations:**
   ```bash
   pnpm prisma:generate
   pnpm prisma:migrate
   ```

4. **Sync Airports Information:**
   ```bash
   pnpm sync:airports:dev
   ```

5. **Start development server:**
   ```bash
   pnpm dev
   ```

The server will be available at http://localhost:3000 with hot reload.

## Environment Variables

Required variables (in `.env.development`):

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT (min 32 characters)
- `OPENAI_API_KEY` - OpenAI API key
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `LOG_LEVEL` - Logging level (info, debug, etc.)

Optional variables for AWS S3 audio storage:

- `AWS_REGION` - AWS region (e.g., us-west-2)
- `AWS_S3_AUDIO_BUCKET` - S3 bucket name for audio files
- `AWS_S3_AUDIO_PREFIX` - S3 object prefix (default: cockpit/audio)
- `AWS_S3_AUDIO_BASE_URL` - Custom CDN URL (optional)

For complete environment variable documentation, see [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)

## API Endpoints

- `GET /health` - Health check
- `POST /api/v1/auth/register` - Register user
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/sessions` - Create session
- `GET /api/v1/sessions` - List sessions
- `POST /api/v1/communication/transmission` - Process communication
- `POST /api/v1/phases/:sessionId/advance` - Advance phase

## Development Commands

```bash
pnpm dev              # Start dev server with hot reload
pnpm build            # Build TypeScript
pnpm start            # Run production server
pnpm test             # Run tests
pnpm prisma:studio    # Open Prisma Studio (database GUI)
pnpm prisma:migrate   # Run database migrations (local dev)
```

## Project Structure

```
atc-server/
├── src/              # Source code
├── prisma/           # Database schema & migrations
├── docs/             # Architecture & design documentation
├── docker-compose.yml # Docker setup for local dev
├── Dockerfile        # Docker image definition
└── .env.development  # Development environment variables
```

## Documentation

### Architecture & Design
- **[LLM Agent Decomposition](./docs/llm-agent-decomposition.md)** - Planned architectural improvement to split monolithic LLM into 3 specialized agents for 60% faster response times
- [ATC Simulation Flow Design](./docs/atc-simulation-flow-design.md) - Current event flow design
- [Backend Server MVP Design](./docs/backend-server-mvp-design.md) - Original MVP architecture
- [Complete Flight Simulation](./docs/complete-flight-simulation.md) - Full flight simulation flow
- [LLM Regression Testing](./docs/llm-regression-testing.md) - Testing strategy for LLM components

### Configuration & Features
- **[S3 Audio Storage](./docs/S3_AUDIO_STORAGE.md)** - AWS S3 integration for storing user voice and Fish Audio TTS responses
- [Environment Variables](./docs/ENVIRONMENT_VARIABLES.md) - Complete environment variable configuration guide

## Deployment

For production deployment to AWS, see `deploy/deploy-aws.sh`.

## License

MIT
