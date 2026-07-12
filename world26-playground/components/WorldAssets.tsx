
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CustomMeshSpec, MeshPart, WorldObjectType } from '../src/types';
import * as THREE from 'three';

interface ObjectProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  variant?: 'real' | 'ghost';
  customMesh?: CustomMeshSpec;
}

const GhostMaterial: React.FC = () => {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.opacity = 0.15 + Math.sin(clock.elapsedTime * 4) * 0.05;
      matRef.current.emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * 4) * 0.3;
    }
  });
  return (
    <meshStandardMaterial 
      ref={matRef}
      color="#38bdf8" 
      transparent 
      opacity={0.2} 
      wireframe 
      emissive="#38bdf8"
      emissiveIntensity={0.8}
      side={THREE.DoubleSide}
    />
  );
};

const renderPartGeometry = (part: MeshPart) => {
  switch (part.geometry) {
    case 'box':
      return <boxGeometry args={part.args as [number, number, number]} />;
    case 'cylinder':
      return <cylinderGeometry args={part.args as [number, number, number, number]} />;
    case 'cone':
      return <coneGeometry args={part.args as [number, number, number]} />;
    case 'sphere':
      return <sphereGeometry args={part.args as [number, number, number]} />;
    case 'torus':
      return <torusGeometry args={part.args as [number, number, number, number]} />;
    default:
      return <boxGeometry args={[0.5, 0.5, 0.5]} />;
  }
};

const CustomMeshRenderer: React.FC<{
  customMesh: CustomMeshSpec;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  isGhost: boolean;
}> = ({ customMesh, position, rotation, scale, isGhost }) => (
  <group position={position} rotation={rotation} scale={scale}>
    {customMesh.parts.map((part, idx) => (
      <mesh
        key={`${part.geometry}-${idx}`}
        position={part.position || [0, 0, 0]}
        rotation={part.rotation || [0, 0, 0]}
        castShadow
        receiveShadow
      >
        {renderPartGeometry(part)}
        {isGhost ? (
          <GhostMaterial />
        ) : (
          <meshStandardMaterial
            color={part.material.color}
            roughness={part.material.roughness}
            metalness={part.material.metalness}
            emissive={part.material.emissive}
            emissiveIntensity={part.material.emissiveIntensity}
          />
        )}
      </mesh>
    ))}
  </group>
);

export const WorldAsset: React.FC<{ type: WorldObjectType } & ObjectProps> = ({ 
  type, 
  position, 
  rotation = [0, 0, 0], 
  scale = [1, 1, 1],
  variant = 'real',
  customMesh
}) => {
  const isGhost = variant === 'ghost';

  if (customMesh && customMesh.parts.length > 0) {
    return (
      <CustomMeshRenderer
        customMesh={customMesh}
        position={position}
        rotation={rotation}
        scale={scale}
        isGhost={isGhost}
      />
    );
  }

  const renderMaterial = (color: string, metalness = 0.3, roughness = 0.4, emissive?: string) => {
    if (isGhost) return <GhostMaterial />;
    return (
      <meshStandardMaterial 
        color={color} 
        roughness={roughness} 
        metalness={metalness} 
        emissive={emissive} 
        emissiveIntensity={emissive ? 0.3 : 0} 
      />
    );
  };

  switch (type) {
    case 'wall':
      return (
        <mesh position={[position[0], position[1] + 1.0, position[2]]} rotation={rotation} scale={scale} castShadow receiveShadow>
          <boxGeometry args={[2.2, 2.0, 0.3]} />
          {renderMaterial("#94a3b8", 0.1, 0.8)}
        </mesh>
      );
    case 'modular_unit':
      return (
        <group position={[position[0], position[1] + 1.0, position[2]]} rotation={rotation} scale={scale}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2.5, 2.0, 2.5]} />
            {renderMaterial("#1e293b", 0.6, 0.1, "#334155")}
          </mesh>
          {!isGhost && (
            <>
              <mesh scale={0.9}>
                <boxGeometry args={[2.5, 2.0, 2.5]} />
                <meshStandardMaterial color="#38bdf8" opacity={0.1} transparent wireframe />
              </mesh>
              {/* Glowing power lines */}
              {[[-1.26, 0, 0], [1.26, 0, 0], [0, 0, -1.26], [0, 0, 1.26]].map((pos, i) => (
                <mesh key={i} position={pos as [number, number, number]} rotation={i < 2 ? [0, 0, 0] : [0, Math.PI / 2, 0]}>
                  <cylinderGeometry args={[0.05, 0.05, 2.0]} />
                  <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={2} />
                </mesh>
              ))}
            </>
          )}
        </group>
      );
    case 'solar_panel':
      return (
        <group position={[position[0], position[1] + 0.5, position[2]]} rotation={rotation} scale={scale}>
          <mesh rotation={[-Math.PI / 5, 0, 0]} position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[1.8, 0.08, 1.4]} />
            {renderMaterial("#1e40af", 1, 0, "#2563eb")}
          </mesh>
          <mesh position={[0, 0, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.12, 1]} />
            {renderMaterial("#475569")}
          </mesh>
          {!isGhost && (
            <group position={[0, 0.4, -0.3]} rotation={[-Math.PI / 5, 0, 0]}>
               <mesh>
                  <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
                  <meshStandardMaterial color="#334155" />
               </mesh>
               {/* Rotating fan would need a component with useFrame, skipping for now to keep it simple but added detail */}
            </group>
          )}
        </group>
      );
    case 'water_collector':
      return (
        <group position={[position[0], position[1] + 0.6, position[2]]} rotation={rotation} scale={scale}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.7, 0.9, 1.2, 16]} />
            {renderMaterial("#0369a1", 0.2, 0.1, "#0ea5e9")}
          </mesh>
          <mesh position={[0, 0.75, 0]} castShadow>
            <coneGeometry args={[1.0, 0.4, 16]} />
            {renderMaterial("#94a3b8")}
          </mesh>
        </group>
      );
    case 'door':
      return (
        <mesh position={[position[0], position[1] + 1, position[2]]} rotation={rotation} scale={scale} castShadow receiveShadow>
          <boxGeometry args={[1, 2, 0.15]} />
          {renderMaterial("#78350f", 0.4, 0.6, "#92400e")}
        </mesh>
      );
    case 'fence':
      return (
        <group position={position} rotation={rotation} scale={scale}>
          <mesh position={[-0.9, 0.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.1, 1.2, 0.1]} />
            {renderMaterial("#57534e", 0.1, 0.9)}
          </mesh>
          <mesh position={[0.9, 0.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.1, 1.2, 0.1]} />
            {renderMaterial("#57534e", 0.1, 0.9)}
          </mesh>
          <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
            <boxGeometry args={[2, 0.1, 0.1]} />
            {renderMaterial("#78716c", 0.1, 0.9)}
          </mesh>
          <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
            <boxGeometry args={[2, 0.1, 0.1]} />
            {renderMaterial("#78716c", 0.1, 0.9)}
          </mesh>
        </group>
      );
    case 'crop':
      return (
        <group position={position} scale={scale}>
          <mesh position={[0, 0.05, 0]} receiveShadow>
            <boxGeometry args={[1.6, 0.1, 1.6]} />
            {renderMaterial("#422006", 0, 0.9)}
          </mesh>
          {[[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.35, z]} castShadow>
              <coneGeometry args={[0.15, 0.6, 6]} />
              {renderMaterial("#65a30d", 0, 0.7, "#84cc16")}
            </mesh>
          ))}
        </group>
      );
    case 'well':
      return (
        <group position={[position[0], position[1] + 0.5, position[2]]} rotation={rotation} scale={scale}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.9, 0.9, 0.9, 16]} />
            {renderMaterial("#78716c", 0.1, 0.9)}
          </mesh>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.7, 0.7, 0.05, 16]} />
            {renderMaterial("#0c4a6e", 0.3, 0.2, "#0ea5e9")}
          </mesh>
          {!isGhost && (
            <>
              <mesh position={[0, 1.4, 0]} castShadow>
                <boxGeometry args={[0.08, 1.8, 0.08]} />
                {renderMaterial("#57534e")}
              </mesh>
              <mesh position={[-0.6, 1.4, 0]} castShadow>
                <boxGeometry args={[0.08, 1.8, 0.08]} />
                {renderMaterial("#57534e")}
              </mesh>
              <mesh position={[0.6, 1.4, 0]} castShadow>
                <boxGeometry args={[0.08, 1.8, 0.08]} />
                {renderMaterial("#57534e")}
              </mesh>
              <mesh position={[0, 2.3, 0]} castShadow>
                <boxGeometry args={[1.3, 0.08, 0.08]} />
                {renderMaterial("#57534e")}
              </mesh>
            </>
          )}
        </group>
      );
    case 'roof':
      return (
        <mesh position={[position[0], position[1] + 2.75, position[2]]} rotation={rotation} scale={scale} castShadow receiveShadow>
          <coneGeometry args={[2.5, 1.5, 4]} />
          {renderMaterial("#451a03", 0, 1)}
        </mesh>
      );
    case 'tree':
      return (
        <group position={position} scale={scale}>
          <mesh position={[0, 1.5, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.3, 3, 8]} />
            {renderMaterial("#3f2b1c")}
          </mesh>
          <mesh position={[0, 3.2, 0]} castShadow>
            <sphereGeometry args={[1.2, 8, 8]} />
            {renderMaterial("#064e3b")}
          </mesh>
          <mesh position={[0.4, 2.5, 0.3]} castShadow>
            <sphereGeometry args={[0.7, 8, 8]} />
            {renderMaterial("#065f46")}
          </mesh>
        </group>
      );
    default:
      return (
        <mesh position={[position[0], position[1] + 0.5, position[2]]} scale={scale} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          {renderMaterial("#6366f1")}
        </mesh>
      );
  }
};
