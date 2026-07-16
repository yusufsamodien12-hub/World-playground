/**
 * Agent-specific type definitions for the World26 Architect-OS.
 * These extend the core simulation types and are framework-agnostic.
 */

export type WorldObjectType = 'wall' | 'roof' | 'door' | 'crop' | 'tree' | 'well' | 'fence' | 'modular_unit' | 'solar_panel' | 'water_collector';
export type KnowledgeCategory = 'Design' | 'Nature' | 'Systems' | 'Discovery' | 'Craft';
export type MeshGeometryKind = 'box' | 'cylinder' | 'cone' | 'sphere' | 'torus';
export type LogType = 'action' | 'learning' | 'error' | 'success' | 'thinking';
export type NetworkStatus = 'offline' | 'connected' | 'syncing' | 'error';
export type ActionType = 'PLACE' | 'MOVE' | 'WAIT' | 'ROAM' | 'OBSERVE' | 'CREATE';

export interface MeshMaterialSpec {
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  /** URL to a texture image to use as map (diffuse/albedo) */
  textureUrl?: string;
}

export interface MeshPart {
  geometry: MeshGeometryKind;
  args: number[];
  position?: [number, number, number];
  rotation?: [number, number, number];
  material: MeshMaterialSpec;
}

export interface CustomMeshSpec {
  materialResearch: string;
  parts: MeshPart[];
}

export interface PlanStep {
  label: string;
  type: WorldObjectType;
  position: [number, number, number];
  status: 'pending' | 'active' | 'completed';
  customMesh?: CustomMeshSpec;
}

export interface WorldObject {
  id: string;
  type: WorldObjectType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  timestamp: number;
  customMesh?: CustomMeshSpec;
}

export interface LogEntry {
  id: string;
  type: LogType;
  message: string;
  timestamp: number;
}

/** Per-category knowledge mastery score (0–100) */
export interface CategoryMastery {
  category: KnowledgeCategory;
  /** Number of distinct knowledge entries in this category */
  entryCount: number;
  /** Rolling quality score based on recency & relevance (0-100) */
  masteryScore: number;
  /** Last iteration this category was referenced */
  lastReferenced: number;
}

/** Learning metrics tracked across agent lifetime */
export interface LearningMetrics {
  /** Mastery per knowledge category */
  categoryMastery: CategoryMastery[];
  /** Total distinct concepts learned */
  totalConcepts: number;
  /** Average quality of recent decisions (0-100) */
  decisionQualityScore: number;
  /** Number of unique action types taken in last 10 steps */
  actionDiversity: number;
  /** Knowledge entries that have been reinforced (used in prompt) */
  reinforcedCount: number;
}

export interface GroundingLink {
  uri: string;
  title: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  description: string;
  category: KnowledgeCategory;
  iteration: number;
  timestamp: number;
  links?: GroundingLink[];
}

export interface ConstructionPlan {
  steps: PlanStep[];
  currentStepIndex: number;
  sourceBlueprint?: string;
  planId: string;
  objective: string;
}

export interface ProgressionStats {
  complexityLevel: number;
  structuresCompleted: number;
  totalBlocks: number;
  availablePatterns: string[];
}

export interface ApiMetric {
  id: string;
  timestamp: number;
  latency: number;
  tokens?: number;
  status: 'success' | 'error' | 'timeout';
}

export interface AIActionResponse {
  action: ActionType;
  objectType?: WorldObjectType;
  position?: [number, number, number];
  avatarTarget?: [number, number, number]; // ROAM/OBSERVE target for the avatar to walk toward
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

export interface AgentState {
  objects: WorldObject[];
  logs: LogEntry[];
  knowledgeBase: KnowledgeEntry[];
  currentGoal: string;
  learningIteration: number;
  progression: ProgressionStats;
  networkStatus: NetworkStatus;
  activePlan?: ConstructionPlan;
  apiMetrics: ApiMetric[];
  avatarTarget?: [number, number, number];
  learningMetrics?: LearningMetrics;
}

export const MAX_LOGS = 200;
export const MAX_KNOWLEDGE_ENTRIES = 100;

export interface AgentConfig {
  /** Proxy URL (Cloudflare Worker) for secure AI calls */
  proxyUrl?: string;
  /** Direct Mistral API key (falls back to proxy if absent) */
  mistralApiKey?: string;
  /** BlockForge /design endpoint for mesh generation */
  blockforgeUrl?: string;
  /** Initial goal for the simulation */
  initialGoal?: string;
  /** State persistence endpoint (defaults to localStorage) */
  stateEndpoint?: string;
  /** Terrain height function: (x, z) => height */
  terrainHeightFn?: (x: number, z: number) => number;
  /** Whether to auto-start the simulation loop */
  autoStart?: boolean;
  /** Interval between simulation steps in ms (default: 4500) */
  stepInterval?: number;
  /** Maximum number of API metrics to keep (default: 20) */
  maxApiMetrics?: number;
}

export interface AgentCallbacks {
  onStateChange?: (state: AgentState) => void;
  onLog?: (entry: LogEntry) => void;
  onError?: (error: Error) => void;
  onProcessingChange?: (isProcessing: boolean) => void;
  onTaskUpdate?: (task: string, progress: number) => void;
}

export interface MemoryProvider {
  save(state: AgentState): Promise<void>;
  load(): Promise<AgentState | null>;
}