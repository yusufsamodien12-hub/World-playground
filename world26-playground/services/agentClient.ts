import { WorldObject, LogEntry, KnowledgeEntry, ConstructionPlan, GroundingLink, KnowledgeCategory, WorldObjectType, CustomMeshSpec } from "../src/types";

// ---------------------------------------------------------------------------
// This is the ONLY place the playground talks to "the AI". It knows nothing
// about Mistral, OpenAI, prompts, or JSON-repair heuristics — that all lives
// in a separate AI agent project. This file just calls a generic HTTP
// endpoint (proxied through server.js's /api/decide, which forwards to
// AGENT_URL) and returns whatever decision comes back.
//
// Swap in a different AI project by pointing AGENT_URL at it, as long as it
// implements: POST /decide -> AIActionResponse (see shape below).
// ---------------------------------------------------------------------------

export interface AIActionResponse {
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

export interface WorldSnapshot {
  logs: LogEntry[];
  objects: WorldObject[];
  currentGoal: string;
  knowledgeBase: KnowledgeEntry[];
  activePlan?: ConstructionPlan;
}

const FALLBACK_RESPONSE: AIActionResponse = {
  action: 'WAIT',
  reason: 'Agent unreachable. Waiting before retrying.',
  reasoningSteps: ['Contacted /api/decide', 'No agent responded', 'Holding simulation'],
  learningNote: 'No AI agent is currently connected to this playground.',
  knowledgeCategory: 'Synthesis',
  taskLabel: 'Awaiting Agent',
  connectivityConfirmation: 'No connectivity confirmation available without an agent.',
  groundingLinks: [],
};

export async function requestAgentDecision(snapshot: WorldSnapshot): Promise<AIActionResponse> {
  try {
    const resp = await fetch('/api/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Agent responded with ${resp.status}: ${errorText}`);
    }

    return (await resp.json()) as AIActionResponse;
  } catch (error) {
    console.error('Agent request failed:', error);
    return {
      ...FALLBACK_RESPONSE,
      reason: `Agent unreachable: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
