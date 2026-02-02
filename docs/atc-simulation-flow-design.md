# ATC Simulation Flow Design

## Overview
- Orchestrate the end-to-end loop for ATC practice scenarios driven by user audio submissions and LLM-guided tower responses.
- Provide deterministic phase progression where the server must approve phase advancement before the user can proceed.
- Ensure the simulation never stalls indefinitely by introducing heartbeat-driven interventions.

## Goals
- Align client and server responsibilities for handling audio input, tower prompts, and phase gating.
- Define durable session state that surfaces current phase, outstanding prompts, and approval status.
- Describe how heartbeat events interact with the LLM to keep the simulation engaged.
- Capture safeguards for silence, missing audio, or LLM downtime so users can always resume progress.

## Actors & Responsibilities
- **Client UI**: Captures audio/transcripts, schedules heartbeats, renders tower guidance, enables the "Proceed" action only when phase is approved by ATC.
- **ATC Server**: Validates requests, persists session state, packages context for the LLM, sends phase_approved messages, and processes phase_advanced requests.
- **LLM Orchestrator**: Accepts structured context (phase, transcript history, inactivity metadata) and returns tower speech plus advancement approval.
- **Session Store**: Durable backing store (SQL/Prisma) for phase, events, timestamps, and approval status.

## Session State Model
| Field | Purpose |
|-------|---------|
| `currentPhaseId` | Current scenario phase (string); server is source of truth. |
| `timeline` | Ordered log of timeline entries (transmissions, heartbeats, phase approvals/advances) with origin, event_type, payload, and timestamps. |

## Event Types
| Event Type | Created By | Purpose |
|------------|------------|---------|
| `transmission` | Client or Server | Communication message with optional audio; client transmissions capture pilot intent, server transmissions deliver ATC responses. |
| `heartbeat` | Client | Periodic check-in from client (stored for audit logging, not shown in UI). |
| `phase_approved` | Server | Server notifies the client that advancement to the next phase is unlocked. |
| `phase_advanced` | Client | Client requests to advance to the next phase (only after approval). |

## Transmission Flow (Client Perspective)
1. Client posts to `/sessions/:id/events` with:
   ```json
   {
     "event_type": "transmission",
     "message_content": "Ground, ready to taxi",
     "current_phase": 1,
     "audio": {
       "base64": "base64...", // optional
       "mime_type": "audio/m4a" // optional
     }
   }
   ```
2. Server validates the phase against stored state and writes a transmission row with `origin = PILOT`.
3. Server assembles LLM context (current phase, recent transmissions, latest evaluation) and requests an ATC evaluation.
4. Server persists an evaluation tied to the client transmission, capturing scores, structured feedback, and `goto_next_phase`.
5. If the LLM supplies tower speech, the server creates a second transmission with `origin = ATC` and schedules audio synthesis if needed.
6. When `goto_next_phase` is positive, the server emits a `phase_approved` event (described below) and updates cached session state.
7. Response payload includes the client transmission record, evaluation summary, and any server transmission generated in this turn.

## Data Persistence Overview
- `sessions`: current phase, participant info, scenario metadata, and cached evaluation snapshot.
- `transmissions`: immutable log of audio/text exchanges with origin (`CLIENT` or `SERVER`), phase context, media pointers, and transcripts.
- `evaluations`: per-transmission assessments (scores, feedback, LLM model version, `goto_next_phase`). Multiple evaluations can reference the same transmission for replays or human overrides.
- `phase_transitions`: append-only record of phase changes with trigger type (evaluation, manual, auto_proceed) and optional transmission/evaluation references.
- `heartbeats`: periodic client pings with device/network metadata to diagnose stalls.

## Heartbeat Event Flow
- Client emits heartbeat requests to `/sessions/:id/events` periodically:
   ```json
   {
     "event_type": "heartbeat",
     "current_phase": 1
   }
   ```
- Heartbeats ARE stored as events in the database for complete audit logging, but they are hidden in the user timeline.
- Server checks if ATC should proactively respond based on current phase and time elapsed.
- Response may include:
  - `serverTransmission`: Optional ATC transmission (persisted as a separate transmission event).
  - `shouldAdvance`: Optional boolean indicating if auto-advance is suggested.
- If ATC responds during a heartbeat, the server saves the server transmission and may also emit a `phase_approved` event to unlock the next phase.

## Phase Advancement Flow
**Critical: Server must approve phase BEFORE user can advance**

1. **Phase Approval (ATC → PILOT)**:
   - Server/LLM determines pilot is ready to advance (via transmission or heartbeat processing)
   - Server creates and persists a `phase_approved` event:
     ```json
     {
       "event_type": "phase_approved",
       "origin": "SERVER",
       "message_content": "Cleared to taxi",
       "current_phase": 1
     }
     ```
   - Client receives this event in the response payload and enables the "Proceed" button

2. **Phase Advanced (PILOT → Server)**:
   - User taps "Proceed", client sends to `/sessions/:id/events`:
     ```json
     {
       "event_type": "phase_advanced",
       "current_phase": 1
     }
     ```
   - Server validates current phase matches and updates session.currentPhaseId to next phase
   - Server persists the phase_advanced event
   - Response includes:
     ```json
     {
       "event_type": "phase_advanced",
       "success": true,
       "newPhaseId": "taxi-runup",
       "isComplete": false,
       "serverTransmission": { ... } // optional kickoff transmission
     }
     ```

## Client Behavior Summary
- Render each ATC transmission and phase approval; maintain history in UI.
- Enable "Proceed" button only when a phase_approved event has been received for the next phase.
- Send heartbeat events periodically to check for proactive ATC transmissions.
- Send phase_advanced event only after user taps "Proceed" (when approved).
- Update local phase state after receiving phase_advanced response with new phase.

## Edge Cases & Safeguards
- **Phase drift**: Server validates current_phase in requests matches session.currentPhaseId; rejects if mismatched.
- **LLM failures**: Use cached prompts or deterministic fallbacks for ATC responses.
- **Heartbeat flooding**: Server can debounce rapid heartbeats if needed.
- **Missing audio**: If audio_binary not provided, use message_content as the communication.
- **Advancing without approval**: Server rejects phase_advanced requests if no phase_approved event was issued for next phase.

## Observability
- Log event processing: transmission received, ATC response generated, phase_approved issued, phase_advanced processed.
- Record metrics for LLM latency, events per session, phase completion rates.
- Monitor for stuck sessions (no events for extended periods).

## Testing Strategy
- **Unit**: Event processing logic, phase validation, sequence numbering.
- **Integration**: Session flow with mocked LLM responses covering transmissions, approvals, and phase advancement.
- **E2E / manual**: Simulate full scenario through all 11 phases with the approve-then-advance flow.

## Event Flow Summary
1. Client transmission → server evaluates → optional server transmission returned.
2. Client heartbeat → server checks timers → optional server transmission returned.
3. Server emits `phase_approved` when advancement is allowed.
4. Client sends `phase_advanced` → server updates `currentPhaseId` and acknowledges the new phase.
5. Repeat for the next phase.
