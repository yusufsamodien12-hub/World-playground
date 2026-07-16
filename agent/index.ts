/**
 * World-Agent Agent Module
 * 
 * A standalone, framework-agnostic AI agent for the world simulation.
 * 
 * Usage:
 *   import { ArchitectAgent } from './agent';
 *   const agent = new ArchitectAgent({ proxyUrl: 'https://your-worker.workers.dev' });
 *   agent.onCallbacks({ onStateChange: (s) => console.log(s) });
 *   agent.start();
 * 
 * For single-step execution:
 *   await agent.step();
 */

export { ArchitectAgent } from './agent';
export { createMemoryProvider, LocalStorageMemory, ApiMemory } from './memory';
export { AgentLogger } from './logger';
export { queryBuildingKnowledge, getArchitectureKnowledgeForPrompt } from './overpass';
export { queryArtByClassification, queryArtKnowledge, getArtKnowledgeForPrompt } from './harvard';

// ─── Backward-compat wrappers for App.tsx ───────────────────────────────
// These match the deprecated services/ API so App.tsx can switch its
// imports to './agent' without changing call sites.

import { decideNextAction, DecideNextActionParams } from './aiLogic';
import { AIActionResponse, LogEntry as AgentLogEntry } from './types';

// Re-export so App.tsx can import from '../agent'
export { decideNextAction } from './aiLogic';

/** @deprecated Switch to decideNextAction(params) with object argument */
export async function decideNextActionLegacy(
  logs: AgentLogEntry[],
  objects: any[],
  currentGoal: string,
  knowledgeBase: any[],
  terrainHeightMap: (x: number, z: number) => number,
  activePlan?: any
): Promise<AIActionResponse> {
  return decideNextAction({
    history: logs,
    worldObjects: objects,
    currentGoal,
    knowledgeBase,
    terrainHeightMap,
    activePlan,
  });
}

// ─── State persistence shims ────────────────────────────────────────────
// Replicate the auto-detection logic from services/memoryService.ts so
// existing App.tsx code continues to work unchanged.

const getStateEndpoint = (): string | null => {
  const proxyUrl = typeof (globalThis as any)?.import?.meta?.env?.VITE_PROXY_URL === 'string'
    ? (globalThis as any).import.meta.env.VITE_PROXY_URL
    : null;
  if (proxyUrl && proxyUrl.includes('workers.dev')) {
    return `${proxyUrl.split('/v1/')[0]}/state`;
  }
  if (typeof (globalThis as any)?.import?.meta?.env?.DEV !== 'undefined'
    && (globalThis as any).import.meta.env.DEV) {
    return '/api/state';
  }
  return null;
};

const API_BASE = getStateEndpoint();

interface SimulationState {
  objects: any[];
  logs: any[];
  knowledgeBase: any[];
  currentGoal: string;
  learningIteration: number;
  progression: any;
  networkStatus: string;
  activePlan?: any;
  apiMetrics: any[];
}

export async function saveSimulationState(state: SimulationState): Promise<void> {
  try {
    if (!API_BASE) {
      localStorage.setItem('world26_simulation_state', JSON.stringify(state));
      return;
    }
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
  } catch (err) {
    console.error('Failed to persist memory, falling back to localStorage:', err);
    try { localStorage.setItem('world26_simulation_state', JSON.stringify(state)); } catch { /* ignore */ }
  }
}

export async function loadSimulationState(): Promise<SimulationState | null> {
  try {
    if (!API_BASE) {
      const stored = localStorage.getItem('world26_simulation_state');
      return stored ? JSON.parse(stored) : null;
    }
    const resp = await fetch(API_BASE);
    if (!resp.ok) return null;
    const data: any = await resp.json();
    return data.state ?? null;
  } catch (err) {
    console.error('Failed to load state, trying localStorage:', err);
    try {
      const stored = localStorage.getItem('world26_simulation_state');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  }
}

// Simple singleton logger to match services/logger's API
const appLogger = new AgentLogger({ maxLogs: 200 });
export const logger = {
  debug: (cat: string, msg: string, ...args: any[]) => appLogger.debug(cat, msg, ...args),
  info: (cat: string, msg: string, ...args: any[]) => appLogger.info(cat, msg, ...args),
  warn: (cat: string, msg: string, ...args: any[]) => appLogger.warn(cat, msg, ...args),
  error: (cat: string, msg: string, ...args: any[]) => appLogger.error(cat, msg, ...args),
};

// Inline generateId to match services/id.ts
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
export { generateId };

// Re-export all types
export type {
  WorldObjectType, KnowledgeCategory, MeshGeometryKind,
  LogType, NetworkStatus, ActionType,
  MeshMaterialSpec, MeshPart, CustomMeshSpec,
  PlanStep, WorldObject, LogEntry, GroundingLink,
  KnowledgeEntry, ConstructionPlan, ProgressionStats,
  ApiMetric, AIActionResponse, AgentState, AgentConfig,
  AgentCallbacks, MemoryProvider,
} from './types';