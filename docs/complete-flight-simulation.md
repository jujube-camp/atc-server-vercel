# Complete Flight Simulation: Parking to Shutdown
## All 11 Phases with Events

**Session Info:**
- Session ID: `cm123abc456def`
- User ID: `user_pilot123`
- Airport: `KSFO` (San Francisco International)
- Aircraft: `N12345`
- Start Time: `2025-10-21T10:00:00Z`

**Event Flow Pattern:**
1. PILOT sends broadcast → ATC responds with broadcast
2. Server determines readiness → ATC sends phase_approved event
3. PILOT sends phase_advanced → Server updates phase
4. Repeat for next phase

---

## PHASE 1: parking-startup

### Event 1 - Pilot Requests Taxi (10:00:00)
```json
// Client Request: POST /api/v1/sessions/cm123abc456def/events
{
  "event_type": "broadcast",
  "sender": "PILOT",
  "message_content": "San Francisco Ground, Cessna 12345 at Gate 5, request taxi for departure",
  "current_phase": "parking-startup",
  "audio_binary": "BASE64_ENCODED_AUDIO_DATA...",
  "audio_mime_type": "audio/m4a"
}

// Server Response
{
  "id": "evt_001",
  "sequence": 1,
  "sender": "PILOT",
  "event_type": "broadcast",
  "current_phase": "parking-startup",
  "audio_binary": "BASE64_ENCODED_AUDIO_DATA...",
  "audio_mime_type": "audio/m4a",
  "createdAt": "2025-10-21T10:00:00.000Z",
  "transcription": "San Francisco Ground, Cessna 12345 at Gate 5, request taxi for departure",
  "feedback": "Good initial contact with proper callsign and position",
  "audioFilePath": "uploads/audio/cm123abc456def_1_1729504800000.m4a",
  "atcResponse": {
    "sender": "ATC",
    "event_type": "broadcast",
    "message_content": "Cessna 12345, San Francisco Ground, runway 28R departure, taxi via Alpha when ready",
    "current_phase": "parking-startup"
  }
}
```
*Database: Persisted PILOT event (seq 1) and ATC broadcast event (seq 2)*

### Event 2 - Pilot Readback (10:00:15)
```json
// Client Request: POST /api/v1/sessions/cm123abc456def/events
{
  "event_type": "broadcast",
  "sender": "PILOT",
  "message_content": "Taxi to runway 28R via Alpha, Cessna 12345",
  "current_phase": "parking-startup",
  "audio_binary": "BASE64_ENCODED_AUDIO_DATA...",
  "audio_mime_type": "audio/m4a"
}

// Server Response
{
  "id": "evt_003",
  "sequence": 3,
  "sender": "PILOT",
  "event_type": "broadcast",
  "current_phase": "parking-startup",
  "createdAt": "2025-10-21T10:00:15.000Z",
  "transcription": "Taxi to runway 28R via Alpha, Cessna 12345",
  "atcResponse": {
    "sender": "ATC",
    "event_type": "phase_approved",
    "message_content": "Cessna 12345, cleared to taxi",
    "current_phase": "taxi-runup"
  }
}
```
*Database: PILOT event (seq 3) and ATC phase_approved event (seq 4) persisted*

*The phase_approved event is included in the previous broadcast response, enabling the client's "Proceed" button*

### Event 4 - Phase Advanced by Pilot (10:00:30)
```json
// Client Request: POST /api/v1/sessions/cm123abc456def/events
{
  "event_type": "phase_advanced",
  "sender": "PILOT",
  "current_phase": "parking-startup"
}

// Server Response
{
  "event_type": "phase_advanced",
  "success": true,
  "newPhaseId": "taxi-runup",
  "isComplete": false
}
```
*Database: phase_advanced event persisted (seq 6), session.currentPhaseId updated to "taxi-runup"*

---

## PHASE 2: taxi-runup

### Event 5 - Heartbeat (10:01:30)
```json
// Client Request: POST /api/v1/sessions/cm123abc456def/events
{
  "event_type": "heartbeat",
  "sender": "PILOT",
  "current_phase": "taxi-runup"
}

// Server Response
{
  "event_type": "heartbeat"
}
```
*Database: Heartbeat event (seq 7) persisted*

### Event 6 - Pilot Reports Ready for Runup (10:02:00)
```json
// Client Request: POST /api/v1/sessions/cm123abc456def/events
{
  "event_type": "broadcast",
  "sender": "PILOT",
  "message_content": "Ground, Cessna 12345 ready for runup",
  "current_phase": "taxi-runup",
  "audio_binary": "BASE64_ENCODED_AUDIO_DATA...",
  "audio_mime_type": "audio/m4a"
}

// Server Response
{
  "id": "evt_008",
  "sequence": 8,
  "sender": "PILOT",
  "event_type": "broadcast",
  "current_phase": "taxi-runup",
  "createdAt": "2025-10-21T10:02:00.000Z",
  "transcription": "Ground, Cessna 12345 ready for runup",
  "atcResponse": {
    "sender": "ATC",
    "event_type": "phase_approved",
    "message_content": "Cessna 12345, proceed to runup area",
    "current_phase": "runup"
  }
}
```
*Database: PILOT event (seq 8) and ATC phase_approved event (seq 9) persisted*

### Event 7 - Phase Advanced (10:02:10)
```json
// Client Request: POST /api/v1/sessions/cm123abc456def/events
{
  "event_type": "phase_advanced",
  "sender": "PILOT",
  "current_phase": "taxi-runup"
}

// Server Response
{
  "event_type": "phase_advanced",
  "success": true,
  "newPhaseId": "runup",
  "isComplete": false
}
```
*Database: phase_advanced event (seq 10) persisted, session.currentPhaseId updated to "runup"*

---

## PHASE 3: runup

### Event 8 - Pilot at Runup Area (10:02:30)
```json
// Client Request: POST /api/v1/sessions/cm123abc456def/events
{
  "event_type": "broadcast",
  "sender": "PILOT",
  "message_content": "Cessna 12345 at runup area",
  "current_phase": "runup",
  "audio_binary": "BASE64_ENCODED_AUDIO_DATA...",
  "audio_mime_type": "audio/m4a"
}

// Server Response
{
  "id": "evt_011",
  "sequence": 11,
  "sender": "PILOT",
  "event_type": "broadcast",
  "current_phase": "runup",
  "createdAt": "2025-10-21T10:02:30.000Z",
  "transcription": "Cessna 12345 at runup area",
  "atcResponse": {
    "sender": "ATC",
    "event_type": "broadcast",
    "message_content": "Cessna 12345, report when runup complete",
    "current_phase": "runup"
  }
}
```
*Database: PILOT event (seq 11) and ATC broadcast event (seq 12) persisted*

### Event 9 - Runup Complete (10:03:30)
```json
// Client Request: POST /api/v1/sessions/cm123abc456def/events
{
  "event_type": "broadcast",
  "sender": "PILOT",
  "message_content": "Cessna 12345, runup complete",
  "current_phase": "runup",
  "audio_binary": "BASE64_ENCODED_AUDIO_DATA...",
  "audio_mime_type": "audio/m4a"
}

// Server Response
{
  "id": "evt_013",
  "sequence": 13,
  "sender": "PILOT",
  "event_type": "broadcast",
  "current_phase": "runup",
  "createdAt": "2025-10-21T10:03:30.000Z",
  "transcription": "Cessna 12345, runup complete",
  "atcResponse": {
    "sender": "ATC",
    "event_type": "phase_approved",
    "message_content": "Cessna 12345, taxi to hold short runway 28R",
    "current_phase": "hold-short"
  }
}
```
*Database: PILOT event (seq 13) and ATC phase_approved event (seq 14) persisted*
