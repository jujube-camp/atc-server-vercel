# ATC Agent System Prompts

This directory contains the specialized prompts for the decomposed LLM agent system.

## Decomposed Agent Architecture

The system uses **three specialized agents**, each with its own optimized prompt:

### 1. `atc-agent-prompt.txt` (ATC Agent)

**Purpose:** Generate immediate ATC responses with proper FAA phraseology

**Used by:**
- `src/services/atcAgentService.ts` - ATC response generation
- `src/services/phaseService.ts` - Phase entry messages

**Optimization:**
- Model: GPT-4.1
- Temperature: 0.3 (consistent but natural)
- Max tokens: 150
- Target: <0.5s response time

**Key Features:**
- Decides when ATC response is needed vs when to stay silent
- Generates FAA-compliant phraseology
- Uses concrete values (no placeholders)
- Appropriate for current phase and frequency type

---

### 2. `evaluation-agent-prompt.txt` (Evaluation Agent)

**Purpose:** Evaluate pilot communication quality (async, non-blocking)

**Used by:**
- `src/services/evaluationAgentService.ts` - Communication assessment
- `src/services/communication-service.ts` - Async evaluation trigger

**Optimization:**
- Model: GPT-4.1
- Temperature: 0.5 (detailed but consistent)
- Max tokens: 500
- Runs async (non-blocking)

**Key Features:**
- Scores pilot communication (1-5)
- Provides specific, actionable feedback
- Shows perfect example for learning
- Teaching-focused quality assessment

---

### 3. `state-transition-agent-prompt.txt` (State Transition Agent)

**Purpose:** Determine phase advancement eligibility based on full session history

**Used by:**
- `src/services/stateTransitionAgentService.ts` - Phase advancement validation
- `src/controllers/evaluationController.ts` - Requirements evaluation endpoint

**Optimization:**
- Model: GPT-4.1
- Temperature: 0.1 (deterministic)
- Max tokens: 600
- On-demand (client-initiated)

**Key Features:**
- Evidence-based requirement validation
- Evaluates entire session history
- Rigorous requirement checking
- Clear reasoning with evidence spans

---

## Modifying Prompts

### General Guidelines

1. **Edit the `.txt` file directly** - Services load prompts at runtime
2. **Test changes** - Run regression tests to validate:
   ```bash
   npm run test:llm        # Test all agents
   npm run test:phase      # Test ATC Agent for phase entry
   ```
3. **Monitor quality** - Check that changes don't degrade performance
4. **Update baseline if needed** - Regenerate after significant changes:
   ```bash
   npm run test:llm:generate-baseline
   ```

### Per-Agent Guidelines

**ATC Agent (`atc-agent-prompt.txt`):**
- Focus: Speed and naturalness
- Avoid: Verbose explanations, over-complicated logic
- Test: Does it generate appropriate FAA-compliant messages?

**Evaluation Agent (`evaluation-agent-prompt.txt`):**
- Focus: Teaching quality and helpfulness
- Avoid: Harsh criticism, overly complex rubrics
- Test: Are feedback scores consistent and helpful?

**State Transition Agent (`state-transition-agent-prompt.txt`):**
- Focus: Accuracy and evidence-based decisions
- Avoid: Assumptions, lenient requirement checking
- Test: Does it correctly validate all requirements?

---

## Architecture Benefits

### vs Monolithic Prompt

| Aspect | Monolithic | Decomposed |
|--------|-----------|------------|
| **Prompt Size** | ~400 lines | 3×100-150 lines |
| **Maintainability** | Hard (3 roles mixed) | Easy (focused) |
| **Testing** | All-or-nothing | Per-agent |
| **Optimization** | One-size-fits-all | Specialized |
| **Response Time** | ~4s | ~1.5s (ATC) |

### Specialization Benefits

- **ATC Agent**: Can use faster model, lower temperature for consistency
- **Evaluation Agent**: Can run async, optimize for quality over speed
- **State Transition Agent**: Can use very low temperature for deterministic decisions

---

## Prompt Testing

Each prompt has dedicated regression tests:

```bash
# Test all agents together
npm run test:llm

# Test ATC Agent (phase entry messages)
npm run test:phase

# Verbose output
TEST_VERBOSE=true npm run test:llm

# With debug logs
TEST_LOG_LEVEL=info npm run test:llm
```

---

## File Organization

```
src/prompts/
├── atc-agent-prompt.txt              # ATC response generation
├── evaluation-agent-prompt.txt       # Pilot communication evaluation
└── state-transition-agent-prompt.txt # Phase advancement validation
```

---

## Historical Note

This decomposition replaced the monolithic `atc-system-prompt.txt` (now deleted) which tried to handle all three responsibilities in one complex prompt. The new architecture provides:

- ⚡ 60% faster ATC responses
- 💰 30-40% lower costs
- ✅ Better quality through focused prompts
- 🔧 Independent optimization per agent

See `../docs/llm-agent-decomposition.md` for full architecture documentation.
