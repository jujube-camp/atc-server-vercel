import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  fsmData,
  FlightModeConfig,
  FsmState,
  FsmTransitionTemplate,
} from '../src/common/fsm-data';

type VisualizerState = Pick<
  FsmState,
  'id' | 'label' | 'description' | 'group' | 'atc_guidance' | 'env_tools'
>;

type VisualizerTransition = Pick<
  FsmTransitionTemplate,
  'id' | 'from' | 'to' | 'description' | 'requirements' | 'user_label'
>;

interface VisualizerData {
  id: string;
  version: string;
  states: VisualizerState[];
  transitions: VisualizerTransition[];
  flightModes: Record<string, FlightModeConfig>;
  startStates: string[];
  terminalStates: string[];
  generatedAt: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_PATH = path.join(__dirname, 'fsm-visualizer-data.json');

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function buildVisualizerData(): VisualizerData {
  const states = Object.values(fsmData.states).map((state) => ({
    id: state.id,
    label: state.label,
    description: state.description,
    group: state.group ?? 'Other',
    atc_guidance: state.atc_guidance,
    env_tools: state.env_tools,
  }));

  const transitions = Object.values(fsmData.transitions).map((transition) => ({
    id: transition.id,
    from: transition.from,
    to: transition.to,
    user_label: transition.user_label,
    description: transition.description,
    requirements: transition.requirements,
  }));

  const flightModes = Object.entries(fsmData.flightModes).reduce<
    Record<string, FlightModeConfig>
  >((acc, [modeId, modeConfig]) => {
    acc[modeId] = modeConfig;
    return acc;
  }, {});

  const startStates = dedupe(
    Object.values(flightModes).map((mode) => mode.start_state)
  );

  const terminalStates = dedupe(
    Object.values(flightModes).flatMap((mode) => mode.terminal_states)
  );

  return {
    id: fsmData.id,
    version: fsmData.version,
    states,
    transitions,
    flightModes,
    startStates,
    terminalStates,
    generatedAt: new Date().toISOString(),
  };
}

function main() {
  const data = buildVisualizerData();
  writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));
  console.log(`FSM visualizer data written to ${OUTPUT_PATH}`);
}

main();




