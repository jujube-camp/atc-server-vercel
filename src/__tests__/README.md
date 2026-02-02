# ATC System Regression Tests

Comprehensive test suites for ATC AI services with focus on FAA phraseology, decision logic, response quality, and evaluation accuracy.

## Test Suites

### 1. AtcAgentService Tests
Tests `AtcAgentService.generateAtcResponse()` - ATC response generation across all FSM phases with tower-initiated phase entry scenarios.

### 2. EvaluationAgentService Tests
Tests `EvaluationAgentService.evaluatePilotCommunication()` - Pilot communication quality evaluation and feedback generation.

### 3. StateTransitionAgentService Tests
Tests `StateTransitionAgentService.evaluateStateTransition()` - Phase advancement eligibility based on requirements and latest transmission validation.

## Quick Start

```bash
# Run all tests
npm run test

# Run specific test suite
npm run test:atc-agent          # ATC Agent response tests
npm run test:evaluation         # Evaluation agent tests
npm run test:state-transition   # State transition agent tests

# Watch mode (development)
npm run test:atc-agent:watch
npm run test:evaluation:watch
npm run test:state-transition:watch

# Verbose output (see request/response details)
TEST_VERBOSE=true npm run test:atc-agent
TEST_VERBOSE=true npm run test:evaluation
TEST_VERBOSE=true npm run test:state-transition

# With service logs
TEST_LOG_LEVEL=info TEST_VERBOSE=true npm run test:atc-agent
TEST_LOG_LEVEL=info TEST_VERBOSE=true npm run test:evaluation
TEST_LOG_LEVEL=info TEST_VERBOSE=true npm run test:state-transition
```

## Test Coverage

### AtcAgentService Tests (33 tests)
- 19 core test cases across all FSM phases
- 8 tower-initiated phase entry scenarios
- 4 frequency mismatch scenarios
- Consistency validation (same input → same behavior)
- Phraseology validation (no placeholders)
- Performance checks (< 5s response time)

**Phases covered:** PARKING_STARTUP, TAXI_OUT, HOLD_SHORT, LINE_UP_AND_WAIT, CLIMBING, TRAFFIC_PATTERN, LANDED, TAXI_BACK, EMERGENCY, plus edge cases.

**Tower-Initiated Phase Entry Tests:**
  - **LINE_UP_AND_WAIT**: Tower proactively issues takeoff clearance
  - **CLIMBING**: Tower issues departure/pattern instructions (2 scenarios)
  - **TRAFFIC_PATTERN**: Tower issues landing clearance or sequencing (2 scenarios)
  - **EMERGENCY**: Tower provides emergency assistance (2 scenarios)
  - **LANDED**: Tower issues exit instructions and ground handoff (2 scenarios)

### EvaluationAgentService Tests (34 tests)
- 5 excellent communication tests (score 5)
- 1 good communication test (score 4)
- 4 adequate communication tests (score 3)
- 4 poor communication tests (score 2)
- 3 unacceptable communication tests (score 1)
- 8 readback verification tests
- 3 frequency mismatch tests (score 2-3)
- 4 different phase tests (EMERGENCY, CRUISING)
- 2 callsign variation tests
- 2 edge case tests
- Consistency validation
- Score distribution validation

**Evaluation criteria tested:**
  - Proper FAA phraseology
  - Required elements (callsign, ATIS, runway, etc.)
  - Readback verification
  - Safety-critical errors (wrong runway, missing callsign)
  - Untranscribable transmissions
  - Frequency awareness (calling wrong facility)

### StateTransitionAgentService Tests (26 tests)
- 10 successful phase advancement tests
- 6 missing requirements tests (should not advance)
- 4 latest transmission error tests (should not advance)
- 3 edge cases (empty requirements, multiple options, abbreviated callsigns)
- Consistency validation
- Requirements validation (FSM compliance)

**Phase transitions tested:**
  - PARKING_STARTUP → TAXI_OUT
  - HOLD_SHORT → LINE_UP_AND_WAIT / CLIMBING
  - LINE_UP_AND_WAIT → CLIMBING
  - CLIMBING → TRAFFIC_PATTERN / CRUISING
  - TRAFFIC_PATTERN → LANDED / CLIMBING
  - LANDED → TAXI_BACK
  - TAXI_BACK → SHUTDOWN

**Validation criteria:**
  - All FSM requirements checked
  - Latest transmission validated (no critical errors)
  - Evidence-based decision making
  - Proper next phase selection
  - Safety-critical error detection (wrong runway, missing callsign, wrong taxiway)

## What Gets Tested

### AtcAgentService Tests
- ✅ Response structure (`message` and `expected` fields)
- ✅ Decision logic (respond vs. stay silent)
- ✅ Message patterns (FAA phraseology, runway numbers, etc.)
- ✅ No forbidden patterns (placeholders, brackets, TBD)
- ✅ Reasoning clarity
- ✅ Tower-initiated messages for appropriate phase transitions
- ✅ Context-aware responses based on flight history
- ✅ Frequency mismatch detection and correction

### EvaluationAgentService Tests
- ✅ Response structure (`feedback_score`, `feedback_comment`, `perfect_example`)
- ✅ Score accuracy (1-5 range)
- ✅ Feedback relevance and actionability
- ✅ Perfect example includes proper FAA phraseology
- ✅ Readback verification against session history
- ✅ Safety-critical error detection (wrong runway, missing callsign)
- ✅ Frequency awareness evaluation (wrong facility calls)
- ✅ Score consistency for identical inputs
- ✅ Score distribution across full range

### StateTransitionAgentService Tests
- ✅ Response structure (`requirements_checklist`, `should_advance`, `next_phase`)
- ✅ Requirements validation against FSM
- ✅ Evidence-based requirement checking
- ✅ Latest transmission error detection
- ✅ Proper next phase selection from advance_options
- ✅ All requirements must be met for advancement
- ✅ Critical error blocking (wrong runway, missing callsign, wrong taxiway)
- ✅ Decision consistency for identical inputs

## Environment Setup

Required in `.env.test`:
```bash
OPENAI_API_KEY=sk-your-key-here
```

Optional:
```bash
TEST_VERBOSE=true          # Show detailed output
TEST_LOG_LEVEL=info        # Show service logs
```

## Adding New Tests

Add test cases to the `TEST_CASES` array in `atc-agent-regression.test.ts`:

```typescript
{
  name: 'PHASE_NAME - Scenario description',
  description: 'What this tests',
  context: {
    current_phase_info: getFsmStateInfo('PHASE_NAME'),
    pilot_transcript: 'What pilot says',
    history_audio_transcripts: ['Previous exchanges'],
    context: createAirportContext(),
  },
  expectations: {
    shouldRespond: true,  // or false
    messagePatterns: [/pattern1/i, /pattern2/i],
    forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
    reasonPatterns: [/reasoning/i],
    minLength: 10,
  },
}
```

For tower-initiated phase entry tests, use the pattern:
```typescript
{
  name: 'TOWER_INITIATE - PHASE_NAME phase entry',
  description: 'When entering PHASE_NAME (tower_initiate=true), Tower should...',
  context: {
    static_context: createStaticContext(),
    current_phase_info: getFsmStateInfo('PHASE_NAME'),
    dynamic_context: createDynamicContext([
      'Previous ATC instruction',
      'Pilot readback',
    ], 'PHASE_NAME'),
    pilot_transcript: 'Phase advanced from PREV_PHASE to PHASE_NAME',
  },
  expectations: {
    shouldRespond: true,
    messagePatterns: [/expected.*pattern/i],
    forbiddenPatterns: [/\[.*\]/, /\{.*\}/],
    minLength: 15,
  },
}
```

## Debugging

**Run specific test by name:**
```bash
# Run specific phase tests
vitest run -t "PARKING_STARTUP" src/__tests__/atc-agent-regression.test.ts

# Run all tower-initiate tests
vitest run -t "TOWER_INITIATE" src/__tests__/atc-agent-regression.test.ts

# Run specific tower-initiate test
vitest run -t "TOWER_INITIATE - CLIMBING" src/__tests__/atc-agent-regression.test.ts
```

**See full details:**
```bash
TEST_VERBOSE=true npm run test:atc-agent
```

**Debug specific scenario:**
```bash
tsx src/__tests__/examples/debug-atc-agent.ts parkingStartupWithATIS
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `OPENAI_API_KEY must be set` | Add to `.env.test` |
| Test timeout | Check network, verify OpenAI status |
| Pattern mismatch | Run with `TEST_VERBOSE=true` to see actual response |
| Unexpected silence/response | Review test expectations vs. prompt changes |

## CI/CD Integration

### GitHub Actions
```yaml
- name: Test ATC Agent
  run: npm run test:atc-agent
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### GitLab CI
```yaml
test:atc-agent:
  script:
    - npm run test:atc-agent
  variables:
    OPENAI_API_KEY: $OPENAI_API_KEY
```

## Cost Estimates

### AtcAgentService Tests
- Per test: ~$0.01-$0.02
- Full suite (33 tests): ~$0.66-$1.32

### EvaluationAgentService Tests
- Per test: ~$0.02-$0.03 (longer responses)
- Full suite (34 tests): ~$0.68-$1.02

### StateTransitionAgentService Tests
- Per test: ~$0.02-$0.04 (complex reasoning)
- Full suite (26 tests): ~$0.52-$1.04

**Total for all tests:** ~$1.86-$3.38

💡 **Tip:** Run specific test groups:
```bash
# Only tower-initiate tests (8 tests)
vitest run -t "TOWER_INITIATE" src/__tests__/atc-agent-regression.test.ts

# Only frequency mismatch tests
vitest run -t "FREQUENCY" src/__tests__/atc-agent-regression.test.ts
vitest run -t "FREQUENCY" src/__tests__/evaluation-agent-regression.test.ts

# Only excellent evaluation tests
vitest run -t "EXCELLENT" src/__tests__/evaluation-agent-regression.test.ts

# Only one phase
vitest run -t "CLIMBING" src/__tests__/atc-agent-regression.test.ts
```

## Files

```
src/__tests__/
├── atc-agent-regression.test.ts             # ATC Agent response tests
├── evaluation-agent-regression.test.ts      # Evaluation agent tests
├── state-transition-agent-regression.test.ts # State transition tests
├── examples/
│   └── debug-atc-agent.ts                  # Debug script
└── README.md                                # This file
```

## Test Structure

Tests are self-explanatory - see `atc-agent-regression.test.ts` for all test cases. Each test case includes:
- Context (phase, pilot transcript, history)
- Expectations (should respond, message patterns, etc.)
- Automatic validation of response structure and content

### Tower Initiate Tests

Special test cases simulate `PhaseService.advancePhase()` behavior when entering phases with `tower_initiate: true`:

1. **LINE_UP_AND_WAIT** - Tower issues takeoff clearance after pilot lines up
2. **CLIMBING** - Tower issues departure instructions or pattern entry (2 scenarios)
3. **TRAFFIC_PATTERN** - Tower issues landing clearance or sequencing (2 scenarios)
4. **EMERGENCY** - Tower provides emergency assistance (2 scenarios)
5. **LANDED** - Tower issues runway exit instructions and ground handoff (2 scenarios)

These tests use `pilot_transcript: 'Phase advanced from X to Y'` to simulate phase transitions and verify that ATC generates appropriate proactive messages.

