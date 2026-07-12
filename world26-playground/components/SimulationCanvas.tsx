
import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { WorldObject, ConstructionPlan } from '../src/types';
import { WorldAsset } from './WorldAssets';
import { Avatar } from './Avatar';

interface SimulationCanvasProps {
  objects: WorldObject[];
  avatarPos: [number, number, number];
  avatarTarget: [number, number, number] | null;
  activePlan?: ConstructionPlan;
}

const Terrain: React.FC = () => {
  const meshRef = React.useRef<THREE.Mesh>(null);
  
  // Create a vertex-based terrain that matches getTerrainHeight logic
  // Vast world scale: 1000x1000
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(1000, 1000, 128, 128);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getY(i);
      // Multi-layered noise for more "vast" look
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

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ objects, avatarPos, avatarTarget, activePlan }) => {
  const ghostObjects = useMemo(() => {
    if (!activePlan) return [];
    return activePlan.steps.filter(step => step.status !== 'completed');
  }, [activePlan]);

  return (
    <div className="w-full h-full bg-black">
      <Canvas camera={{ position: [10, 8, 12], fov: 45, far: 2000 }} shadows>
        <color attach="background" args={['#020617']} />
        <fogExp2 attach="fog" args={['#020617', 0.015]} />
        
        <hemisphereLight skyColor="#f3f4f6" groundColor="#cbd5e1" intensity={0.22} />
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

        {/* Existing Real Objects */}
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

        {/* Planned Ghost Objects */}
        {ghostObjects.map((step, idx) => (
          <WorldAsset 
            key={`ghost-${idx}`} 
            type={step.type} 
            position={step.position} 
            variant="ghost"
            customMesh={step.customMesh}
          />
        ))}

        <Avatar position={avatarPos} targetPosition={avatarTarget} isThinking={activePlan === undefined} />

        <ContactShadows opacity={0.4} scale={100} blur={2.5} far={20} />
        <OrbitControls
          makeDefault
          target={[avatarPos[0], avatarPos[1], avatarPos[2]]}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.1}
        />

        {/* Postprocessing effects disabled due to compatibility issues in the current package version. */}
      </Canvas>
    </div>
  );
};

export default SimulationCanvas;
