# API Routes - Reorganized Structure

## Route Organization Philosophy

Routes are now organized by **domain concern** rather than technical implementation:

### 🎯 Events (User Actions)
**Route Group**: `/api/v1/events`  
**Controller**: `EventController`  
**Purpose**: User-triggered actions/events

- `POST /events/transmission` - Pilot speaks on radio
- `POST /events/phase-advance` - Pilot advances to next phase

**Rationale**: Both transmission and phase advance are **user-initiated events**. They represent actions the pilot takes, so they belong together.

### 📋 Evaluation (Assessment/Queries)
**Route Group**: `/api/v1/evaluation`  
**Controller**: `EvaluationController`  
**Purpose**: Assess state and check requirements

- `POST /evaluation/requirements` - Check if pilot can advance (evaluates full session history)

**Rationale**: Evaluation is a **query/assessment operation**, not an action. It checks state without changing it.

### 📝 Sessions (Resource Management)
**Route Group**: `/api/v1/sessions`  
**Controller**: `SessionController`  
**Purpose**: Session lifecycle management

- `GET /sessions` - List sessions
- `POST /sessions` - Create session
- `GET /sessions/:sessionId` - Get session details
- `GET /sessions/:sessionId/records` - Get session records
- `GET /sessions/:sessionId/summary` - Get session summary

### 🔐 Auth (Authentication)
**Route Group**: `/api/v1/auth`  
**Controller**: `AuthController`  
**Purpose**: User authentication

- `POST /auth/register` - Register user
- `POST /auth/login` - Login user
- `GET /auth/me` - Get current user

### 🔊 TTS (Text-to-Speech)
**Route Group**: `/api/v1/tts`  
**Controller**: `TTSController`  
**Purpose**: Audio generation

- `GET /tts/fish-audio/stream` - Generate TTS audio

### ✈️ Airports (Reference Data)
**Route Group**: `/api/v1/airports`  
**Controller**: `AirportController`  
**Purpose**: Airport information

- `GET /airports/:icaoCode` - Get airport by ICAO code

### 📱 Version (App Version Check)
**Route Group**: `/api/v1/version`  
**Controller**: `VersionController`  
**Purpose**: Check app version and enforce updates

- `POST /version/check` - Check if app version is up to date

---

## Endpoint Details

### Event Endpoints

#### POST /api/v1/events/transmission
**Process a pilot transmission (speaking on radio)**

**Request:**
```json
{
  "sessionId": "session_123",
  "currentPhase": "parking-startup",
  "audioData": "base64_encoded_audio",
  "audioMimeType": "audio/m4a",
  "radioFrequency1": "121.9"
}
```

**Response:** (Fast - ~1.5s)
```json
{
  "success": true,
  "transcription": "Ground, November one two three alpha bravo, ready to taxi",
  "atcResponse": {
    "message": "November one two three alpha bravo, taxi to runway two eight left via Alpha"
  }
}
```

**Processing:**
1. Transcribe audio (OpenAI Whisper)
2. Store pilot transmission
3. Call ATC Agent → Get ATC response
4. Store ATC transmission if generated
5. Trigger async evaluation (background)
6. Return response immediately

---

#### POST /api/v1/events/phase-advance
**Advance pilot to next phase**

**Request:**
```json
{
  "sessionId": "session_123",
  "currentPhase": "parking-startup",
  "nextPhase": "taxi-runup"
}
```

**Response:**
```json
{
  "success": true,
  "newPhase": "taxi-runup",
  "isComplete": false,
  "atcMessage": {
    "message": "November one two three alpha bravo, San Jose Tower, runway two eight left, cleared for takeoff"
  }
}
```

**Processing:**
1. Validate phase transition
2. Update session phase
3. Create phase advance event
4. If tower initiates → Call ATC Agent
5. Store ATC transmission if generated
6. Return response

---

### Evaluation Endpoints

#### POST /api/v1/evaluation/requirements
**Evaluate if pilot has met all requirements to advance**

**Request:**
```json
{
  "sessionId": "session_123",
  "currentPhase": "parking-startup"
}
```

**Response:**
```json
{
  "should_advance": true,
  "next_phase": "taxi-runup",
  "requirements_checklist": [
    {
      "requirement_text": "Pilot has obtained ATIS",
      "met": true,
      "reason": "Pilot stated 'with information Bravo'"
    },
    {
      "requirement_text": "Pilot has contacted Ground",
      "met": true,
      "reason": "Pilot transmitted to Ground frequency"
    }
  ]
}
```

**Processing:**
1. Get session (validate ownership)
2. Get airport information
3. Call State Transition Agent → Evaluates **entire session history**
4. Return advancement decision

**Note**: This endpoint evaluates the **complete session history**, not just a single transmission. It considers all transmissions and phase advances to determine if requirements are met.

---

#### POST /api/v1/version/check
**Check if the app version is up to date**

**Request:**
```json
{
  "currentVersion": "0.1.5",
  "platform": "ios"
}
```

**Response:**
```json
{
  "isUpdateRequired": false,
  "isUpdateAvailable": false,
  "minimumVersion": "0.1.5",
  "latestVersion": "0.1.5",
  "currentVersion": "0.1.5",
  "updateMessage": "You are using the latest version.",
  "updateUrl": "https://apps.apple.com/app/aviate-ai/id6754862272"
}
```

**Processing:**
1. Compare current version with minimum required version
2. Compare current version with latest available version
3. Return update status and appropriate message
4. If `isUpdateRequired` is true, the app should block usage until updated

---

## Client Usage Flow

### Typical User Flow

```typescript
// 1. Pilot speaks on radio
const transmissionResult = await apiClient.post('/events/transmission', {
  sessionId,
  currentPhase,
  audioData,
  audioMimeType,
});

// 2. Display transcription
console.log('Pilot said:', transmissionResult.transcription);

// 3. Get TTS audio for ATC response
if (transmissionResult.atcResponse) {
  const audio = await apiClient.get('/tts/fish-audio/stream', {
    params: { text: transmissionResult.atcResponse.message }
  });
  playAudio(audio);
}

// 4. Check if pilot can advance (call when ready)
const evaluationResult = await apiClient.post('/evaluation/requirements', {
  sessionId,
  currentPhase,
});

if (evaluationResult.should_advance) {
  // Enable advance button
  showAdvanceButton(evaluationResult.next_phase);
}

// Show requirements checklist
displayRequirements(evaluationResult.requirements_checklist);

// 5. When user clicks advance
if (userClicksAdvance) {
  const advanceResult = await apiClient.post('/events/phase-advance', {
    sessionId,
    currentPhase,
    nextPhase: evaluationResult.next_phase,
  });
  
  // Get TTS for phase entry message
  if (advanceResult.atcMessage) {
    const audio = await apiClient.get('/tts/fish-audio/stream', {
      params: { text: advanceResult.atcMessage.message }
    });
    playAudio(audio);
  }
}
```

---

## File Structure

```
atc-server/src/
├── controllers/
│   ├── eventController.ts           # Handles user actions (transmission, phase advance)
│   ├── evaluationController.ts      # Handles assessments (requirements check)
│   ├── sessionController.ts         # Session management
│   ├── authController.ts            # Authentication
│   ├── ttsController.ts             # Text-to-speech
│   └── airportController.ts         # Airport data
│
├── routes/
│   ├── event-routes.ts              # /api/v1/events/*
│   ├── evaluation-routes.ts         # /api/v1/evaluation/*
│   ├── sessions.ts                  # /api/v1/sessions/*
│   ├── auth.ts                      # /api/v1/auth/*
│   ├── tts-routes.ts                # /api/v1/tts/*
│   └── airports.ts                  # /api/v1/airports/*
│
├── services/
│   ├── atcAgentService.ts           # ATC response generation
│   ├── evaluationAgentService.ts    # Pilot communication assessment
│   ├── stateTransitionAgentService.ts # Requirement validation
│   ├── communication-service.ts     # Transmission processing logic
│   ├── phaseService.ts              # Phase advancement logic
│   └── ...
│
└── server.ts                        # Route registration
```

---

## Migration from Old Routes

### Old Routes (Deprecated)
- ❌ `POST /communication/transmission` → ✅ `POST /events/transmission`
- ❌ `POST /phases/:sessionId/advance` → ✅ `POST /events/phase-advance`
- ❌ `POST /communication/evaluate-state` → ✅ `POST /evaluation/requirements`

### Changes Required in Client

```typescript
// OLD
await apiClient.post('/communication/transmission', { ... });
await apiClient.post(`/phases/${sessionId}/advance`, { ... });
await apiClient.post('/communication/evaluate-state', { ... });

// NEW
await apiClient.post('/events/transmission', { ... });
await apiClient.post('/events/phase-advance', { sessionId, ... });
await apiClient.post('/evaluation/requirements', { ... });
```

---

## Benefits of New Organization

### 1. **Clear Domain Separation**
- Events = Actions (changes state)
- Evaluation = Queries (reads state)
- This follows CQRS (Command Query Responsibility Segregation) principles

### 2. **Intuitive Naming**
- `/events/transmission` - clearly an event
- `/events/phase-advance` - clearly an event
- `/evaluation/requirements` - clearly a query/assessment

### 3. **Better Discoverability**
- All user actions in one place (`/events`)
- All assessments in one place (`/evaluation`)
- Easy to find related endpoints

### 4. **Future Extensibility**
- Easy to add new event types: `/events/emergency`, `/events/frequency-change`
- Easy to add new evaluations: `/evaluation/performance`, `/evaluation/score`

---

**Status**: ✅ Implemented and building successfully  
**Breaking Changes**: Yes - client needs to update endpoint URLs  
**Backward Compatibility**: Old routes removed (clean break)

