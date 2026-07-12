import { SimulationState } from "../src/types";
import { logger } from './logger';

// The playground's own server.js exposes /api/state (Vite proxies /api
// requests to it in dev, see vite.config.ts). This is world-state
// persistence only — it has nothing to do with the AI agent boundary
// (see services/agentClient.ts for that).
//
// On a static deploy with no server.js running behind it, there's no
// network endpoint to hit, so we fall back to localStorage.
const getStateEndpoint = (): string | null => {
  if (import.meta.env.DEV || typeof window !== 'undefined') {
    return '/api/state';
  }

  // No known backend for state persistence -- use localStorage instead.
  return null;
};

const API_BASE = getStateEndpoint();
if (API_BASE) {
  console.log('📍 State endpoint:', API_BASE);
} else {
  console.log('📍 Using localStorage for state persistence');
}

export async function saveSimulationState(state: SimulationState): Promise<void> {
  try {
    // Use localStorage if no API endpoint available
    if (!API_BASE) {
      logger.debug('Memory', '💾 Saving state to localStorage');
      localStorage.setItem('world26_simulation_state', JSON.stringify(state));
      return;
    }
    
    logger.debug('Memory', '💾 Saving state to API', { endpoint: API_BASE });
    
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
    }
  } catch (err) {
    console.error("Failed to persist memory to API, falling back to localStorage:", err);
    // Don't silently lose the user's progress just because the backend is unreachable.
    try {
      localStorage.setItem('world26_simulation_state', JSON.stringify(state));
    } catch (storageErr) {
      console.error("localStorage fallback also failed:", storageErr);
    }
  }
}

export async function loadSimulationState(): Promise<SimulationState | null> {
  try {
    // Use localStorage if no API endpoint available
    if (!API_BASE) {
      logger.debug('Memory', '📂 Loading state from localStorage');
      const stored = localStorage.getItem('world26_simulation_state');
      const result = stored ? JSON.parse(stored) : null;
      logger.info('Memory', result ? '✅ State loaded' : '⚠️ No saved state found');
      return result;
    }
    
    logger.debug('Memory', '📂 Loading state from API', { endpoint: API_BASE });
    
    const resp = await fetch(API_BASE);
    if (!resp.ok) return null;
    const data: any = await resp.json();
    return data.state ?? null;
  } catch (err) {
    console.error("Failed to load memory from API, trying localStorage:", err);
    try {
      const stored = localStorage.getItem('world26_simulation_state');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }
}

