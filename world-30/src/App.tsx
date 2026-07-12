import React, { useState, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
import { WorldObject, WorldObjectType } from './types';
import { generateId } from './services/id';
import { ArchitectAgent } from '../agent';

const SimulationCanvas = lazy(() => import('../components/SimulationCanvas'));

const getTerrainHeight = (x: number, z: number) => {
  const height = (Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2.0) +
                 (Math.sin(x * 0.02) * Math.cos(z * 0.02) * 5.0);
  return Number(height.toFixed(3));
};

const AGENT_PROXY_URL = import.meta.env.VITE_PROXY_URL as string | undefined;

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

function App() {
  const [objects, setObjects] = useState<WorldObject[]>([]);
  const [avatarPos, setAvatarPos] = useState<[number, number, number]>([0, getTerrainHeight(0, 0), 0]);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentTask, setAgentTask] = useState('Idle');
  const agentRef = useRef<ArchitectAgent | null>(null);

  // Autonomous agent: builds structures on its own by calling the World26
  // Mistral proxy, mirroring the same decision loop used by World-Agent.
  useEffect(() => {
    const agent = new ArchitectAgent(
      {
        proxyUrl: AGENT_PROXY_URL,
        terrainHeightFn: getTerrainHeight,
        autoStart: false,
        stepInterval: 5000,
      },
      {
        onStateChange: (state) => {
          setObjects(state.objects as unknown as WorldObject[]);
          if (state.objects.length > 0) {
            const last = state.objects[state.objects.length - 1];
            setAvatarPos(last.position);
          }
        },
        onTaskUpdate: (task) => setAgentTask(task),
      }
    );
    agentRef.current = agent;
    return () => agent.stop();
  }, []);

  const toggleAgent = useCallback(() => {
    const agent = agentRef.current;
    if (!agent) return;
    if (agent.getIsRunning()) {
      agent.stop();
      setAgentRunning(false);
    } else {
      agent.start();
      setAgentRunning(true);
    }
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
          <SimulationCanvas objects={objects} avatarPos={avatarPos} avatarTarget={null} />
        </Suspense>
      </div>

      {/* Minimal top-left title */}
      <div className="absolute top-4 left-4 z-10">
        <div className="text-xs font-black tracking-[0.3em] text-white/30 uppercase">World-30</div>
      </div>

      {/* Agent control */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3">
        <button
          onClick={toggleAgent}
          className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border transition-all ${
            agentRunning
              ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
              : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
          }`}
        >
          {agentRunning ? '● Agent Building' : 'Start Agent'}
        </button>
        {agentRunning && (
          <div className="text-xs font-mono text-white/40 max-w-xs truncate">{agentTask}</div>
        )}
      </div>

      {/* Object count */}
      <div className="absolute top-4 right-4 z-10">
        <div className="text-xs font-mono text-white/30">{objects.length} objects</div>
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