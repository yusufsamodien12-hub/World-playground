import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { WorldObject, WorldObjectType, SimulationState } from './types';
import { generateId } from './services/id';

const SimulationCanvas = lazy(() => import('../components/SimulationCanvas'));

const getTerrainHeight = (x: number, z: number) => {
  const height = (Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2.0) +
                 (Math.sin(x * 0.02) * Math.cos(z * 0.02) * 5.0);
  return Number(height.toFixed(3));
};

const WORLD_AGENT_STATE_URL = (import.meta as any)?.env?.VITE_WORLD_AGENT_STATE_URL as string | undefined
  ?? 'https://blockforge.yusufsamodien12.workers.dev';
const POLL_INTERVAL = 2000;

function getStateUrl(): string {
  const base = WORLD_AGENT_STATE_URL;
  if (!base) return 'https://blockforge.yusufsamodien12.workers.dev/state';
  return base.endsWith('/state') ? base : `${base}/state`;
}

const OBJECT_TYPES: { type: WorldObjectType; label: string; icon: string }[] = [
  { type: 'modular_unit', label: 'Building', icon: '🏗️' },
  { type: 'wall', label: 'Wall', icon: '🧱' },
  { type: 'roof', label: 'Roof', icon: '⛺' },
  { type: 'door', label: 'Door', icon: '🚪' },
  { type: 'tree', label: 'Tree', icon: '🌲' },
  { type: 'crop', label: 'Crop', icon: '🌾' },
  { type: 'well', label: 'Well', icon: '🪣' },
  { type: 'fence', label: 'Fence', icon: '🪵' },
  { type: 'solar_panel', label: 'Solar Panel', icon: '☀️' },
  { type: 'water_collector', label: 'Water Collector', icon: '💧' },
];

interface MetricsData {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgLatencyMs: number;
  uptimeMs: number;
}

function App() {
  const [objects, setObjects] = useState<WorldObject[]>([]);
  const [avatarPos, setAvatarPos] = useState<[number, number, number]>([0, getTerrainHeight(0, 0), 0]);
  const [freeCam, setFreeCam] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>(null);
  const metricsRef = useRef<ReturnType<typeof setInterval>>(null);

  // Poll World-Agent state
  useEffect(() => {
    let cancelled = false;
    let failCount = 0;
    async function poll() {
      try {
        const url = getStateUrl();
        const resp = await fetch(url, { cache: 'no-store', mode: 'cors' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        const data: any = await resp.json();
        const state: SimulationState | null = data?.state || null;
        if (!cancelled && state) {
          setObjects(state.objects || []);
          if (state.objects?.length > 0) {
            const last = state.objects[state.objects.length - 1];
            setAvatarPos(last.position);
          }
          setConnected(true);
          setLastSync(Date.now());
          failCount = 0;
        }
      } catch (err) {
        if (!cancelled) {
          failCount += 1;
          setConnected(false);
          console.error(`[World-playground] Poll failed #${failCount}:`, err);
        }
      }
    }
    pollRef.current = setInterval(poll, POLL_INTERVAL);
    poll();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Poll metrics
  useEffect(() => {
    async function fetchMetrics() {
      try {
        const resp = await fetch(`${WORLD_AGENT_STATE_URL}/metrics`, { cache: 'no-store' });
        if (resp.ok) setMetrics(await resp.json());
      } catch { /* non-fatal */ }
    }
    fetchMetrics();
    metricsRef.current = setInterval(fetchMetrics, 5000);
    return () => { if (metricsRef.current) clearInterval(metricsRef.current); };
  }, []);

  const placeObject = useCallback((type: WorldObjectType) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 2 + Math.random() * 3;
    const x = avatarPos[0] + Math.cos(angle) * distance;
    const z = avatarPos[2] + Math.sin(angle) * distance;
    const y = getTerrainHeight(x, z);

    const newObj: WorldObject = {
      id: generateId(),
      type,
      position: [x, y, z],
      rotation: [0, Math.random() * Math.PI * 2, 0],
      scale: [1, 1, 1],
      timestamp: Date.now(),
    };

    setObjects(prev => [...prev, newObj]);
    setAvatarPos([x, y, z]);
  }, [avatarPos]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-950">
      {/* 3D World */}
      <div className="absolute inset-0 w-full h-full">
        <Suspense fallback={
          <div className="w-full h-full flex items-center justify-center bg-slate-950 text-white">
            <div className="text-center">
              <div className="mb-4 text-6xl">🌍</div>
              <div className="text-xl font-bold">Loading World...</div>
            </div>
          </div>
        }>
          <SimulationCanvas objects={objects} avatarPos={avatarPos} avatarTarget={null} freeCam={freeCam} onFreeCamChange={setFreeCam} />
        </Suspense>
      </div>

      {/* Minimal top-left title */}
      <div className="absolute top-4 left-4 z-10">
        <div className="text-xs font-black tracking-[0.3em] text-white/30 uppercase">World-30</div>
        <div className={`text-[10px] font-mono mt-1 ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
          {connected ? `● Synced${lastSync ? ` • ${new Date(lastSync).toLocaleTimeString()}` : ''}` : '○ Disconnected'}
        </div>
        {metrics && (
          <div className="text-[9px] font-mono mt-1.5 text-white/40 space-y-0.5 bg-black/40 backdrop-blur-xl px-2 py-1.5 rounded-lg border border-white/5">
            <div className="text-[8px] text-white/30 uppercase tracking-wider font-bold mb-0.5">API Metrics</div>
            <div>Req: {metrics.totalRequests} | OK: {metrics.successCount} | Err: {metrics.errorCount}</div>
            <div>Avg Lat: {metrics.avgLatencyMs}ms | Objects: {objects.length}</div>
          </div>
        )}
      </div>

      {/* Bottom toolbar - object placement */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-xl px-3 py-2 rounded-full border border-white/10">
          {OBJECT_TYPES.map(({ type, icon }) => (
            <button
              key={type}
              onClick={() => placeObject(type)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-all active:scale-90 text-lg"
              title={type.replace('_', ' ')}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;