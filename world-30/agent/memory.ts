/**
 * Agent Memory Provider - Handles state persistence for the Architect-OS.
 * Supports localStorage (browser) and API-based (Cloudflare Worker) storage.
 * Framework-agnostic.
 */

import { AgentState, MemoryProvider } from './types';

/**
 * Determines the state persistence endpoint based on environment configuration.
 * Returns null if no backend is available (falls back to localStorage).
 */
function getStateEndpoint(proxyUrl?: string): string | null {
  if (proxyUrl && typeof proxyUrl === 'string' && proxyUrl.includes('workers.dev')) {
    const baseUrl = proxyUrl.split('/v1/')[0];
    return `${baseUrl}/state`;
  }
  return null;
}

/**
 * LocalStorage-based memory provider for browser environments.
 */
export class LocalStorageMemory implements MemoryProvider {
  private storageKey: string;

  constructor(storageKey: string = 'world26_agent_state') {
    this.storageKey = storageKey;
  }

  async save(state: AgentState): Promise<void> {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (err) {
      console.error('LocalStorage save failed:', err);
    }
  }

  async load(): Promise<AgentState | null> {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  clear(): void {
    localStorage.removeItem(this.storageKey);
  }
}

/**
 * API-based memory provider for Cloudflare Worker / D1 persistence.
 */
export class ApiMemory implements MemoryProvider {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async save(state: AgentState): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    if (!response.ok) {
      throw new Error(`State save failed: ${response.status}`);
    }
  }

  async load(): Promise<AgentState | null> {
    const resp = await fetch(this.endpoint);
    if (!resp.ok) return null;
    const data: any = await resp.json();
    return data.state ?? null;
  }
}

/**
 * Creates the appropriate memory provider based on configuration.
 * Falls back to localStorage if no API endpoint is available.
 */
export function createMemoryProvider(proxyUrl?: string, stateEndpoint?: string): MemoryProvider {
  // If a custom state endpoint is provided, use API memory
  if (stateEndpoint) {
    return new ApiMemory(stateEndpoint);
  }

  // Derive endpoint from proxy URL
  const endpoint = getStateEndpoint(proxyUrl);
  if (endpoint) {
    return new ApiMemory(endpoint);
  }

  // Fall back to localStorage
  return new LocalStorageMemory();
}