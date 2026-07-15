# 🤖 Architect-OS Agent Module

A standalone, framework-agnostic AI agent for the World26 simulation. This module encapsulates the **Architect-OS** intelligence — the core AI that observes, plans, acts, and learns to build architectural structures in a 3D world.

## Architecture

```
agent/
├── index.ts      # Barrel exports
├── types.ts      # All type definitions
├── aiLogic.ts    # Mistral AI communication, prompt building, JSON repair, plan validation
├── agent.ts      # Main ArchitectAgent class (state management, simulation loop, callbacks)
├── memory.ts     # Memory providers (localStorage, API/Cloudflare D1)
├── logger.ts     # Structured logging
└── README.md     # This file
```

## Quick Start

### 1. Basic Usage (React)

```tsx
import { ArchitectAgent } from './agent';

const agent = new ArchitectAgent(
  { proxyUrl: 'https://your-worker.workers.dev/v1/chat/completions' },
  {
    onStateChange: (state) => {
      // Update your React state
      setSimulationState(state);
    },
    onLog: (entry) => {
      // Handle individual log entries
      console.log(entry.message);
    },
    onError: (error) => {
      console.error('Agent error:', error);
    },
    onProcessingChange: (isProcessing) => {
      setLoading(isProcessing);
    },
    onTaskUpdate: (task, progress) => {
      setCurrentTask(task);
      setProgress(progress);
    },
  }
);

// Start the auto-simulation loop
agent.start();

// Or run a single step manually
await agent.step();

// Stop the loop
agent.stop();
```

### 2. Basic Usage (Node.js / CLI)

```ts
import { ArchitectAgent } from './agent';

const agent = new ArchitectAgent({
  mistralApiKey: process.env.MISTRAL_API_KEY,
  autoStart: false, // Don't auto-loop
});

// Load previous state if available
await agent.load();

// Run one simulation step
const decision = await agent.step();
console.log('AI decided:', decision.action, decision.reason);

// Save state
await agent.save();

// Get current state
const state = agent.getState();
console.log('Objects placed:', state.objects.length);
console.log('Knowledge entries:', state.knowledgeBase.length);
```

### 3. With Custom Terrain

```ts
const agent = new ArchitectAgent(
  {
    proxyUrl: 'https://your-worker.workers.dev/v1/chat/completions',
    terrainHeightFn: (x, z) => {
      // Your custom terrain function
      return Math.sin(x * 0.05) * Math.cos(z * 0.05) * 3.0;
    },
    initialGoal: 'Build a sustainable village',
    stepInterval: 3000, // 3 seconds between steps
  },
  callbacks
);
```

## API Reference

### `ArchitectAgent`

#### Constructor

```ts
new ArchitectAgent(config?: AgentConfig, callbacks?: AgentCallbacks)
```

#### Methods

| Method | Description |
|--------|-------------|
| `getState()` | Returns a read-only copy of the current `AgentState` |
| `getCurrentTask()` | Returns the current task description string |
| `getTaskProgress()` | Returns task progress (0-100) |
| `getIsProcessing()` | Whether a step is currently executing |
| `getIsRunning()` | Whether the auto-loop is active |
| `getLogger()` | Returns the `AgentLogger` instance |
| `getMemoryProvider()` | Returns the `MemoryProvider` instance |
| `updateConfig(partial)` | Update configuration at runtime |
| `onCallbacks(callbacks)` | Register or update callbacks |
| `addLog(message, type)` | Add a log entry to the simulation log |
| `start()` | Start the auto-simulation loop |
| `stop()` | Stop the auto-simulation loop |
| `step()` | Execute a single simulation step, returns `AIActionResponse` or `null` |
| `load()` | Load persisted state from memory provider |
| `save()` | Save current state via memory provider |
| `reset()` | Reset agent to initial state |
| `setObjects(objects)` | Set simulation objects directly |
| `setKnowledgeBase(kb)` | Set knowledge base directly |
| `setGoal(goal)` | Set current goal |

### `AgentConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `proxyUrl` | `string` | `''` | Cloudflare Worker proxy URL for secure AI calls |
| `mistralApiKey` | `string` | `''` | Direct Mistral API key (falls back to proxy) |
| `initialGoal` | `string` | `'Synthesize Sustainable Modular Settlement'` | Initial simulation goal |
| `stateEndpoint` | `string` | `''` | Custom state persistence endpoint |
| `terrainHeightFn` | `(x, z) => number` | Built-in sin/cos terrain | Terrain height function |
| `autoStart` | `boolean` | `false` | Whether to auto-start the simulation loop |
| `stepInterval` | `number` | `4500` | Interval between steps in ms |
| `maxApiMetrics` | `number` | `20` | Max API metrics to keep |

### `AgentCallbacks`

| Callback | Signature | Description |
|----------|-----------|-------------|
| `onStateChange` | `(state: AgentState) => void` | Called when state changes |
| `onLog` | `(entry: LogEntry) => void` | Called for each new log entry |
| `onError` | `(error: Error) => void` | Called on errors |
| `onProcessingChange` | `(isProcessing: boolean) => void` | Called when processing state changes |
| `onTaskUpdate` | `(task: string, progress: number) => void` | Called when task/progress updates |

### `AgentState`

```ts
interface AgentState {
  objects: WorldObject[];           // Placed world objects
  logs: LogEntry[];                 // Simulation log entries
  knowledgeBase: KnowledgeEntry[];  // Accumulated knowledge
  currentGoal: string;              // Current simulation goal
  learningIteration: number;        // Learning iteration counter
  progression: ProgressionStats;    // Progression statistics
  networkStatus: NetworkStatus;     // 'offline' | 'uplink_active' | 'syncing' | 'error'
  activePlan?: ConstructionPlan;    // Current active building plan
  apiMetrics: ApiMetric[];          // API call metrics
}
```

### `AIActionResponse`

```ts
interface AIActionResponse {
  action: 'PLACE' | 'MOVE' | 'WAIT';
  objectType?: WorldObjectType;
  position?: [number, number, number];
  reason: string;
  reasoningSteps: string[];
  decisionFactors?: string[];
  learningNote: string;
  knowledgeCategory: KnowledgeCategory;
  taskLabel: string;
  outcomeSummary?: string;
  connectivityConfirmation?: string;
  groundingLinks?: GroundingLink[];
  plan?: ConstructionPlan;
  customMesh?: CustomMeshSpec;
}
```

## Memory Providers

The agent supports two memory providers for state persistence:

### `LocalStorageMemory` (Browser)
Used by default in browser environments. Stores state in `localStorage`.

### `ApiMemory` (Cloudflare D1)
Used when a `proxyUrl` (Cloudflare Worker) or `stateEndpoint` is configured. Persists state to a D1 database at the edge.

The appropriate provider is automatically selected via `createMemoryProvider()`.

## Standalone AI Logic

You can also use the AI decision logic independently:

```ts
import { decideNextAction } from './agent';

const decision = await decideNextAction({
  history: logs,
  worldObjects: objects,
  currentGoal: 'Build a house',
  knowledgeBase: [],
  terrainHeightMap: (x, z) => Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2.0,
  activePlan: undefined,
  proxyUrl: 'https://your-worker.workers.dev/v1/chat/completions',
});
```

## Key Features

- **Framework-agnostic**: Works with React, Vue, Node.js, or any JavaScript runtime
- **Callback-based**: Emit state changes, logs, errors, and progress updates
- **Pluggable memory**: localStorage for browser, API for Cloudflare D1
- **Auto-loop**: Configurable interval-based simulation loop
- **Plan validation**: Validates architectural coherence of AI-generated plans
- **JSON repair**: Handles malformed AI responses with multiple fallback strategies
- **Knowledge accumulation**: Learns from each simulation step
- **TypeScript**: Full type definitions for all interfaces