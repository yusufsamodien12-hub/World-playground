import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { WorldObject } from '../src/types';
import { WorldAsset } from './WorldAssets';
import { Avatar } from './Avatar';

interface SimulationCanvasProps {
  objects: WorldObject[];
  avatarPos: [number, number, number];
  avatarTarget: [number, number, number] | null;
  selectedType?: string | null;
  onPlaceObject?: (position: [number, number, number]) => void;
  freeCam: boolean;
  onFreeCamChange: (free: boolean) => void;
}

const Terrain: React.FC = () => {
  const meshRef = React.useRef<THREE.Mesh>(null);
  
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(1000, 1000, 128, 128);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getY(i);
      const h = (Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2.0) +
                (Math.sin(x * 0.02) * Math.cos(z * 0.02) * 5.0);
      pos.setZ(i, h);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh ref={meshRef} geometry={geom} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <meshStandardMaterial
        color="#0f172a"
        roughness={0.8}
        metalness={0.2}
        flatShading
        emissive="#0c4a6e"
        emissiveIntensity={0.05}
      />
    </mesh>
  );
};

// Game-style free camera with WASD movement when "broken free"
const FreeCameraController: React.FC<{
  avatarPos: [number, number, number];
  freeCam: boolean;
  onReturnToAgent: () => void;
}> = ({ avatarPos, freeCam, onReturnToAgent }) => {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const keysRef = useRef<Set<string>>(new Set());
  const freeTargetRef = useRef<THREE.Vector3>(new THREE.Vector3());

  // When entering freecam, initialize target in front of the camera
  useEffect(() => {
    if (freeCam && controlsRef.current) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      freeTargetRef.current.copy(camera.position).add(dir.multiplyScalar(10));
      controlsRef.current.target.copy(freeTargetRef.current);
      controlsRef.current.update();
    }
  }, [freeCam]);

  // Keep orbit target synced to freeTargetRef in free mode
  useEffect(() => {
    if (!freeCam || !controlsRef.current) return;
    const id = setInterval(() => {
      controlsRef.current.target.copy(freeTargetRef.current);
    }, 50);
    return () => clearInterval(id);
  }, [freeCam]);

  // When returning to follow mode, snap camera behind and above the agent
  useEffect(() => {
    if (!freeCam && controlsRef.current) {
      const offset = new THREE.Vector3(0, 8, 12);
      const targetPos = new THREE.Vector3(avatarPos[0], avatarPos[1], avatarPos[2]);
      const newCamPos = targetPos.clone().add(offset);
      camera.position.copy(newCamPos);
      controlsRef.current.target.copy(targetPos);
      controlsRef.current.update();
    }
  }, [freeCam, avatarPos, camera]);

  // WASD + QE + mouse game controls when free
  useEffect(() => {
    if (!freeCam) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Press R or Escape to snap back to agent
      if (e.key === 'r' || e.key === 'R' || e.key === 'Escape') {
        onReturnToAgent();
        return;
      }
      keysRef.current.add(e.key.toLowerCase());
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [freeCam, onReturnToAgent]);

  // Game camera movement loop
  useEffect(() => {
    if (!freeCam) return;

    let frameId: number;
    const speed = 0.4;
    const keys = keysRef.current;

    const update = () => {
      const direction = new THREE.Vector3();
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);

      // Get camera forward/right vectors (ignore y for movement plane)
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      right.crossVectors(forward, up).normalize();

      // WASD movement
      if (keys.has('w')) direction.add(forward);
      if (keys.has('s')) direction.sub(forward);
      if (keys.has('a')) direction.sub(right);
      if (keys.has('d')) direction.add(right);
      if (keys.has('e')) direction.add(up);
      if (keys.has('q')) direction.sub(up);

      if (direction.length() > 0) {
        direction.normalize().multiplyScalar(speed);
        camera.position.add(direction);
        freeTargetRef.current.add(direction);
      }

      frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [freeCam, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={freeCam ? freeTargetRef.current : [avatarPos[0], avatarPos[1], avatarPos[2]]}
      enableDamping={!freeCam}
      dampingFactor={0.1}
      minDistance={1}
      maxDistance={500}
      minPolarAngle={freeCam ? 0 : 0}
      maxPolarAngle={freeCam ? Math.PI : Math.PI / 2.1}
      enablePan={freeCam}
      mouseButtons={{
        LEFT: freeCam ? THREE.MOUSE.ROTATE : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.PAN
      }}
    />
  );
};

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ 
  objects, 
  avatarPos, 
  avatarTarget, 
  freeCam, 
  onFreeCamChange 
}) => {
  const handleReturnToAgent = useCallback(() => {
    onFreeCamChange(false);
  }, [onFreeCamChange]);

  return (
    <div className="w-full h-full bg-black relative">
      {/* Camera Controls Help */}
      {freeCam && (
        <div className="absolute top-4 left-4 z-50 space-y-2">
          <button
            onClick={() => onFreeCamChange(false)}
            className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 border border-sky-400/40 text-sky-300 hover:bg-sky-500/30 transition-all"
            title="Press R or Escape to snap back"
          >
            🔗 Return to Agent
          </button>
          <div className="text-[9px] text-white/40 bg-black/60 backdrop-blur-xl px-3 py-2 rounded-xl border border-white/10 space-y-0.5">
            <div className="font-bold text-white/60 uppercase tracking-wider mb-1">Game Camera</div>
            <div>WASD - Move | Q/E - Up/Down</div>
            <div>Mouse - Look | Scroll - Zoom</div>
            <div>R/Esc - Return to agent</div>
          </div>
        </div>
      )}

      {/* Free Cam Toggle Button */}
      {!freeCam && (
        <button
          onClick={() => onFreeCamChange(true)}
          className="absolute top-4 left-4 z-50 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-black/60 text-white/50 backdrop-blur-xl border border-white/10 hover:text-white hover:bg-black/80 transition-all"
          title="Break free - use WASD to move camera"
        >
          🔓 Free Camera
        </button>
      )}

      <Canvas camera={{ position: [10, 8, 12], fov: 45, far: 2000 }} shadows>
        <color attach="background" args={['#020617']} />
        <fogExp2 attach="fog" args={['#020617', 0.015]} />
        
        <hemisphereLight args={['#f3f4f6', '#cbd5e1', 0.22]} />
        <ambientLight intensity={0.28} />
        <pointLight position={[8, 8, 8]} intensity={1.0} color="#ffffff" />
        <directionalLight 
          position={[-10, 18, 10]}
          intensity={1.1} 
          castShadow 
          shadow-mapSize={[2048, 2048]}
          color="#fff7e6"
        />
        <directionalLight
          position={[12, 16, -8]}
          intensity={0.35}
          color="#f8e7c4"
        />

        <Terrain />
        <gridHelper args={[1000, 100, '#1e293b', '#0f172a']} position={[0, -0.05, 0]} />

        <Sparkles count={120} scale={45} size={1.2} speed={0.3} color="#38bdf8" opacity={0.15} />
        <Sparkles count={40} scale={30} size={2.5} speed={0.45} color="#f43f5e" opacity={0.16} />

        {objects.map((obj) => (
          <WorldAsset 
            key={obj.id} 
            type={obj.type} 
            position={obj.position} 
            rotation={obj.rotation} 
            scale={obj.scale} 
            variant="real"
            customMesh={obj.customMesh}
          />
        ))}

        <Avatar position={avatarPos} targetPosition={avatarTarget} objects={objects} />

        <ContactShadows opacity={0.4} scale={100} blur={2.5} far={20} />
        
        <FreeCameraController 
          avatarPos={avatarPos} 
          freeCam={freeCam} 
          onReturnToAgent={handleReturnToAgent} 
        />
      </Canvas>
    </div>
  );
};

export default SimulationCanvas;