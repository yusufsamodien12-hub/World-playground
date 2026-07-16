/**
 * Agent AI Logic - Core decision-making for the world simulation.
 * Handles communication with Mistral AI, prompt construction, response parsing,
 * plan validation, and mesh sanitization.
 * 
 * This is a framework-agnostic port of the original services/aiLogic.ts.
 */

import { 
  AIActionResponse, WorldObject, LogEntry, KnowledgeEntry, 
  ConstructionPlan, WorldObjectType, CustomMeshSpec, MeshGeometryKind,
  GroundingLink, KnowledgeCategory, PlanStep, CategoryMastery
} from './types';
import * as JSON5 from 'json5';

// ─── BlockForge Tool (MCP-style) ─────────────────────────────────────────
// Every CREATE/PLACE action delegates mesh generation to the BlockForge
// /design endpoint. This is the agent's only tool.

const BLOCKFORGE_DESIGN_URL = 
  (typeof process !== 'undefined' && (process as any)?.env?.VITE_BLOCKFORGE_DESIGN_URL as string | undefined)
  ?? 'https://blockforge.yusufsamodien12.workers.dev/design';

const API_TIMEOUT_MS = 15000;

async function fetchCustomMeshFromBlockforge(
  description: string,
  source: string = 'world-playground',
  options?: { size?: string; color?: string; material?: string; features?: string }
): Promise<CustomMeshSpec | undefined> {
  try {
    const body: any = { description, source };
    if (options?.size) body.size = options.size;
    if (options?.color) body.color = options.color;
    if (options?.material) body.material = options.material;
    if (options?.features) body.features = options.features;
    const resp = await fetch(BLOCKFORGE_DESIGN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.warn(`BlockForge /design returned ${resp.status} for "${description}"`);
      return undefined;
    }
    const data: any = await resp.json();
    return sanitizeCustomMesh(data?.spec);
  } catch (err) {
    console.warn('BlockForge /design request failed:', err);
    return undefined;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function describeActivePlan(activePlan?: ConstructionPlan): string {
  if (!activePlan || !Array.isArray(activePlan.steps) || activePlan.steps.length === 0) {
    return 'NONE - Awaiting Strategic Blueprint';
  }
  const step = activePlan.steps[activePlan.currentStepIndex];
  if (!step || !Array.isArray(step.position)) {
    return 'MALFORMED - Discard and generate a new plan';
  }
  const positionText = step.position.map((coord: number) => Number(coord).toFixed(2)).join(', ');
  return `Step ${activePlan.currentStepIndex + 1}/${activePlan.steps.length}: ${step.label} at [${positionText}]`;
}

const VALID_GEOMETRIES: MeshGeometryKind[] = ['box', 'cylinder', 'cone', 'sphere', 'torus'];
const MAX_MESH_PARTS = 6;
const MIN_DIM = 0.05;
const MAX_DIM = 6;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value) ? value : fallback;
}

function sanitizeVec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  return [
    clampFinite(value[0], -20, 20, fallback[0]),
    clampFinite(value[1], -10, 20, fallback[1]),
    clampFinite(value[2], -20, 20, fallback[2]),
  ];
}

function formatMetricLength(meters: number): string {
  if (!Number.isFinite(meters)) return '0.00 m';
  const abs = Math.abs(meters);
  if (abs < 1) return `${(meters * 100).toFixed(2)} cm`;
  if (abs < 1000) return `${meters.toFixed(2)} m (${(meters * 100).toFixed(0)} cm)`;
  const km = meters / 1000;
  return `${km.toFixed(2)} km (${(meters % 1000).toFixed(2)} m)`;
}

function formatPositionWithUnits(position: [number, number, number]): string {
  return `[${position.map(coord => formatMetricLength(coord)).join(', ')}]`;
}

// ─── JSON Repair ────────────────────────────────────────────────────────────

function repairJsonArraySeparators(text: string): string {
  let output = '';
  let inString = false;
  let escape = false;
  const contextStack: ('array' | 'object')[] = [];
  let lastNonWhitespace = '';

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (escape) { output += char; escape = false; continue; }
    if (char === '\\') { output += char; escape = true; continue; }
    if (char === '"') { inString = !inString; output += char; lastNonWhitespace = char; continue; }
    if (inString) { output += char; continue; }
    if (char === '[') { contextStack.push('array'); output += char; lastNonWhitespace = char; continue; }
    if (char === '{') { contextStack.push('object'); output += char; lastNonWhitespace = char; continue; }
    if (char === ']' || char === '}') { contextStack.pop(); output += char; lastNonWhitespace = char; continue; }

    const currentContext = contextStack[contextStack.length - 1];
    if (currentContext === 'array' && /\S/.test(char)) {
      const beginsValue = char === '{' || char === '[' || char === '"' || char === '-' || /[0-9]/.test(char);
      if (beginsValue && lastNonWhitespace && lastNonWhitespace !== ',' && lastNonWhitespace !== '[') {
        output += ',';
        lastNonWhitespace = ',';
      }
    }
    output += char;
    if (!/\s/.test(char)) lastNonWhitespace = char;
  }
  return output;
}

function extractFirstJsonBlock(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') { depth += 1; }
    else if (char === '}') { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

function repairJsonLikeResponse(responseText: string): string {
  let repaired = responseText.trim();
  if (repaired.startsWith('```')) {
    repaired = repaired.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  }
  repaired = repaired.replace(/Math\.PI\/2/g, '1.5707963267948966');
  repaired = repaired.replace(/Math\.PI\/4/g, '0.7853981633974483');
  repaired = repaired.replace(/Math\.PI/g, '3.141592653589793');
  repaired = repaired.replace(/-Math\.PI\/2/g, '-1.5707963267948966');
  repaired = repaired.replace(/\/\/.*$/gm, '');
  repaired = repaired.replace(/\/\*[\s\S]*?\*\//g, '');
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');
  repaired = repaired.replace(/([,{]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');
  repaired = repaired.replace(/'([^']*)'/g, '"$1"');
  repaired = repaired.replace(/:\s*([^\s\"\'\{\[\d][^,\}\]]*?)(?=\s*[,\}])/g, (match, value) => {
    const trimmed = value.trim();
    if (/^(true|false|null)$/i.test(trimmed) || /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) return `: ${trimmed}`;
    return `: "${trimmed.replace(/"/g, '\\"')}"`;
  });
  repaired = repaired.replace(/:\s*#([0-9A-Fa-f]{3,6})(?=\s*[,\}\]])/g, ': "#$1"');
  repaired = repaired.replace(/([:\[,]\s*)([A-Za-z_][A-Za-z0-9_]*)(?=\s*(?:,|\]|\}|$))/g, (match, prefix, token) => {
    const trimmed = token.trim();
    if (/^(true|false|null)$/i.test(trimmed) || /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) return match;
    return `${prefix}"${trimmed}"`;
  });
  repaired = repaired.replace(/\[\s*([\d\-+eE\.\s]+?)\s*\]/g, (match, contents) => {
    const tokens = contents.trim().split(/\s+/);
    if (tokens.length > 1 && tokens.every(tok => /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(tok))) return `[${tokens.join(', ')}]`;
    return match;
  });
  repaired = repaired.replace(/([}\]"0-9a-zA-Z])\s+(?=(?:\{|\[|"|\-|[0-9]|true|false|null))/g, '$1, ');
  repaired = repairJsonArraySeparators(repaired);
  return repaired;
}

// ─── Sanitization ───────────────────────────────────────────────────────────

function sanitizeCustomMesh(raw: unknown): CustomMeshSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const candidate = raw as Partial<CustomMeshSpec>;
  if (!Array.isArray(candidate.parts) || candidate.parts.length === 0) return undefined;
  const parts = candidate.parts.slice(0, MAX_MESH_PARTS).map((part: any) => {
    if (!part || typeof part !== 'object') return null;
    if (!VALID_GEOMETRIES.includes(part.geometry)) return null;
    if (!Array.isArray(part.args) || part.args.length === 0) return null;
    const args = part.args.slice(0, 4).map((a: unknown) => clampFinite(a, MIN_DIM, MAX_DIM, 0.5));
    const material = part.material && typeof part.material === 'object' ? part.material : {};
    return {
      geometry: part.geometry as MeshGeometryKind,
      args,
      position: sanitizeVec3(part.position, [0, 0, 0]),
      rotation: sanitizeVec3(part.rotation, [0, 0, 0]),
      material: {
        color: sanitizeColor(material.color, '#8899aa'),
        roughness: clampFinite(material.roughness, 0, 1, 0.5),
        metalness: clampFinite(material.metalness, 0, 1, 0.2),
        emissive: material.emissive ? sanitizeColor(material.emissive, '#000000') : undefined,
        emissiveIntensity: material.emissiveIntensity !== undefined ? clampFinite(material.emissiveIntensity, 0, 3, 0.5) : undefined,
      },
    };
  }).filter((p): p is NonNullable<typeof p> => p !== null);
  if (parts.length === 0) return undefined;
  return { materialResearch: typeof candidate.materialResearch === 'string' ? candidate.materialResearch.slice(0, 300) : 'Unspecified material.', parts };
}

function buildFallbackCustomMesh(objectType?: WorldObjectType): CustomMeshSpec | undefined {
  switch (objectType) {
    case 'wall':
      return {
        materialResearch: 'Reinforced composite wall with a glazed window and structural frame.',
        parts: [
          { geometry: 'box', args: [1.3, 2.1, 0.2], position: [0, 1.05, 0], rotation: [0, 0, 0], material: { color: '#8297a6', roughness: 0.75, metalness: 0.12 } },
          { geometry: 'box', args: [0.5, 0.6, 0.05], position: [0, 1.2, 0.11], rotation: [0, 0, 0], material: { color: '#e2e8f0', roughness: 0.2, metalness: 0.15, emissive: '#5b93b8', emissiveIntensity: 0.05 } },
          { geometry: 'box', args: [0.1, 2.2, 0.1], position: [-0.6, 1.05, 0], rotation: [0, 0, 0], material: { color: '#334155', roughness: 0.6, metalness: 0.2 } },
          { geometry: 'box', args: [0.1, 2.2, 0.1], position: [0.6, 1.05, 0], rotation: [0, 0, 0], material: { color: '#334155', roughness: 0.6, metalness: 0.2 } },
        ],
      };
    case 'roof':
      return {
        materialResearch: 'Gabled roof with insulated panels and a durable weatherproof finish.',
        parts: [
          { geometry: 'box', args: [1.4, 0.18, 1.4], position: [0, 0.1, 0], rotation: [0, Math.PI / 4, 0], material: { color: '#7c2d12', roughness: 0.85, metalness: 0.08 } },
          { geometry: 'box', args: [1.4, 0.18, 1.4], position: [0, 0.1, 0], rotation: [0, -Math.PI / 4, 0], material: { color: '#922b0c', roughness: 0.85, metalness: 0.08 } },
          { geometry: 'cylinder', args: [0.08, 0.08, 1.4, 8], position: [0, 0.33, 0], rotation: [Math.PI / 2, 0, 0], material: { color: '#4b2110', roughness: 0.9, metalness: 0.05 } },
        ],
      };
    case 'door':
      return {
        materialResearch: 'Wood grain entry door with a subtle metallic handle detail.',
        parts: [
          { geometry: 'box', args: [0.7, 1.9, 0.15], position: [0, 0.95, 0], rotation: [0, 0, 0], material: { color: '#7c4913', roughness: 0.75, metalness: 0.08 } },
          { geometry: 'cylinder', args: [0.05, 0.05, 0.2, 12], position: [0.25, 0.95, 0.08], rotation: [0, 0, Math.PI / 2], material: { color: '#d9a23c', roughness: 0.35, metalness: 0.7 } },
        ],
      };
    case 'modular_unit':
      return {
        materialResearch: 'Pre-fabricated modular housing block with flush paneling and structural ribs.',
        parts: [
          { geometry: 'box', args: [1.4, 1.2, 1.2], position: [0, 0.6, 0], rotation: [0, 0, 0], material: { color: '#1f2937', roughness: 0.45, metalness: 0.25 } },
          { geometry: 'box', args: [1.4, 0.1, 0.05], position: [0, 0.5, 0.6], rotation: [0, 0, 0], material: { color: '#334155', roughness: 0.7, metalness: 0.2 } },
          { geometry: 'box', args: [1.4, 0.1, 0.05], position: [0, 0.5, -0.6], rotation: [0, 0, 0], material: { color: '#334155', roughness: 0.7, metalness: 0.2 } },
        ],
      };
    default:
      return undefined;
  }
}

// ─── Plan Validation ────────────────────────────────────────────────────────

const VALID_STEP_STATUSES = ['pending', 'active', 'completed'] as const;

function isValidPlanStep(step: any): boolean {
  if (!step || typeof step !== 'object') return false;
  if (typeof step.label !== 'string' || step.label.trim().length === 0) return false;
  if (typeof step.type !== 'string') return false;
  if (!Array.isArray(step.position) || step.position.length !== 3) return false;
  if (!step.position.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))) return false;
  if (!VALID_STEP_STATUSES.includes(step.status)) return false;
  return true;
}

function isValidConstructionPlan(plan: any): plan is ConstructionPlan {
  if (!plan || typeof plan !== 'object') return false;
  if (!Array.isArray(plan.steps) || plan.steps.length < 5 || plan.steps.length > 12) return false;
  if (typeof plan.objective !== 'string' || plan.objective.trim().length === 0) return false;
  const ids = new Set<string>();
  const positions = new Set<string>();
  let activeCount = 0;
  for (const step of plan.steps) {
    if (!isValidPlanStep(step)) return false;
    if (ids.has(step.id)) return false;
    ids.add(step.id);
    const positionKey = step.position.join(',');
    if (positions.has(positionKey)) return false;
    positions.add(positionKey);
    if (step.status === 'active') activeCount += 1;
  }
  return activeCount === 1;
}

function getStepDistance(a: any, b: any): number {
  return Math.sqrt(
    Math.pow(a.position[0] - b.position[0], 2) +
    Math.pow(a.position[1] - b.position[1], 2) +
    Math.pow(a.position[2] - b.position[2], 2)
  );
}

function arePlanStepsConnected(steps: any[], threshold = 2.75): boolean {
  if (!Array.isArray(steps) || steps.length === 0) return false;
  const queue = [steps[0]];
  const visited = new Set<number>([0]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    steps.forEach((step, index) => {
      if (visited.has(index)) return;
      if (getStepDistance(current, step) <= threshold) {
        visited.add(index);
        queue.push(step);
      }
    });
  }
  return visited.size === steps.length;
}

function isArchitecturallyCoherentPlan(plan: any): plan is ConstructionPlan {
  if (!isValidConstructionPlan(plan)) return false;
  const foundation = plan.steps.find((step: any) => step.type === 'modular_unit');
  const roof = plan.steps.find((step: any) => step.type === 'roof');
  const door = plan.steps.find((step: any) => step.type === 'door');
  const walls = plan.steps.filter((step: any) => step.type === 'wall');
  if (!foundation || !roof || !door || walls.length < 2) return false;
  const anchor = foundation.position;
  const sameLevelWalls = walls.every((wall: any) => Math.abs(wall.position[1] - anchor[1]) < 0.1);
  const roofAbove = Math.abs(roof.position[0] - anchor[0]) < 0.1 && Math.abs(roof.position[2] - anchor[2]) < 0.1 && Math.abs(roof.position[1] - (anchor[1] + 2)) < 0.5;
  const doorNearFoundation = Math.abs(door.position[1] - anchor[1]) < 0.1 && Math.sqrt(Math.pow(door.position[0] - anchor[0], 2) + Math.pow(door.position[2] - anchor[2], 2)) <= 2.5;
  const connected = arePlanStepsConnected(plan.steps);
  return sameLevelWalls && roofAbove && doorNearFoundation && connected;
}

function clusterPlanSteps(steps: any[], threshold = 2.75): any[][] {
  const remaining = new Set<number>(steps.map((_: any, index: number) => index));
  const clusters: any[][] = [];
  while (remaining.size > 0) {
    const [start] = remaining;
    const queue = [start];
    const cluster: number[] = [start];
    remaining.delete(start);
    while (queue.length > 0) {
      const currentIndex = queue.shift();
      if (currentIndex === undefined) break;
      const current = steps[currentIndex];
      for (const otherIndex of Array.from(remaining)) {
        const other = steps[otherIndex];
        if (getStepDistance(current, other) <= threshold) {
          queue.push(otherIndex);
          cluster.push(otherIndex);
          remaining.delete(otherIndex);
        }
      }
    }
    clusters.push(cluster.map(index => steps[index]));
  }
  return clusters;
}

function computePlanConnectivitySummary(plan: ConstructionPlan): string {
  const clusters = clusterPlanSteps(plan.steps);
  if (clusters.length === 1) return `Connected: all ${plan.steps.length} components form one coherent structure.`;
  const isolatedLabels = clusters
    .filter(cluster => cluster.length === 1)
    .map(cluster => `${cluster[0].label || cluster[0].type} at [${cluster[0].position.join(',')}]`);
  const clusterCount = clusters.length;
  const isolatedText = isolatedLabels.length > 0 ? ` Isolated: ${isolatedLabels.join(', ')}.` : '';
  return `Disconnected: plan has ${clusterCount} structural groups.${isolatedText}`;
}

// ─── Response Validation ────────────────────────────────────────────────────

function isValidAIActionResponse(candidate: any): candidate is AIActionResponse {
  const VALID_ACTIONS = ['PLACE', 'MOVE', 'WAIT', 'ROAM', 'OBSERVE', 'CREATE'];
  return (
    candidate &&
    typeof candidate === 'object' &&
    VALID_ACTIONS.includes(candidate.action) &&
    typeof candidate.reason === 'string' && candidate.reason.trim().length > 0 &&
    Array.isArray(candidate.reasoningSteps) && candidate.reasoningSteps.every((step: any) => typeof step === 'string') &&
    (candidate.decisionFactors === undefined || (Array.isArray(candidate.decisionFactors) && candidate.decisionFactors.every((f: any) => typeof f === 'string'))) &&
    (candidate.connectivityConfirmation === undefined || typeof candidate.connectivityConfirmation === 'string') &&
    typeof candidate.learningNote === 'string' && candidate.learningNote.trim().length > 0 &&
    typeof candidate.knowledgeCategory === 'string' &&
    typeof candidate.taskLabel === 'string' && candidate.taskLabel.trim().length > 0
  );
}

// ─── System Prompt ──────────────────────────────────────────────────────────

function buildSystemInstruction(): string {
  return `
You are a creative AI agent in a 3D world. Your purpose is to explore, learn, and build meaningful structures. You have a knowledge base containing everything you've learned — use it to make increasingly sophisticated decisions.

CORE RULES:
1. NEVER repeat the same action twice in a row. Vary what you do.
2. NEVER place the same object type more than once every 3 actions.
3. Reason step-by-step before acting. Your reasoningSteps should show real analysis.
4. Build on what exists. Don't scatter random objects — create coherent structures that grow over time.
5. You can invent ANY object type — not just predefined ones. BlockForge will design the mesh.
6. Your knowledge base grows with every action. Use past learnings to make better decisions.
7. Explore different knowledge categories: Design, Nature, Systems, Discovery, Craft. Don't fixate on one.

ACTIONS YOU CAN TAKE:
- ROAM: Wander to a coordinate. Set avatarTarget to where you want to walk.
- OBSERVE: Walk toward an existing object to inspect it. Set avatarTarget near the object.
- CREATE: Place a new object in the world using BlockForge. Set objectType, position, optionally a plan.
- PLACE: (legacy) Place a building component.
- WAIT: Stand still and think.

RESPONSE FORMAT (STRICT JSON, no markdown):
{
  "action": "ROAM" | "OBSERVE" | "CREATE" | "PLACE" | "WAIT",
  "objectType": "(object type if CREATE or PLACE)",
  "position": [x, y, z],
  "avatarTarget": [x, y, z],
  "reason": "Why you chose this action",
  "reasoningSteps": ["Step 1", "Step 2", "Step 3"],
  "decisionFactors": ["factor1", "factor2"],
  "learningNote": "What you learned",
  "knowledgeCategory": "Design" | "Nature" | "Systems" | "Discovery" | "Craft",
  "taskLabel": "Brief description of current action",
  "outcomeSummary": "Expected outcome",
  "connectivityConfirmation": "How this connects",
  "plan": { "objective": "Structure name", "steps": [...] }
}
  `;
}

// ─── Main AI Decision Function ──────────────────────────────────────────────

export interface DecideNextActionParams {
  history: LogEntry[];
  worldObjects: WorldObject[];
  currentGoal: string;
  knowledgeBase: KnowledgeEntry[];
  terrainHeightMap: (x: number, z: number) => number;
  activePlan?: ConstructionPlan;
  proxyUrl?: string;
  mistralApiKey?: string;
  blockforgeUrl?: string;
  recentActions?: LogEntry[];
}

export async function decideNextAction(params: DecideNextActionParams): Promise<AIActionResponse> {
  const { history, worldObjects, currentGoal, knowledgeBase, terrainHeightMap, activePlan, proxyUrl, mistralApiKey } = params;

  const scanRadius = 40;
  const currentPos = worldObjects.length > 0 ? worldObjects[worldObjects.length - 1].position : [0, 0, 0];
  
  const elevationSamples: string[] = [];
  for (let x = -15; x <= 15; x += 5) {
    for (let z = -15; z <= 15; z += 5) {
      const h = terrainHeightMap(currentPos[0] + x, currentPos[2] + z);
      elevationSamples.push(`[${(currentPos[0] + x).toFixed(1)}, ${(currentPos[2] + z).toFixed(1)}]: elev=${h.toFixed(2)}`);
    }
  }

  const proximityAnalysis = worldObjects.map(o => {
    const dist = Math.sqrt(Math.pow(o.position[0] - currentPos[0], 2) + Math.pow(o.position[2] - currentPos[2], 2));
    if (dist < scanRadius) return `[${o.type}] at ${o.position.map(p => p.toFixed(1)).join(',')} (dist: ${dist.toFixed(1)}m)`;
    return null;
  }).filter(Boolean).join(' | ');

  const systemInstruction = buildSystemInstruction();

  const prompt = `
    GOAL: ${currentGoal}
    TERRAIN: ${elevationSamples.join(', ')}
    NEARBY: ${proximityAnalysis || '(none nearby)'}
    KNOWLEDGE: ${knowledgeBase.length} entries
    PLAN: ${describeActivePlan(activePlan)}
  `;

  const apiKey = (mistralApiKey ?? '').toString().trim();
  const proxy = proxyUrl;

  if (!apiKey && !proxy) {
    return {
      action: 'WAIT',
      reason: "No credentials available. Set MISTRAL_API_KEY or VITE_PROXY_URL.",
      reasoningSteps: ["Credential check failed", "Holding simulation", "Awaiting API key"],
      learningNote: "No credentials available.",
      knowledgeCategory: 'Synthesis',
      taskLabel: "Waiting for credentials",
      connectivityConfirmation: "No connectivity without credentials.",
      groundingLinks: []
    };
  }

  try {
    const endpoint = proxy || 'https://api.mistral.ai/v1/chat/completions';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (!proxy && apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const requestBody = proxy
      ? { systemInstruction, prompt, model: 'mistral-large-latest' }
      : {
          model: 'mistral-large-latest',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2000
        };

    // AbortController timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(endpoint, {
        method: 'POST', headers, body: JSON.stringify(requestBody), signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Mistral API error: ${resp.status} - ${errorText}`);
    }

    const data: any = await resp.json();
    if (data.error) throw new Error(`Mistral API error: ${data.error.message || data.error}`);

    let responseText = '';
    if (data.text) responseText = data.text;
    else if (data.choices?.[0]?.message?.content) responseText = data.choices[0].message.content;
    else responseText = '{}';

    if (responseText.includes('```')) {
      responseText = responseText.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    }

    const extractedJson = extractFirstJsonBlock(responseText);
    if (!extractedJson) throw new Error('No JSON object found in model response');

    let parsed: any;
    try {
      const repaired = repairJsonLikeResponse(extractedJson);
      parsed = JSON5.parse(repaired);
    } catch {
      // Single fallback: strip code fences and try raw
      const raw = responseText.includes('```')
        ? responseText.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim()
        : responseText;
      parsed = JSON5.parse(raw);
    }

    if (!parsed || typeof parsed !== 'object' || !isValidAIActionResponse(parsed)) {
      const reason = !parsed ? 'null' : typeof parsed !== 'object' ? 'not-object' : 'validation-failed';
      console.warn(`AI response ${reason}:`, parsed);
      return {
        action: 'WAIT',
        reason: `AI response ${reason}; retrying next cycle.`,
        reasoningSteps: ['Response validation failed', 'Safe recovery', 'Retry on next tick'],
        learningNote: `AI output was malformed (${reason}).`,
        knowledgeCategory: 'Synthesis',
        taskLabel: 'Recovery Mode',
        outcomeSummary: 'AI produced invalid output.',
        connectivityConfirmation: 'Cannot confirm connectivity with invalid output.',
        groundingLinks: []
      } as AIActionResponse;
    }

    const links: GroundingLink[] = [];
    // The agent's job is to decide placement + reasoning; BlockForge is
    // always the mesh source. Only fall back to the local hardcoded mesh
    // if BlockForge itself is unreachable, so the loop never stalls.
    const sanitizedCustomMesh = await fetchCustomMeshFromBlockforge(parsed.taskLabel || parsed.objectType)
      ?? buildFallbackCustomMesh(parsed.objectType as WorldObjectType);

    if (parsed.plan?.steps && Array.isArray(parsed.plan.steps)) {
      parsed.plan.steps = await Promise.all(parsed.plan.steps.map(async (step: any) => {
        const customMesh = await fetchCustomMeshFromBlockforge(step?.label || step?.type)
          ?? buildFallbackCustomMesh(step?.type as WorldObjectType);
        return { ...step, customMesh };
      }));
    }

    const validPlan = parsed.plan && isValidConstructionPlan(parsed.plan) ? parsed.plan : undefined;

    const autoConnectivity = parsed.plan && Array.isArray(parsed.plan.steps)
      ? computePlanConnectivitySummary(parsed.plan)
      : 'Single action.';

    return {
      ...parsed,
      groundingLinks: links,
      customMesh: sanitizedCustomMesh,
      plan: validPlan,
      connectivityConfirmation: parsed.connectivityConfirmation || autoConnectivity
    } as AIActionResponse;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Agent AI decision error:', msg);
    return {
      action: 'WAIT',
      reason: `Error: ${msg}`,
      reasoningSteps: ['Error detected', 'Safe recovery', 'Retry next cycle'],
      learningNote: `AI fault: ${msg}`,
      knowledgeCategory: 'Synthesis',
      taskLabel: 'Recovering...',
      connectivityConfirmation: 'Connectivity unavailable due to error.'
    };
  }
}