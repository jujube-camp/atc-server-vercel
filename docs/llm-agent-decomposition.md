# LLM Agent Decomposition

## Executive Summary

**Goal:** Split monolithic LLM inference into 3 specialized agents for 60% faster response times, better testability, and lower costs.

**Current Problem:** One complex LLM call does everything (evaluate pilot, generate ATC response, check state) → 4 second latency, hard to test/optimize.

**Solution:** Three focused agents that do one thing well:
- **ATC Agent**: Generate immediate ATC response (~0.5s)
- **Evaluation Agent**: Evaluate pilot communication quality (async, background)
- **State Transition Agent**: Check requirements for phase advancement (on-demand)

**Benefits:**
- ⚡ **60% faster** ATC response (4s → 1.5s)
- 💰 **30-40% cheaper** (optimized token usage)
- ✅ **Better quality** (focused prompts, easier testing)
- 🔧 **More flexible** (independent optimization)

---

## Table of Contents

1. [Why We Need This](#why-we-need-this)
2. [Current vs Proposed Architecture](#current-vs-proposed-architecture)
3. [Three Specialized Agents](#three-specialized-agents)
4. [New API Endpoints](#new-api-endpoints)
5. [New Client Flow](#new-client-flow)
6. [Database Changes](#database-changes)
7. [Implementation Checklist](#implementation-checklist)
8. [Testing Strategy](#testing-strategy)
9. [Risks & Mitigation](#risks--mitigation)
10. [Success Metrics](#success-metrics)

---

## Why We Need This

### Current Pain Points

**1. Slow Response Time**
- Users wait 4 seconds after speaking to hear ATC response
- Breaks immersion of realistic ATC simulation
- Poor user experience

**2. Monolithic Complexity**
- One complex prompt tries to do 3 different tasks
- Cannot test/optimize individual components
- Hard to debug when something goes wrong
- One prompt change might break unrelated functionality

**3. Wasteful Computation**
- Every transmission requires complex multi-task inference
- Phase advance doesn't need evaluation but gets full prompt
- Paying for unnecessary LLM calls

**4. Inflexible**
- Cannot tune different parts independently
- ATC needs SPEED, evaluation needs QUALITY, state transition needs CORRECTNESS
- Stuck with one-size-fits-all parameters

### Real Impact

```
User speaks: "Ground, ready to taxi"
  ↓
[Wait... wait... wait... 4 seconds]
  ↓
Finally hear ATC: "Taxi to runway 28L"
```

**This delay ruins the realistic ATC training experience.**

---

## Current vs Proposed Architecture

### Current: Monolithic LLM

```
┌────────────────────────────────────────────────────────────┐
│  POST /communication/transmission                          │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Transcribe Audio (1s)                                  │
│  2. Complex LLM Call (2-3s) - Does everything:             │
│     • Evaluate pilot communication                          │
│     • Generate ATC response                                 │
│     • Check state transition requirements                   │
│  3. Generate TTS Audio (0.5s)                              │
│  4. Return complete response                                │
│                                                              │
│  Total Latency: ~4s ❌                                      │
└────────────────────────────────────────────────────────────┘

Prompt: atc-system-prompt.txt (400 lines, 3 roles mixed)
```

### Proposed: Decomposed Agents

```
┌────────────────────────────────────────────────────────────┐
│  POST /communication/transmission (FAST PATH)              │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Transcribe Audio (1s)                                  │
│  2. Call ATC AGENT (0.5s) - Generate ATC response only     │
│  3. Return ATC text immediately                             │
│  4. Trigger async Evaluation Agent (background)            │
│                                                              │
│  Total Latency: ~1.5s ✅                                    │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  POST /communication/evaluate-state (ON DEMAND)            │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Get session history & requirements                      │
│  2. Call STATE TRANSITION AGENT (1s)                        │
│  3. Return advancement decision                             │
│                                                              │
│  Total Latency: ~1s ✅                                      │
└────────────────────────────────────────────────────────────┘

Background: EVALUATION AGENT (async, 2s)
  • Evaluates pilot communication quality
  • Stores result in DB
  • Non-blocking
```

### Performance Comparison

```
CURRENT:
User speaks → [────────────Wait 4s────────────] → Hear ATC

PROPOSED:
User speaks → [──Wait 1.5s──] → Hear ATC ✅ (60% faster!)
              [Background: Evaluation completes in 2s]
              [On demand: State check when needed]
```

---

## Three Specialized Agents

### 1. ATC Agent (Speed First)

**Purpose:** Generate immediate ATC response text

**Input:**
```typescript
{
  current_phase_info: FsmStateInfo;
  pilot_transcript: string;
  history_audio_transcripts: string[];
  context: {
    airport_icao: string;
    aircraft_tail_number: string;
    airport_info: string;
    user_selected_frequency_type: string | null;
  }
}
```

**Output:**
```typescript
{
  atc_message: string;  // Empty string if no response needed
  reason: string;       // Why response needed or not
}
```

**Prompt Focus:** `src/prompts/atc-agent-prompt.txt`
- FAA-compliant phraseology
- Concrete values (no placeholders)
- Natural ATC communication flow
- **Decision logic: When to respond vs when not to**
  - If pilot correctly acknowledged with proper callsign → no response
  - If all requirements met and no transmission customary → no response
  - If progress blocked or pilot needs instruction → generate response

**Optimization:**
- Model: GPT-4-turbo (fast)
- Temperature: 0.3 (consistent but natural)
- Max tokens: 150
- Target latency: <0.5s

**New Prompt Template:**
```
You are an FAA-certified Air Traffic Controller.

INPUT: Current phase, pilot transcript, history, context

YOUR JOB:
1. Decide if ATC response is needed:
   • If pilot correctly acknowledged instructions → NO RESPONSE (return "")
   • If all requirements satisfied and no transmission customary → NO RESPONSE (return "")
   • If progress blocked or pilot needs instruction → GENERATE RESPONSE

2. If response needed, generate ONE concise FAA-standard transmission:
   • Proper phraseology
   • Concrete values (no placeholders like [runway], {taxiway})
   • Appropriate for current phase
   • Natural flow

OUTPUT:
{
  "atc_message": "string or empty",
  "reason": "brief explanation"
}
```

---

### 2. Evaluation Agent (Quality First, Async)

**Purpose:** Assess pilot communication quality (non-blocking background process)

**Input:**
```typescript
{
  pilot_transcript: string;
  current_phase_info: FsmStateInfo;
  context: {
    airport_icao: string;
    expected_elements: string[];
  }
}
```

**Output:**
```typescript
{
  feedback_score: number;      // 1-5
  feedback_comment: string;
  perfect_example: string;
}
```

**Prompt Focus:** `src/prompts/evaluation-agent-prompt.txt`
- Teaching quality and helpfulness
- Specific, actionable feedback
- Educational examples
- Consistent scoring rubric

**Optimization:**
- Model: GPT-4 (quality over speed)
- Temperature: 0.5 (detailed but consistent)
- Max tokens: 300
- Runs async (non-blocking)

**Processing:**
- Triggered automatically after pilot transmission stored
- Runs in background (async function or queue)
- Stores result in DB with status tracking
- User doesn't wait for this

---

### 3. State Transition Agent (Correctness First)

**Purpose:** Determine if pilot can advance to next phase based on ALL history

**Input:**
```typescript
{
  sessionId: string;
  currentPhase: PhaseName;
  // Agent fetches all historical transmissions and phase advances
}
```

**Output:**
```typescript
{
  should_advance: boolean;
  next_phase?: PhaseName;
  requirements_checklist: Array<{
    requirement_text: string;
    met: boolean;
    reason: string;
    evidence_spans: string[];
  }>;
}
```

**Prompt Focus:** `src/prompts/state-transition-agent-prompt.txt`
- Evidence-based validation
- Rigorous requirement checking
- No assumptions or guessing
- Clear reasoning with quotes from history

**Optimization:**
- Model: GPT-4 (accuracy critical)
- Temperature: 0.1 (deterministic)
- Max tokens: 400
- Target latency: <1s

**Key Difference from Current:**
- Evaluates based on **entire session history** (all transmissions + phase advances)
- Not tied to a specific transmission
- Called on-demand when client needs to check advancement eligibility

---

## New API Endpoints

### 1. Modified: POST /api/v1/communication/transmission

**Purpose:** Process pilot audio, return ATC response quickly

**Request:**
```typescript
{
  sessionId: string;
  currentPhase: PhaseName;
  audioData: string;        // base64
  audioMimeType: string;
  radioFrequency1?: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  transcription: string;
  atcResponse?: {
    message: string;        // Text only (no audio, no audioData)
  };
  // NO evaluation (happens async in background)
  // NO envResponse (separate endpoint)
}
```

**Processing:**
1. Transcribe audio (OpenAI Whisper)
2. Store pilot TransmissionEvent → DB
3. Call **ATC Agent** → Get ATC response text (or empty string)
4. If ATC message generated, store ATC TransmissionEvent → DB
5. **Trigger async Evaluation Agent** (fire-and-forget)
6. Return response immediately

**Backend Changes:**
- `src/services/communication-service.ts`: Split complex LLM call
- `src/controllers/communicationController.ts`: Updated response
- `src/schemas/application-schemas.ts`: Modified response schema

---

### 2. Modified: POST /api/v1/phases/:sessionId/advance

**Purpose:** Advance phase, return ATC entry message quickly

**Request:**
```typescript
{
  currentPhase: PhaseName;
  nextPhase: PhaseName;
}
```

**Response:**
```typescript
{
  success: boolean;
  newPhase: PhaseName;
  atcMessage?: {
    message: string;      // Text only
  };
  isComplete: boolean;
  // NO envResponse.requirementsChecklist in immediate response
}
```

**Processing:**
1. Validate phase transition
2. Update session phase → DB
3. Create PhaseAdvanceEvent → DB
4. If tower_initiate → Call **ATC Agent** → Get entry message
5. Store ATC TransmissionEvent → DB
6. Return response immediately

**Backend Changes:**
- `src/services/phaseService.ts`: Use ATC agent only
- `src/controllers/phaseController.ts`: Simplified response

---

### 3. NEW: POST /api/v1/evaluation/requirements

**Purpose:** Check if pilot can advance to next phase based on full session history

**Request:**
```typescript
{
  sessionId: string;
  currentPhase: PhaseName;
  // NO transmissionEventId - evaluates entire history
}
```

**Response:**
```typescript
{
  should_advance: boolean;
  next_phase?: PhaseName;
  requirements_checklist: Array<{
    requirement_text: string;
    met: boolean;
    reason: string;
  }>;
}
```

**Processing:**
1. Get ALL session history (transmissions + phase advances)
2. Get current phase FSM info (requirements, advance options)
3. Call **State Transition Agent** → Evaluate all requirements
4. Return advancement decision

**Backend Implementation:**
- New route in `src/routes/evaluation-routes.ts`
- New controller `EvaluationController`
- Uses `StateTransitionAgentService`

**Note on Route Organization:**
- Evaluation is a **query/assessment** operation (doesn't change state)
- Separated from events (user actions) for clear domain boundaries

---

## New Client Flow

### Current Flow

```typescript
// 1. User speaks
const response = await apiClient.sendTransmission(...);

// 2. Wait 4 seconds...

// 3. Receive everything at once:
// - transcription
// - atcResponse (with audio)
// - evaluation
// - envResponse (shouldAdvance, requirements)

playAudio(response.atcResponse.audioData);
showEvaluation(response.evaluation);
if (response.envResponse.shouldAdvance) {
  enableAdvanceButton();
}
```

### New Flow

```typescript
// 1. User speaks
const response = await apiClient.sendTransmission(...);

// 2. Receive ATC text immediately (~1.5s) ✅
if (response.atcResponse) {
  // 3. Get TTS audio separately
  const audio = await apiClient.getTTS(response.atcResponse.message);
  playAudio(audio);  // User hears ATC at ~2s total ✅
}

// 4. Check requirements (when needed, e.g., after multiple transmissions)
const evalResult = await apiClient.evaluateRequirements(sessionId, currentPhase);
if (evalResult.should_advance) {
  enableAdvanceButton();
  setPendingNextPhase(evalResult.next_phase);
}
showRequirementsChecklist(evalResult.requirements_checklist);

// 5. Evaluation happens in background
// No need to fetch - we're not showing it in the current simulation
```

### Client Changes Required

**Files to modify:**
- `smart-atc/src/utils/api.ts`
  - Update endpoint URLs:
    - `/communication/transmission` → `/events/transmission`
    - `/phases/:sessionId/advance` → `/events/phase-advance/:sessionId`  
  - Add `evaluateRequirements(sessionId, currentPhase)` method for `/evaluation/requirements`
  - Update `sendTransmission()` to handle new response format (no evaluation, no envResponse)
  - Keep existing `getTTS()` method

- `smart-atc/src/state/atcStore.tsx`
  - After receiving ATC response → call TTS service
  - Call `evaluateRequirements()` when checking advancement
  - Handle new response format

- `atc-common/src/schemas.ts` ✅ Already done
  - Cleaned up unused event schemas
  - Simplified response schemas

---

## Implementation Checklist

### Backend (atc-server)

#### 1. New Services
- [ ] Create `src/services/atcAgentService.ts`
  - `generateAtcResponse(context): Promise<{ atc_message: string, reason: string }>`
  - Uses focused ATC agent prompt
  
- [ ] Create `src/services/evaluationAgentService.ts`
  - `evaluatePilotCommunication(context): Promise<Evaluation>`
  - Runs async (can use simple async function for now)
  
- [ ] Create `src/services/stateTransitionAgentService.ts`
  - `evaluateStateTransition(sessionId, currentPhase): Promise<TransitionDecision>`
  - Fetches all session history internally

#### 2. New Prompts
- [ ] Create `src/prompts/atc-agent-prompt.txt`
  - Focus on ATC response generation
  - Include decision logic (when to respond vs not)
  - FAA phraseology standards
  - ~100 lines, focused
  
- [ ] Create `src/prompts/evaluation-agent-prompt.txt`
  - Focus on pilot communication assessment
  - Teaching quality feedback
  - ~120 lines, focused
  
- [ ] Create `src/prompts/state-transition-agent-prompt.txt`
  - Focus on requirement validation
  - Evidence-based evaluation
  - ~150 lines, focused

#### 3. Modify Existing Services
- [ ] Update `src/services/communication-service.ts`
  - Remove complex LLM call
  - Use ATC Agent service
  - Trigger async Evaluation Agent
  - Return simplified response
  
- [ ] Update `src/services/phaseService.ts`
  - Use ATC Agent instead of complex prompt
  - Remove requirements generation from immediate response

#### 4. New Routes & Controllers (Reorganized by domain)
- [ ] Create `src/routes/event-routes.ts` - User action routes
  - `POST /events/transmission` route
  - `POST /events/phase-advance/:sessionId` route
  
- [ ] Create `src/routes/evaluation-routes.ts` - Assessment routes
  - `POST /evaluation/requirements` route
  
- [ ] Create `src/controllers/eventController.ts` - User actions
  - `processTransmission(request, reply)` method
  - `advancePhase(request, reply)` method
  
- [ ] Create `src/controllers/evaluationController.ts` - Assessments
  - `evaluateRequirements(request, reply)` method
  
- [ ] Remove old controllers:
  - Delete `CommunicationController` (merged into EventController)
  - Delete `PhaseController` (merged into EventController)

#### 5. Schemas (atc-common)
- [ ] Update `atc-common/src/schemas.ts`
  - Modify `transmissionResponseSchema` (remove evaluation, envResponse)
  - Add `evaluateStateRequestSchema`
  - Add `evaluateStateResponseSchema`
  
- [ ] Build and publish atc-common
  ```bash
  cd atc-common
  npm run build
  ```

### Client (smart-atc)

#### 1. API Client
- [ ] Update `src/utils/api.ts`
  - Modify `sendTransmission()` for new response format
  - Add `evaluateState(sessionId, currentPhase)` method
  
#### 2. State Management
- [ ] Update `src/state/atcStore.tsx`
  - Modify transmission flow to call TTS separately
  - Call `evaluateState()` for advancement checks
  - Remove evaluation display (not needed)

#### 3. Dependencies
- [ ] Update atc-common dependency
  ```bash
  cd smart-atc
  npm install ../atc-common
  ```

### Testing

- [ ] Unit tests for each agent service
- [ ] Integration tests for new endpoints
- [ ] E2E test for full transmission flow
- [ ] Performance test (verify <1.5s latency)

---

## Testing Strategy

### Unit Tests

**ATC Agent:**
```typescript
// src/__tests__/atcAgentService.test.ts
test('generates proper FAA phraseology', async () => {
  const response = await atcAgentService.generateAtcResponse({...});
  expect(response.atc_message).toMatch(/runway two eight left/i);
});

test('returns empty string when pilot correctly acknowledged', async () => {
  const response = await atcAgentService.generateAtcResponse({
    pilot_transcript: "Wilco, N123AB"
  });
  expect(response.atc_message).toBe("");
  expect(response.reason).toContain("acknowledged");
});
```

**Evaluation Agent:**
```typescript
// src/__tests__/evaluationAgentService.test.ts
test('provides consistent scores', async () => {
  const eval1 = await evaluationAgentService.evaluate({...});
  const eval2 = await evaluationAgentService.evaluate({...}); // same input
  expect(Math.abs(eval1.score - eval2.score)).toBeLessThan(1);
});
```

**State Transition Agent:**
```typescript
// src/__tests__/stateTransitionAgentService.test.ts
test('validates all requirements with evidence', async () => {
  const decision = await stateTransitionAgentService.evaluate({...});
  decision.requirements_checklist.forEach(req => {
    if (req.met) {
      expect(req.evidence_spans.length).toBeGreaterThan(0);
    }
  });
});
```

### Integration Tests

```typescript
// src/__tests__/communication-routes.test.ts
test('POST /communication/transmission returns quickly', async () => {
  const start = Date.now();
  const response = await fastify.inject({
    method: 'POST',
    url: '/api/v1/communication/transmission',
    body: { ... }
  });
  const latency = Date.now() - start;
  
  expect(response.statusCode).toBe(201);
  expect(latency).toBeLessThan(2000); // <2s
  expect(response.json()).toHaveProperty('atcResponse');
  expect(response.json()).not.toHaveProperty('evaluation');
});

test('POST /communication/evaluate-state checks full history', async () => {
  const response = await fastify.inject({
    method: 'POST',
    url: '/api/v1/communication/evaluate-state',
    body: { sessionId: '...', currentPhase: 'taxi-runup' }
  });
  
  expect(response.statusCode).toBe(200);
  expect(response.json()).toHaveProperty('should_advance');
  expect(response.json()).toHaveProperty('requirements_checklist');
});
```

### End-to-End Tests

```typescript
// Full flow test
test('complete transmission flow with new architecture', async () => {
  // 1. Send transmission
  const txResponse = await apiClient.sendTransmission(...);
  expect(txResponse.success).toBe(true);
  expect(txResponse.atcResponse.message).toBeTruthy();
  
  // 2. Get TTS
  const audio = await apiClient.getTTS(txResponse.atcResponse.message);
  expect(audio).toBeInstanceOf(ArrayBuffer);
  
  // 3. Evaluate state
  const stateResponse = await apiClient.evaluateState(sessionId, currentPhase);
  expect(stateResponse).toHaveProperty('should_advance');
});
```

### Performance Benchmarks

```typescript
// Measure latencies
test('performance benchmarks', async () => {
  const results = await runBenchmark(100); // 100 requests
  
  expect(results.p95.transmission).toBeLessThan(1500); // <1.5s
  expect(results.p95.stateEvaluation).toBeLessThan(1000); // <1s
});
```

---

## Risks & Mitigation

### High Risk: Async Evaluation Failures

**Risk:** Background evaluations might fail silently

**Mitigation:**
- Implement error handling and logging
- Monitor evaluation creation in DB
- Set up alerts for evaluation failures

**Implementation:**
```typescript
async function triggerEvaluation(transmissionId: string) {
  try {
    const result = await evaluationAgentService.evaluate(...);
    
    await prisma.evaluation.create({
      data: {
        transmissionEventId: transmissionId,
        score: result.score,
        feedback: result.feedback,
        exampleAnswer: result.perfect_example
      }
    });
    
    logger.info({ transmissionId }, 'Evaluation completed');
  } catch (error) {
    logger.error({ error, transmissionId }, 'Evaluation failed');
    // Could retry or alert, but evaluation is non-critical for simulation
  }
}
```

### Medium Risk: Client Complexity

**Risk:** Client needs to orchestrate multiple API calls

**Mitigation:**
- Clear API documentation
- Helper methods in API client
- Good error handling
- Graceful degradation (if state check fails, can retry)

### Low Risk: Prompt Quality

**Risk:** New focused prompts might need tuning

**Mitigation:**
- Extensive testing with existing test cases
- Easy to iterate (just update prompt files)
- Can A/B test different versions
- Monitor quality metrics vs baseline

### Rollback Plan

1. **Keep old code paths** initially
2. **Feature flag** to toggle between old/new
3. **Database changes are additive** (backward compatible)
4. **Easy revert:** Just switch back to old endpoints

---

## Success Metrics

### Performance Targets

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| ATC Response Time (P95) | 4.0s | <1.5s | Server logs |
| State Evaluation Time (P95) | N/A | <1.0s | Server logs |
| Evaluation Success Rate | 100% | >95% | Metrics |
| Total Time to Audio | 4.5s | <2.0s | Client measurement |

### Quality Targets

- **ATC Response Quality:** No degradation vs baseline (manual review)
- **Evaluation Quality:** No degradation (teacher review sample)
- **State Transition Accuracy:** No degradation (test suite)

### Cost Targets

- **Token Usage:** 20% reduction (2500 → 2000 avg tokens per transmission)
- **Cost per Session:** 30-40% reduction
- **Model Optimization:** Can use cheaper models where appropriate

### Monitoring

```typescript
// Server metrics to track
metrics.timing('atc_agent.latency', latency);
metrics.timing('evaluation_agent.latency', latency);
metrics.timing('state_transition_agent.latency', latency);
metrics.increment('evaluation_agent.success'); // or .failure
metrics.timing('transmission.total_latency', totalLatency);
```

### Alerts

- 🚨 ATC agent latency P95 > 1s
- 🚨 State transition latency P95 > 1.5s
- 🚨 Evaluation success rate < 90%
- 🚨 Any agent error rate > 5%

---

## Implementation Notes

### Async Evaluation Implementation

**Option 1: Simple Async (MVP)**
```typescript
// In CommunicationService.processTransmission()
await prisma.transmissionEvent.create({ ... });

// Fire-and-forget async evaluation
triggerEvaluation(transmissionId).catch(err => {
  logger.error({ err, transmissionId }, 'Async evaluation failed');
});

return response; // Don't wait for evaluation
```

**Option 2: Job Queue (Future)**
- Use Bull/BullMQ for robust background processing
- Better retry logic
- Can scale horizontally
- Implement if needed later

### Prompt Engineering Tips

1. **Keep prompts focused** - One responsibility per prompt
2. **Use concrete examples** - Show what good output looks like
3. **Be explicit about edge cases** - When to return empty string, etc.
4. **Test with real data** - Use actual pilot transcripts from production
5. **Iterate based on metrics** - Monitor quality and adjust

### Cost Optimization

```typescript
// Can use different models per agent
const ATC_AGENT_MODEL = 'gpt-4-turbo'; // Fast + cheap
const EVAL_AGENT_MODEL = 'gpt-4'; // Quality
const STATE_AGENT_MODEL = 'gpt-4'; // Accuracy

// Can use different temperatures
const ATC_TEMP = 0.3; // Consistent but natural
const EVAL_TEMP = 0.5; // Detailed feedback
const STATE_TEMP = 0.1; // Deterministic
```

---

## Quick Reference

### Files to Create

```
Backend (atc-server):
├── src/services/atcAgentService.ts
├── src/services/evaluationAgentService.ts
├── src/services/stateTransitionAgentService.ts
├── src/prompts/atc-agent-prompt.txt
├── src/prompts/evaluation-agent-prompt.txt
├── src/prompts/state-transition-agent-prompt.txt
└── src/__tests__/
    ├── atcAgentService.test.ts
    ├── evaluationAgentService.test.ts
    └── stateTransitionAgentService.test.ts
```

### Files to Modify

```
Backend (atc-server):
├── src/services/communication-service.ts (split LLM call)
├── src/services/phaseService.ts (use ATC agent)
├── src/controllers/communicationController.ts (add evaluateState)
└── src/routes/communication-routes.ts (add new route)

Shared (atc-common):
└── src/schemas.ts (update response schemas)

Client (smart-atc):
├── src/utils/api.ts (add evaluateState method)
└── src/state/atcStore.tsx (update flow)
```

### Key Commands

```bash
# Backend
cd atc-server
npm test
npm run build

# Shared
cd atc-common
npm run build

# Client
cd smart-atc
npm install ../atc-common
npm test
```

---

## Conclusion

This decomposition transforms our monolithic LLM architecture into a flexible, performant system:

✅ **60% faster response times** (users hear ATC in 2s instead of 4.5s)
✅ **30-40% cost reduction** through optimized token usage
✅ **Better quality** via focused prompts and independent testing
✅ **More flexible** for future improvements and experimentation

The key insight: **Not all LLM tasks are equal.** ATC response needs speed, evaluation needs quality, and state transition needs correctness. By splitting them, we optimize each for its primary goal.

---

**Document Version:** 1.0  
**Status:** Ready for Implementation  
**Estimated Effort:** 1-2 days with team  
**Next Steps:** Review this doc, then start with creating the three agent services

