# LLM Prompt Regression Testing Guide

This document describes the LLM prompt regression testing framework for the ATC communication service.

## Overview

The regression test suite validates that the LLM (GPT-4.1) correctly evaluates pilot communications and maintains consistent behavior over time. This is critical for ensuring:

- **Deterministic phase transitions** - Aircraft advance through FSM phases correctly
- **Proper requirement evaluation** - All FSM requirements are checked accurately
- **Appropriate ATC responses** - Generated messages follow FAA phraseology and context
- **No LLM drift** - Model behavior remains stable across updates

## Architecture

### Components

1. **Test Cases** (`src/__tests__/fixtures/llm-test-cases.ts`)
   - Defines test scenarios with inputs and expected outputs
   - Covers all major FSM phases and edge cases
   - Each test case includes request data and validation criteria

2. **Prompt Builder** (`src/__tests__/utils/prompt-builder.ts`)
   - Extracts system prompt from CommunicationService
   - Builds user messages from test cases
   - Centralizes prompt construction logic

3. **Main Test Suite** (`src/__tests__/llm-prompt-regression.test.ts`)
   - Executes test cases against live OpenAI API
   - Validates LLM outputs against expectations
   - Tests consistency across multiple runs

4. **Baseline Comparison** (`src/__tests__/llm-baseline-comparison.test.ts`)
   - Compares current outputs with established baseline
   - Detects drift in LLM behavior over time
   - Flags significant changes in critical scenarios

5. **Baseline Generator** (`src/__tests__/utils/baseline-generator.ts`)
   - Generates baseline snapshots of LLM outputs
   - Creates reference data for regression comparison

## Usage

### Running Tests

```bash
# Run all LLM regression tests
npm run test:llm

# Run tests in watch mode (re-run on changes)
npm run test:llm:watch

# Run baseline comparison tests
npm run test:llm:baseline

# Generate new baseline snapshots
npm run test:llm:generate-baseline
```

### Test Output

```
 ✓ src/__tests__/llm-prompt-regression.test.ts (9) 
   ✓ PARKING_STARTUP - Complete ATIS and Taxi Request
   ✓ PARKING_STARTUP - Missing ATIS
   ✓ PARKING_STARTUP - Complete Sequence with Readback
   ✓ HOLD_SHORT - Takeoff Clearance
   ✓ HOLD_SHORT - Line Up and Wait
   ✓ TRAFFIC_PATTERN - Landing Clearance
   ✓ CLIMBING - Pattern Entry
   ✓ HOLD_SHORT - Missing Callsign in Readback
   ✓ LANDED - Taxi Instructions
```

## Test Case Structure

Each test case defines:

```typescript
{
  name: string;                    // Descriptive test name
  description: string;             // What is being tested
  request: LLMRequest;            // Input to the LLM
  expectedOutput: {
    shouldAdvance: boolean;       // Should phase advance?
    nextPhase: string | null;     // Expected next phase
    atcMessageShouldExist: boolean; // Should ATC respond?
    atcMessagePattern?: RegExp;   // Pattern ATC message should match
    requirementsMetCount?: number; // How many requirements met
    feedbackScoreMin?: number;    // Minimum acceptable score
  };
}
```

### Example Test Case

```typescript
{
  name: "HOLD_SHORT - Takeoff Clearance",
  description: "Tower issues takeoff clearance and pilot reads back correctly",
  request: {
    current_phase_info: getFsmStateInfo("HOLD_SHORT"),
    pilot_transcript: "Runway two eight left, cleared for takeoff, Cessna One Two Three Four Five.",
    history_audio_transcripts: [
      "San Jose Tower, Cessna One Two Three Four Five, holding short runway two eight left, ready for departure.",
      "Cessna One Two Three Four Five, runway two eight left, cleared for takeoff."
    ],
    context: {
      airport_icao: "KSJC",
      aircraft_tail_number: "N12345",
      airport_info: "..."
    }
  },
  expectedOutput: {
    shouldAdvance: true,
    nextPhase: "CLIMBING",
    atcMessageShouldExist: false,  // Correct readback, no response needed
    requirementsMetCount: 2,
    feedbackScoreMin: 9
  }
}
```

## Adding New Test Cases

1. Open `src/__tests__/fixtures/llm-test-cases.ts`
2. Add a new test case to the `LLM_TEST_CASES` array
3. Define the scenario and expected outputs
4. Run the test: `npm run test:llm -- -t "Your Test Name"`

### Example

```typescript
{
  name: "CRUISING - Return to Pattern",
  description: "Aircraft returning from cruise requests pattern entry",
  request: {
    current_phase_info: getFsmStateInfo("CRUISING"),
    pilot_transcript: "San Jose Tower, Cessna One Two Three Four Five, ten miles south, inbound for landing with information Bravo.",
    history_audio_transcripts: [],
    context: {
      airport_icao: "KSJC",
      aircraft_tail_number: "N12345",
      airport_info: JSON.stringify({ ... })
    }
  },
  expectedOutput: {
    shouldAdvance: false,  // Need pattern entry instruction
    nextPhase: null,
    atcMessageShouldExist: true,
    atcMessagePattern: /join.*downwind|straight.*in/i,
    feedbackScoreMin: 8
  }
}
```

## Baseline Testing

Baseline testing helps detect when LLM behavior changes over time.

### Establishing a Baseline

```bash
# Generate baseline snapshots
npm run test:llm:generate-baseline
```

This creates `src/__tests__/fixtures/llm-baseline.json` with reference outputs.

### Comparing Against Baseline

```bash
# Run baseline comparison tests
npm run test:llm:baseline
```

The test will:
- Load the baseline file
- Run the same test cases
- Compare critical fields (phase advancement, requirements, etc.)
- Flag any significant differences

### When to Update Baseline

Update the baseline when:
- System prompt changes intentionally
- FSM requirements are updated
- Expected LLM behavior changes are validated

**⚠️ Important**: Always review baseline changes carefully before committing.

## Debugging Failed Tests

### 1. Check Console Output

Tests log detailed information:

```
Testing: Phase: HOLD_SHORT, Transcript: "Runway two eight left, cleared for takeoff..."
LLM Response: {
  "phase_assessment": {
    "should_advance": true,
    "next_phase": "CLIMBING",
    ...
  }
}
```

### 2. Compare Expected vs Actual

The test framework shows what was expected vs what was received:

```
Expected should_advance to be true, but got false
Expected next_phase to be "CLIMBING", but got null
```

### 3. Review LLM Reasoning

Check the `requirements_checklist` for detailed reasoning:

```typescript
requirements_checklist: [
  {
    requirement_text: "Tower has issued a takeoff clearance...",
    met: true,
    reason: "Evidence in history: 'cleared for takeoff'",
    evidence_spans: ["runway two eight left, cleared for takeoff"]
  }
]
```

### 4. Common Issues

- **Phase not advancing**: Check if all requirements are met in transcript/history
- **Wrong next_phase**: Ensure next phase is in `advance.options` for current phase
- **Missing ATC message**: Verify if pilot readback was correct
- **Low feedback score**: Check if pilot transmission follows proper phraseology

## Integration with CI/CD

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Run LLM Regression Tests
  run: npm run test:llm
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

- name: Check Baseline Drift
  run: npm run test:llm:baseline
```

**Note**: LLM tests make API calls and incur costs. Consider:
- Running on main branch only
- Using scheduled runs (nightly)
- Setting up cost alerts

## Cost Considerations

Each test case makes one API call to GPT-4.1:
- Approximate cost: $0.01-0.02 per test case
- Full suite (9 test cases): ~$0.10-0.20 per run
- Consistency tests (3 runs): ~$0.30-0.60
- Baseline generation: ~$0.10-0.20

**Tip**: Use `--grep` to run specific tests during development:

```bash
npm run test:llm -- -t "PARKING_STARTUP"
```

## Monitoring LLM Changes

### Track Model Behavior

```bash
# Run drift detection tests
npm run test:llm:baseline
```

### Review Baseline Changes

When regenerating baselines, compare with git:

```bash
npm run test:llm:generate-baseline
git diff src/__tests__/fixtures/llm-baseline.json
```

Look for:
- Changes in `should_advance` decisions
- Different `next_phase` values
- Variations in requirements evaluation
- Shifts in feedback scores

## Best Practices

1. **Keep test cases atomic** - Test one scenario per case
2. **Use realistic transcripts** - Base on actual pilot communications
3. **Document edge cases** - Explain why unusual cases are tested
4. **Review baseline changes** - Don't auto-commit baseline updates
5. **Run before releases** - Ensure LLM behavior is stable
6. **Monitor costs** - Track API usage and set budgets
7. **Update with FSM changes** - Keep tests in sync with requirements

## Troubleshooting

### Tests timing out

Increase timeout in test file:

```typescript
it('test name', async () => {
  // test code
}, 60000); // 60 second timeout
```

### API rate limits

Add delays between test cases or reduce parallel execution.

### Baseline file not found

Run `npm run test:llm:generate-baseline` first.

### Inconsistent results

LLM outputs may vary slightly. Check if differences are:
- Semantically equivalent (e.g., "runway 28L" vs "runway two eight left")
- Within acceptable variance (e.g., feedback score ±1)
- Non-critical (e.g., wording in feedback comments)

## Future Enhancements

Potential improvements:
- [ ] Add mock mode for faster testing without API calls
- [ ] Support for multiple LLM providers
- [ ] Automated drift detection alerts
- [ ] Performance benchmarking
- [ ] Visual diff tool for baseline comparisons
- [ ] Test case generation from real session data

## Related Documentation

- [Backend Server MVP Design](./backend-server-mvp-design.md)
- [ATC Simulation Flow Design](./atc-simulation-flow-design.md)
- [FSM YAML Specification](../atc-common/src/fsm.yaml)

