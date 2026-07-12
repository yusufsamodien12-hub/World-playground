// Centralized ID generation.
//
// The previous approach (`Math.random().toString()`) is not collision-safe:
// it produces short, low-entropy strings and — because it was called many
// times per second during auto-pilot — occasionally generated duplicate IDs
// for logs, world objects, and API metrics. Duplicate `key`s in React lists
// cause silent rendering bugs (stale nodes, mismatched state).
//
// `crypto.randomUUID()` is available in all modern browsers and Node 19+.
// We fall back to a timestamp+random string for older environments.
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
