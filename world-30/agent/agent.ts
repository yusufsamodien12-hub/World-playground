/**
 * Architect-OS Agent - The core intelligence for the World26 simulation.
 * 
 * This is a framework-agnostic agent that:
 * 1. Maintains simulation state (objects, knowledge, logs, plans)
 * 2. Communicates with Mistral AI to make architectural decisions
 * 3. Validates and executes building plans
 * 4. Accumulates knowledge from each simulation step
 * 5. Persists state via configurable memory providers
 * 6. Emits callbacks for UI integration
 * 
 * Usage (React):
 *   const agent = new ArchitectAgent({ proxyUrl: '...' });
 *   agent.onStateChange((state) => setState(state));
 *   agent.start();
 * 
 * Usage (Node/CLI):
 *   const agent = new ArchitectAgent({ mistralApiKey: '...' });
 *   await agent.step(); // single simulation step
 *   console.log(agent.getState());
 */

import { 
  AgentState, AgentConfig, AgentCallbacks, AIActionResponse,
  WorldObject, LogEntry, KnowledgeEntry, ConstructionPlan,
  WorldObjectType, NetworkStatus, PlanStep, MemoryProvider,
  ProgressionStats
} from './types';
import { decideNextAction } from './aiLogic';
import { createMemoryProvider } from './memory';
import { AgentLogger } from './logger';

// ─── Constants ──────────────────────────────────────────────────────────────

const INITIAL_GOAL = 'Synthesize Sustainable Modular Settlement';
const DEFAULT_STEP_INTERVAL = 4500;
const DEFAULT_MAX_API_METRICS = 20;

const VALID_PLAN_TYPES: WorldObjectType[] = [
  'wall', 'roof', 'door', 'crop', 'tree', 'well', 'fence', 'modular_unit', 'solar_panel', 'water_collector'
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getTerrainHeight(x: number, z: number): number {
  const height = (Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2.0) +
                 (Math.sin(x * 0.02) * Math.cos(z * 0.02) * 5.0);
  return Number(height.toFixed(3));
}

function roundToPrecision(value: number, decimals = 3): number {
  return Number(value.toFixed(decimals));
}

function normalizePosition(position: [number, number, number]): [number, number, number] {
  return [
    roundToPrecision(position[0], 3),
    roundToPrecision(position[1], 3),
    roundToPrecision(position[2], 3)
  ];
}

function isFinitePosition(pos: [number, number, number]): boolean {
  return pos.every((c) => Number.isFinite(c));
}

// ─── Fallback Mesh ──────────────────────────────────────────────────────────

function getFallbackMesh(type: WorldObjectType) {
  switch (type) {
    case 'wall':
      return {
        materialResearch: 'Reinforced composite wall with visible support ribs.',
        parts: [
          { geometry: 'box' as const, args: [1.2, 2.1, 0.2], position: [0, 1.05, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#8f9ca8', roughness: 0.8, metalness: 0.1 } },
          { geometry: 'box' as const, args: [0.1, 2.1, 0.2], position: [-0.55, 1.05, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#4b5563', roughness: 0.7, metalness: 0.2 } },
          { geometry: 'box' as const, args: [0.1, 2.1, 0.2], position: [0.55, 1.05, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#4b5563', roughness: 0.7, metalness: 0.2 } },
        ]
      };
    case 'roof':
      return {
        materialResearch: 'Sloped modular roof panels with a reinforced ridge.',
        parts: [
          { geometry: 'box' as const, args: [1.4, 0.18, 1.4], position: [0, 0.1, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#7c2d12', roughness: 0.88, metalness: 0.05 } },
          { geometry: 'box' as const, args: [1.4, 0.18, 0.3], position: [0, 0.25, 0.55] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#9d3411', roughness: 0.88, metalness: 0.05 } },
        ]
      };
    case 'door':
      return {
        materialResearch: 'Simple wooden door with a brass handle accent.',
        parts: [
          { geometry: 'box' as const, args: [0.7, 1.9, 0.14], position: [0, 0.95, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#764f28', roughness: 0.7, metalness: 0.03 } },
          { geometry: 'cylinder' as const, args: [0.05, 0.05, 0.2, 12], position: [0.28, 0.95, 0.08] as [number, number, number], rotation: [0, 0, Math.PI / 2] as [number, number, number], material: { color: '#d5a021', roughness: 0.3, metalness: 0.85 } },
        ]
      };
    case 'modular_unit':
      return {
        materialResearch: 'Modular housing block with panelized siding and reinforced edges.',
        parts: [
          { geometry: 'box' as const, args: [1.4, 1.2, 1.2], position: [0, 0.6, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#1f2937', roughness: 0.5, metalness: 0.25 } },
          { geometry: 'box' as const, args: [1.4, 0.1, 0.05], position: [0, 0.55, 0.6] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#334155', roughness: 0.8, metalness: 0.2 } },
          { geometry: 'box' as const, args: [1.4, 0.1, 0.05], position: [0, 0.55, -0.6] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: { color: '#334155', roughness: 0.8, metalness: 0.2 } },
        ]
      };
    default:
      return undefined;
  }
}

// ─── Plan Normalization ─────────────────────────────────────────────────────

function normalizeConstructionPlan(
  plan?: ConstructionPlan,
  fallbackObjective?: string
): ConstructionPlan | undefined {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length < 5 || plan.steps.length > 12) {
    return undefined;
  }

  const normalizedSteps = plan.steps.map((step, index) => {
    const position = Array.isArray(step.position) && step.position.length >= 3
      ? [Number(step.position[0]), Number(step.position[1]), Number(step.position[2])] as [number, number, number]
      : [0, 0, 0] as [number, number, number];

    const status = step.status && ['pending', 'active', 'completed'].includes(step.status)
      ? step.status
      : (index === 0 ? 'active' : 'pending');

    const type = VALID_PLAN_TYPES.includes(step.type) ? step.type : 'modular_unit';
    const label = typeof step.label === 'string' && step.label.trim().length > 0 ? step.label : `${type} step ${index + 1}`;

    return { ...step, type, label, position, status };
  });

  if (normalizedSteps.some(step => !isFinitePosition(step.position))) {
    return undefined;
  }

  const positions = new Set(normalizedSteps.map(step => step.position.join(',')));
  if (positions.size !== normalizedSteps.length) {
    return undefined;
  }

  const activeCount = normalizedSteps.filter(step => step.status === 'active').length;
  if (activeCount !== 1) {
    const firstActiveIndex = normalizedSteps.findIndex(step => step.status === 'active');
    const correctedSteps = normalizedSteps.map((step, index) => {
      if (firstActiveIndex >= 0) {
        if (index < firstActiveIndex) return { ...step, status: 'completed' as const };
        if (index === firstActiveIndex) return { ...step, status: 'active' as const };
        return { ...step, status: 'pending' as const };
      }
      if (index === 0) return { ...step, status: 'active' as const };
      return { ...step, status: 'pending' as const };
    });
    return {
      ...plan,
      objective: plan.objective || fallbackObjective || 'Architectural Synthesis',
      currentStepIndex: firstActiveIndex >= 0 ? firstActiveIndex : 0,
      planId: plan.planId || generateId(),
      steps: correctedSteps
    };
  }

  const activeIndex = normalizedSteps.findIndex(step => step.status === 'active');
  const resolvedSteps = normalizedSteps.map((step, index) => {
    if (index < activeIndex) return { ...step, status: 'completed' as const };
    if (index === activeIndex) return { ...step, status: 'active' as const };
    return { ...step, status: 'pending' as const };
  });

  return {
    ...plan,
    objective: plan.objective || fallbackObjective || 'Architectural Synthesis',
    currentStepIndex: activeIndex,
    planId: plan.planId || generateId(),
    steps: resolvedSteps
  };
}

function buildFallbackHousePlan(anchor: [number, number, number], objective: string): ConstructionPlan {
  const [x, y, z] = anchor;
  const wallOffset = 1.25;
  const doorOffset = 1.0;
  return {
    planId: generateId(),
    objective,
    currentStepIndex: 0,
    steps: [
      { label: 'Foundation', type: 'modular_unit' as const, position: [x, y, z], status: 'active' as const, customMesh: getFallbackMesh('modular_unit') },
      { label: 'Wall East', type: 'wall' as const, position: [x + wallOffset, y, z], status: 'pending' as const, customMesh: getFallbackMesh('wall') },
      { label: 'Wall West', type: 'wall' as const, position: [x - wallOffset, y, z], status: 'pending' as const, customMesh: getFallbackMesh('wall') },
      { label: 'Roof', type: 'roof' as const, position: [x, y + 2, z], status: 'pending' as const, customMesh: getFallbackMesh('roof') },
      { label: 'Door', type: 'door' as const, position: [x, y, z - doorOffset], status: 'pending' as const, customMesh: getFallbackMesh('door') }
    ]
  };
}

// ─── ArchitectAgent ─────────────────────────────────────────────────────────

export class ArchitectAgent {
  // State
  private state: AgentState;
  private isProcessing: boolean = false;
  private isRunning: boolean = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private currentTask: string = 'Analyzing Local Sector...';
  private taskProgress: number = 0;

  // Dependencies
  private memory: MemoryProvider;
  private logger: AgentLogger;
  private callbacks: Required<AgentCallbacks>;
  private config: Required<AgentConfig>;

  constructor(config: AgentConfig = {}, callbacks?: AgentCallbacks) {
    // Merge config with defaults
    this.config = {
      proxyUrl: config.proxyUrl ?? '',
      mistralApiKey: config.mistralApiKey ?? '',
      initialGoal: config.initialGoal ?? INITIAL_GOAL,
      stateEndpoint: config.stateEndpoint ?? '',
      terrainHeightFn: config.terrainHeightFn ?? getTerrainHeight,
      autoStart: config.autoStart ?? false,
      stepInterval: config.stepInterval ?? DEFAULT_STEP_INTERVAL,
      maxApiMetrics: config.maxApiMetrics ?? DEFAULT_MAX_API_METRICS,
    };

    // Initialize logger
    this.logger = new AgentLogger({ isDev: typeof window !== 'undefined' });

    // Initialize memory
    this.memory = createMemoryProvider(
      this.config.proxyUrl || undefined,
      this.config.stateEndpoint || undefined
    );

    // Initialize callbacks with no-ops
    this.callbacks = {
      onStateChange: callbacks?.onStateChange ?? (() => {}),
      onLog: callbacks?.onLog ?? (() => {}),
      onError: callbacks?.onError ?? (() => {}),
      onProcessingChange: callbacks?.onProcessingChange ?? (() => {}),
      onTaskUpdate: callbacks?.onTaskUpdate ?? (() => {}),
    };

    // Initialize state
    this.state = this.createInitialState();

    // Auto-start if configured
    if (this.config.autoStart) {
      this.start();
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Get a read-only copy of the current agent state */
  getState(): Readonly<AgentState> {
    return { ...this.state, objects: [...this.state.objects], logs: [...this.state.logs], knowledgeBase: [...this.state.knowledgeBase] };
  }

  /** Get the current task description */
  getCurrentTask(): string {
    return this.currentTask;
  }

  /** Get the current task progress (0-100) */
  getTaskProgress(): number {
    return this.taskProgress;
  }

  /** Check if the agent is currently processing a step */
  getIsProcessing(): boolean {
    return this.isProcessing;
  }

  /** Check if the auto-loop is running */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /** Get the agent logger instance */
  getLogger(): AgentLogger {
    return this.logger;
  }

  /** Get the memory provider instance */
  getMemoryProvider(): MemoryProvider {
    return this.memory;
  }

  /** Update agent configuration at runtime */
  updateConfig(partial: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...partial };
    // Recreate memory provider if proxy or endpoint changed
    if (partial.proxyUrl !== undefined || partial.stateEndpoint !== undefined) {
      this.memory = createMemoryProvider(
        this.config.proxyUrl || undefined,
        this.config.stateEndpoint || undefined
      );
    }
  }

  /** Register or update callbacks */
  onCallbacks(callbacks: AgentCallbacks): void {
    if (callbacks.onStateChange) this.callbacks.onStateChange = callbacks.onStateChange;
    if (callbacks.onLog) this.callbacks.onLog = callbacks.onLog;
    if (callbacks.onError) this.callbacks.onError = callbacks.onError;
    if (callbacks.onProcessingChange) this.callbacks.onProcessingChange = callbacks.onProcessingChange;
    if (callbacks.onTaskUpdate) this.callbacks.onTaskUpdate = callbacks.onTaskUpdate;
  }

  /** Add a log entry to the simulation log */
  addLog(message: string, type: LogEntry['type'] = 'action'): void {
    const entry: LogEntry = {
      id: generateId(),
      type,
      message,
      timestamp: Date.now()
    };
    this.state.logs = [...this.state.logs, entry];
    this.callbacks.onLog(entry);
    this.emitState();
  }

  /** Start the auto-simulation loop */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.info('Agent', 'Architect-OS loop started');
    this.addLog('Architect-OS Online. Neural pathways clear.', 'success');
    this.runLoop();
  }

  /** Stop the auto-simulation loop */
  stop(): void {
    this.isRunning = false;
    if (this.intervalId !== null) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    this.logger.info('Agent', 'Architect-OS loop stopped');
    this.addLog('Architect-OS paused. Awaiting directive.', 'action');
  }

  /** Execute a single simulation step */
  async step(): Promise<AIActionResponse | null> {
    if (this.isProcessing) return null;
    this.isProcessing = true;
    this.callbacks.onProcessingChange(true);
    this.setNetworkStatus('syncing');
    this.updateTask('Initiating Neural Uplink...', 5);
    this.addLog('Initiating Neural Uplink...', 'thinking');

    const apiStartTime = Date.now();

    try {
      const decision = await decideNextAction({
        history: this.state.logs,
        worldObjects: this.state.objects,
        currentGoal: this.state.currentGoal,
        knowledgeBase: this.state.knowledgeBase,
        terrainHeightMap: this.config.terrainHeightFn,
        activePlan: this.state.activePlan,
        proxyUrl: this.config.proxyUrl || undefined,
        mistralApiKey: this.config.mistralApiKey || undefined,
      });

      const apiLatency = Date.now() - apiStartTime;

      // Record API metric
      this.state.apiMetrics = [
        ...this.state.apiMetrics,
        { id: generateId(), timestamp: Date.now(), latency: apiLatency, status: 'success' as const }
      ].slice(-this.config.maxApiMetrics);

      this.updateTask('Processing synthesis packets...', 40);
      this.addLog('Neural Uplink Successful. Processing synthesis packets...', 'success');

      // Stream reasoning steps
      if (decision.reasoningSteps && decision.reasoningSteps.length > 0) {
        for (const step of decision.reasoningSteps) {
          this.addLog(`[REASONING]: ${step}`, 'thinking');
        }
      }

      this.currentTask = decision.taskLabel;
      if (decision.outcomeSummary) {
        this.addLog(`Outcome summary: ${decision.outcomeSummary}`, 'thinking');
      }
      if (decision.decisionFactors && decision.decisionFactors.length > 0) {
        this.addLog(`Decision factors: ${decision.decisionFactors.join(', ')}`, 'thinking');
      }
      if (decision.connectivityConfirmation) {
        this.addLog(`Connectivity: ${decision.connectivityConfirmation}`, 'thinking');
      }

      // Execute the action
      if (decision.action === 'PLACE') {
        this.executePlaceAction(decision);
      } else if (decision.action === 'CREATE') {
        this.executePlaceAction(decision); // CREATE reuses the same placement logic
      } else if (decision.action === 'ROAM' || decision.action === 'OBSERVE') {
        if (decision.avatarTarget) {
          this.state.avatarTarget = decision.avatarTarget;
          this.addLog(`Moving toward ${this.formatPosition(decision.avatarTarget)}: ${decision.reason}`, 'action');
        } else if (decision.position) {
          this.state.avatarTarget = decision.position;
          this.addLog(`Moving toward ${this.formatPosition(decision.position)}: ${decision.reason}`, 'action');
        } else {
          // Generate a random roam target nearby
          const currentPos = this.state.objects.length > 0
            ? this.state.objects[this.state.objects.length - 1].position
            : [0, 0, 0];
          const angle = Math.random() * Math.PI * 2;
          const dist = 5 + Math.random() * 15;
          this.state.avatarTarget = [
            currentPos[0] + Math.cos(angle) * dist,
            this.config.terrainHeightFn(currentPos[0] + Math.cos(angle) * dist, currentPos[2] + Math.sin(angle) * dist),
            currentPos[2] + Math.sin(angle) * dist,
          ];
          this.addLog(`Roaming toward ${this.formatPosition(this.state.avatarTarget)}: ${decision.reason}`, 'action');
        }
      } else if (decision.action === 'MOVE' && decision.position) {
        this.state.avatarTarget = decision.position;
        this.addLog(`Relocating: ${decision.reason}`, 'action');
      } else {
        this.addLog(`Simulation standby: ${decision.reason}`, 'action');
      }

      this.updateTask('Objective complete.', 100);

      // Auto-save state after each step
      await this.save();

      this.emitState();
      return decision;
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.addLog('Critical neural desync. Link unstable.', 'error');
      this.setNetworkStatus('error');
      this.state.apiMetrics = [
        ...this.state.apiMetrics,
        { id: generateId(), timestamp: Date.now(), latency: Date.now() - apiStartTime, status: 'error' as const }
      ].slice(-this.config.maxApiMetrics);
      this.callbacks.onError(error);
      this.emitState();
      return null;
    } finally {
      this.isProcessing = false;
      this.callbacks.onProcessingChange(false);
      this.updateTask(this.isRunning ? 'Scanning Topology...' : 'Standby', 0);
      if (this.state.networkStatus === 'error') {
        this.setNetworkStatus('error');
      } else {
        this.setNetworkStatus('uplink_active');
      }
    }
  }

  /** Load persisted state from memory provider */
  async load(): Promise<boolean> {
    try {
      const savedState = await this.memory.load();
      if (savedState) {
        this.state = {
          ...this.state,
          ...savedState,
          // Preserve runtime-only fields
          apiMetrics: savedState.apiMetrics ?? this.state.apiMetrics,
        };
        this.logger.info('Agent', 'Neural Memory Restored: Continuing previous simulation.');
        this.addLog('Neural Memory Restored: Continuing previous simulation.', 'success');
        this.emitState();
        return true;
      }
      return false;
    } catch (err) {
      this.logger.error('Agent', 'Memory initialization failed', err);
      return false;
    }
  }

  /** Save current state via memory provider */
  async save(): Promise<void> {
    if (this.state.objects.length > 0 || this.state.knowledgeBase.length > 0) {
      await this.memory.save(this.state);
    }
  }

  /** Reset the agent to its initial state */
  reset(): void {
    this.stop();
    this.state = this.createInitialState();
    this.isProcessing = false;
    this.currentTask = 'Analyzing Local Sector...';
    this.taskProgress = 0;
    this.memory = createMemoryProvider(
      this.config.proxyUrl || undefined,
      this.config.stateEndpoint || undefined
    );
    this.addLog('Architect-OS Reset. Neural pathways cleared.', 'success');
    this.emitState();
  }

  /** Set simulation objects directly */
  setObjects(objects: WorldObject[]): void {
    this.state.objects = objects;
    this.emitState();
  }

  /** Set knowledge base directly */
  setKnowledgeBase(kb: KnowledgeEntry[]): void {
    this.state.knowledgeBase = kb;
    this.emitState();
  }

  /** Set current goal */
  setGoal(goal: string): void {
    this.state.currentGoal = goal;
    this.emitState();
  }

  // ─── Private Methods ─────────────────────────────────────────────────────

  private createInitialState(): AgentState {
    return {
      objects: [],
      logs: [{
        id: generateId(),
        type: 'success' as const,
        message: 'Architect-OS Online. Neural pathways clear.',
        timestamp: Date.now()
      }],
      knowledgeBase: [],
      currentGoal: this.config.initialGoal,
      learningIteration: 0,
      networkStatus: 'uplink_active' as const,
      activePlan: undefined,
      progression: {
        complexityLevel: 1,
        structuresCompleted: 0,
        totalBlocks: 0,
        unlockedBlueprints: ['Core Protocol', 'Adaptive Clustering']
      },
      apiMetrics: [],
    };
  }

  private runLoop(): void {
    const tick = async () => {
      if (!this.isRunning) return;
      if (!this.isProcessing) {
        await this.step();
      }
      if (this.isRunning) {
        this.intervalId = setTimeout(tick, this.config.stepInterval);
      }
    };
    tick();
  }

  private emitState(): void {
    this.callbacks.onStateChange(this.getState());
  }

  private setNetworkStatus(status: NetworkStatus): void {
    this.state.networkStatus = status;
    this.emitState();
  }

  private updateTask(task: string, progress: number): void {
    this.currentTask = task;
    this.taskProgress = progress;
    this.callbacks.onTaskUpdate(task, progress);
  }

  private executePlaceAction(decision: AIActionResponse): void {
    const normalizedIncomingPlan = normalizeConstructionPlan(
      decision.plan,
      decision.taskLabel || 'Architectural Synthesis'
    );
    const normalizedActivePlan = normalizeConstructionPlan(this.state.activePlan);
    let nextPlan = normalizedIncomingPlan || normalizedActivePlan;

    if (decision.plan && !normalizedIncomingPlan) {
      this.logger.warn('Agent', 'Discarded invalid incoming plan from AI; using fallback.', { plan: decision.plan });
      this.addLog('Invalid AI plan detected; using fallback or continuing existing plan.', 'error');
    }

    if (!nextPlan) {
      const anchor = this.state.objects[this.state.objects.length - 1]?.position || [0, 0, 0];
      nextPlan = buildFallbackHousePlan(anchor as [number, number, number], decision.reason || 'Shelter');
      this.addLog('No valid plan available; assembling a fallback house blueprint.', 'thinking');
    }

    const currentStep = nextPlan?.steps?.[nextPlan.currentStepIndex];
    if (nextPlan && !currentStep) {
      this.logger.warn('Agent', 'Plan with invalid currentStepIndex, discarding plan', { plan: nextPlan });
      nextPlan = undefined;
    }

    const resolvedObjectType = (decision.objectType as string) === 'floor' ? 'modular_unit' : decision.objectType;
    const targetType = resolvedObjectType || currentStep?.type || 'modular_unit';
    let targetPos = decision.position || currentStep?.position || [0, 0, 0];

    if (!Array.isArray(targetPos) || targetPos.length !== 3) {
      targetPos = currentStep?.position || [0, 0, 0];
    }

    const x = Number(targetPos[0]);
    const yCandidate = Number(targetPos[1]);
    const z = Number(targetPos[2]);
    const y = Number.isFinite(yCandidate) ? yCandidate : this.config.terrainHeightFn(x, z);
    targetPos = normalizePosition([x, y, z]);

    this.addLog(`Synthesis Confirmed: Deploying ${targetType} unit at ${this.formatPosition(targetPos)}.`, 'success');

    const meshResearch = decision.customMesh?.materialResearch || currentStep?.customMesh?.materialResearch;
    if (meshResearch) {
      this.addLog(`Material research: ${meshResearch}`, 'thinking');
    }

    const newObj: WorldObject = {
      id: generateId(),
      type: targetType as WorldObjectType,
      position: targetPos as [number, number, number],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      timestamp: Date.now(),
      customMesh: decision.customMesh || currentStep?.customMesh
    };

    // Update plan
    let updatedPlan = normalizeConstructionPlan(nextPlan, decision.taskLabel || 'Architectural Synthesis');
    if (updatedPlan && updatedPlan.steps && updatedPlan.steps[updatedPlan.currentStepIndex]) {
      const steps = [...updatedPlan.steps];
      steps[updatedPlan.currentStepIndex] = {
        ...steps[updatedPlan.currentStepIndex],
        status: 'completed' as const
      };
      const nextIdx = updatedPlan.currentStepIndex + 1;
      if (nextIdx < steps.length) {
        steps[nextIdx] = { ...steps[nextIdx], status: 'active' as const };
        updatedPlan = { ...updatedPlan, steps, currentStepIndex: nextIdx };
      } else {
        updatedPlan = undefined;
        this.addLog('Strategic Objective Achieved.', 'success');
      }
    } else {
      updatedPlan = undefined;
    }

    // Accumulate knowledge
    const newKnowledge = [...this.state.knowledgeBase];
    const titleCandidate = decision.learningNote?.split(':')[0]?.trim() || 'Synthesis Logic';
    if (!newKnowledge.find(k => k.title === titleCandidate)) {
      newKnowledge.push({
        id: generateId(),
        title: titleCandidate,
        description: decision.learningNote,
        category: decision.knowledgeCategory,
        iteration: this.state.learningIteration,
        timestamp: Date.now(),
        links: decision.groundingLinks
      });
    }

    // Update state
    this.state = {
      ...this.state,
      objects: [...this.state.objects, newObj],
      learningIteration: this.state.learningIteration + 1,
      activePlan: updatedPlan,
      knowledgeBase: newKnowledge,
      progression: {
        ...this.state.progression,
        totalBlocks: this.state.progression.totalBlocks + 1,
        complexityLevel: Math.floor((this.state.progression.totalBlocks + 1) / 5) + 1,
        structuresCompleted: this.state.progression.structuresCompleted + (targetType === 'modular_unit' ? 1 : 0)
      }
    };
  }

  private formatMetricLength(meters: number): string {
    if (!Number.isFinite(meters)) return '0.000 m';
    const abs = Math.abs(meters);
    if (abs < 1) return `${(meters * 1000).toFixed(2)} mm (${meters.toFixed(4)} m)`;
    if (abs < 1000) return `${meters.toFixed(3)} m (${(meters * 100).toFixed(1)} cm)`;
    const km = meters / 1000;
    return `${km.toFixed(3)} km (${(meters % 1000).toFixed(3)} m)`;
  }

  private formatPosition(position: [number, number, number]): string {
    return `[${position.map(coord => this.formatMetricLength(coord)).join(', ')}]`;
  }
}