import React, { useState, useCallback, Suspense, lazy } from 'react';
import { WorldObject, WorldObjectType } from './types';
import { generateId } from './services/id';

const SimulationCanvas = lazy(() => import('../components/SimulationCanvas'));

const getTerrainHeight = (x: number, z: number) => {
  const height = (Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2.0) +
                 (Math.sin(x * 0.02) * Math.cos(z * 0.02) * 5.0);
  return Number(height.toFixed(3));
};

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