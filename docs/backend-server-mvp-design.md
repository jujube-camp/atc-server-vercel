# Smart ATC Backend MVP Design

## 1. Overview
- **Objective:** Ship a minimal Fastify backend that lets pilots sign up, log in, and run self-guided ATC training sessions.
- **Stack:** TypeScript, Fastify, Zod, Prisma, PostgreSQL. pnpm for package management.
- **Client:** Expo mobile app (single consumer in MVP).
- **Guiding Principle:** Prefer the simplest thing that supports current flows; defer advanced automation, analytics, and tooling to later iterations.

## 2. MVP Scope
- Single-tenant deployment (one environment shared by all pilots).
- Basic authentication (email + password) with stateless JWT access token (60 min) issued on login.
- Session management limited to: create session, append turns, fetch session with transcript.
- No admin roles, no manual review tooling, no AI callbacks. All scoring handled on client for now.
- Health check endpoint for deployment verification only.

Out of scope for MVP:
- Refresh tokens or token revocation lists.
- Background workers, queues, or event buses.
- Phase validation beyond checking the phase ID exists in the canonical list.
- Observability stack (metrics, tracing). Console logging is sufficient.

## 3. Functional Requirements

### Authentication
- **Register:** `POST /api/v1/auth/register` accepts `{ email, password, displayName? }`.
- **Login:** `POST /api/v1/auth/login` returns `{ token, user }`.

### Session Management
- **Create Session:** `POST /api/v1/sessions` with `{ airportIcao, aircraftTailNumber, initialPhaseId }`. Defaults to first phase when missing.
- **Fetch Session:** `GET /api/v1/sessions/:sessionId` returns session metadata + events (ordered).
- **List Sessions:** `GET /api/v1/sessions` returns latest 20 sessions for current user.

### Event Processing (New API Design)
The client sends three types of requests to `POST /api/v1/sessions/:sessionId/events`:

#### 1. Broadcast Event
**When:** User presses PTT button and says something
**Request:**
```json
{
  "event_type": "broadcast",
  "sender": "PILOT",
  "message_content": "Ground, N123AB ready to taxi",
  "current_phase": "parking-startup",
  "audio_binary": "base64...", // optional
  "audio_mime_type": "audio/m4a" // optional
}
```
**Response:**
```json
{
  "id": "event123",
  "sequence": 1,
  "sender": "PILOT",
  "event_type": "broadcast",
  "message_content": "Ground, N123AB ready to taxi",
  "current_phase": "parking-startup",
  "audio_binary": "base64...", // if audio provided
  "audio_mime_type": "audio/m4a", // if audio provided
  "createdAt": "2024-01-01T00:00:00Z",
  "transcription": "Ground, N123AB ready to taxi", // if audio provided
  "feedback": "Good communication", // if audio provided
  "audioFilePath": "/path/to/audio.m4a", // if audio provided
  "atcResponse": {
    "sender": "ATC",
    "event_type": "broadcast",
    "message_content": "N123AB, Ground, cleared to start engines and taxi to runway 27L via taxiway Alpha",
    "current_phase": "parking-startup"
  }
}
```

#### 2. Heartbeat Event
**When:** Sent periodically to check if tower needs to say anything
**Request:**
```json
{
  "event_type": "heartbeat",
  "sender": "PILOT",
  "current_phase": "parking-startup"
}
```
**Response:**
```json
{
  "event_type": "heartbeat",
  "atcMessage": {
    "sender": "ATC",
    "event_type": "broadcast",
    "message_content": "N123AB, contact ground on 121.7",
    "current_phase": "parking-startup"
  }, // optional
  "shouldAdvance": false // optional
}
```

#### 3. Phase Advanced Event
**When:** User clicks arrow button to advance to next phase
**Request:**
```json
{
  "event_type": "phase_advanced",
  "sender": "PILOT",
  "current_phase": "parking-startup"
}
```
**Response:**
```json
{
  "event_type": "phase_advanced",
  "success": true,
  "newPhaseId": "taxi-runup",
  "isComplete": false,
  "atcMessage": {
    "sender": "ATC",
    "event_type": "phase_approved",
    "message_content": "N123AB, taxi to runway 27L via taxiway Alpha",
    "current_phase": "taxi-runup"
  } // optional
}
```


### System
- **Health Check:** `GET /health` returns `{ status: 'ok' }` after DB ping.

Backend controls phase advancement logic and generates appropriate ATC responses based on current phase and context.

## 4. Non-Functional Requirements
- **Performance:** Targets <300 ms p95 per request on small instance (Railway/Render free tier).
- **Availability:** Best-effort; single instance without redundancy is acceptable.
- **Security:** Store passwords using `bcrypt`. Require HTTPS at the platform layer.
- **Config:** `.env` with `DATABASE_URL`, `JWT_SECRET`, `PORT`.
- **Logging:** Pino with default settings writing to stdout.

## 5. Architecture
```
Expo Client → HTTPS → Fastify Routes → Prisma → PostgreSQL
```
- Single Fastify instance bootstrapped in `src/server.ts`.
- Routes defined in feature folders (`auth`, `sessions`, `turns`).
- Each route uses shared Zod schemas for validation.
- Minimal service layer: thin functions in route files calling Prisma directly.
- No worker processes or cron jobs.

## 6. Data Model (Prisma)
```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  displayName  String?
  sessions     Session[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Session {
  id                 String        @id @default(cuid())
  user               User          @relation(fields: [userId], references: [id])
  userId             String
  airportIcao        String
  aircraftTailNumber String
  currentPhaseId     String
  events             SessionEvent[]
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
}

model SessionEvent {
  id             String        @id @default(cuid())
  session        Session       @relation(fields: [sessionId], references: [id])
  sessionId      String
  sequence       Int
  sender         EventSender
  event_type     EventType
  message_content String?
  current_phase  String
  audio_binary   String?       // Base64-encoded audio data
  audio_mime_type String?      // MIME type of the audio
  createdAt      DateTime      @default(now())

  @@index([sessionId, sequence])
}

enum EventSender {
  PILOT
  ATC
}

enum EventType {
  broadcast
  heartbeat
  phase_approved
  phase_advanced
}
```
- `currentPhaseId` mirrors the front-end phase identifiers. No separate phase table initially.
- `sequence` increments per session inside transaction to keep order.

## 7. API Summary
| Method & Path | Auth | Description |
|---------------|------|-------------|
| `POST /api/v1/auth/register` | ❌ | Create new user; 201 on success. |
| `POST /api/v1/auth/login` | ❌ | Return JWT and user profile. |
| `GET /api/v1/sessions` | ✅ | Latest 20 sessions for user. |
| `POST /api/v1/sessions` | ✅ | Create new session record. |
| `GET /api/v1/sessions/:sessionId` | ✅ | Session + events. |
| `POST /api/v1/sessions/:sessionId/events` | ✅ | Process event request (broadcast/heartbeat/phase_advanced). |
| `GET /health` | ❌ | Deployment smoke test. |

- Authenticated routes expect `Authorization: Bearer <token>`.
- Errors follow `{ message, details? }`. Validation failures return 400.

## 8. Validation (Zod)
- Schema modules:
  - `authSchemas.ts`: register/login payloads.
  - `sessionSchemas.ts`: create session, append turn.
- Use `fastify-type-provider-zod` for type-safe handlers.
- Phase IDs validated against constant array imported from front-end shared package; reject unknown IDs.
- Message string trimmed, restricted to 1–500 characters.
- Phase advancement validates current phase and allows progression to next sequential phase only.

## 9. Phase Advancement Logic
**Two-step process: Server approves FIRST, then user advances**

- Backend maintains canonical phase order: `['parking-startup', 'taxi-runup', 'runup', 'hold-short', 'on-runway', 'airborne', 'cruising', 'approach', 'landing', 'taxi-back', 'shutdown']`.

### Step 1: Phase Approval (ATC → PILOT)
- Server/LLM determines pilot is ready to advance (during broadcast or heartbeat processing)
- Server creates and persists a `phase_approved` event (sender: ATC, event_type: phase_approved)
- This event is returned in the response (atcResponse or atcMessage field)
- Client receives approval and enables "Proceed" button

### Step 2: Phase Advanced (PILOT → Server)
- User taps "Proceed", sending `POST /api/v1/sessions/:sessionId/events` with phase_advanced event
- Server validates current phase matches and updates session.currentPhaseId to next phase
- Returns `{ event_type: "phase_advanced", success: true, newPhaseId, isComplete: boolean }` or validation error
- No complex scoring or AI validation in MVP - simple sequential progression

## 10. Deployment & Ops
- **Local dev:** `pnpm dev` runs Fastify with hot reload, using local Postgres (Docker) or Supabase project.
- **Migrations:** `npx prisma migrate dev` locally; `prisma migrate deploy` during deployment.
- **Hosting:** Deploy single container or Railway service; environment variables set in dashboard.
- **Monitoring:** Rely on host platform logs. Optional uptime check (Pingdom) hitting `/health`.
- **Backups:** Enable daily automatic backups on managed Postgres (free tier typically included).

## 11. Testing Strategy
- Unit tests for register/login/session routes using Vitest + Fastify inject.
- Use Prisma SQLite datasource for tests to avoid external dependency.
- Minimal happy-path coverage plus validation failure cases.
- Manual end-to-end verification via HTTP client (Hoppscotch/Postman) before release.

---

_Document status: MVP scope, ready for implementation._

