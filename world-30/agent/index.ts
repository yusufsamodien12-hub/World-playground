/**
 * Architect-OS Agent Module
 * 
 * A standalone, framework-agnostic AI agent for the World26 simulation.
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
export { decideNextAction } from './aiLogic';
export { createMemoryProvider, LocalStorageMemory, ApiMemory } from './memory';
export { AgentLogger } from './logger';

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