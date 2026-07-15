import { WorldObject, CustomMeshSpec, WorldObjectType } from '../src/types';
import * as THREE from 'three';

export interface AABB {
  min: [number, number, number];
  max: [number, number, number];
}

const AVATAR_RADIUS = 0.4;
const AVATAR_HEIGHT = 1.2;
const COLLISION_MARGIN = 0.05;

const TYPE_SIZES: Record<string, [number, number, number]> = {
  wall:           [2.2, 2.0, 0.3],
  modular_unit:   [2.5, 2.0, 2.5],
  solar_panel:    [1.8, 1.5, 1.4],
  water_collector:[1.8, 1.6, 1.8],
  door:           [1.0, 2.0, 0.15],
  fence:          [2.0, 1.2, 0.1],
  crop:           [1.6, 0.7, 1.6],
  well:           [1.8, 2.4, 1.8],
  tree:           [2.4, 4.0, 2.4],
  roof:           [2.5, 1.5, 2.5],
};

function getBaseSize(type: WorldObjectType): [number, number, number] | null {
  return TYPE_SIZES[type] ?? null;
}

function computeCustomMeshAABB(customMesh: CustomMeshSpec): [number, number, number] | null {
  if (!customMesh.parts.length) return null;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const part of customMesh.parts) {
    const [px, py, pz] = part.position || [0, 0, 0];
    const [rx, ry, rz] = part.rotation || [0, 0, 0];
    let halfW = 0.5, halfH = 0.5, halfD = 0.5;
    switch (part.geometry) {
      case 'box': {
        const [w = 0.5, h = 0.5, d = 0.5] = part.args as number[];
        halfW = w / 2; halfH = h / 2; halfD = d / 2;
        break;
      }
      case 'cylinder':
      case 'cone': {
        const [r = 0.5, h = 0.5] = part.args as number[];
        halfW = r; halfD = r; halfH = h / 2;
        break;
      }
      case 'sphere': {
        const [r = 0.5] = part.args as number[];
        halfW = r; halfD = r; halfH = r;
        break;
      }
      case 'torus': {
        const [r = 0.5, tube = 0.2] = part.args as number[];
        halfW = r + tube; halfD = r + tube; halfH = tube;
        break;
      }
    }
    const cosRz = Math.cos(rz || 0), sinRz = Math.sin(rz || 0);
    const cosRx = Math.cos(rx || 0), sinRx = Math.sin(rx || 0);
    const corners = [
      [-halfW, -halfH, -halfD], [-halfW, -halfH, halfD],
      [-halfW, halfH, -halfD],  [-halfW, halfH, halfD],
      [halfW, -halfH, -halfD],  [halfW, -halfH, halfD],
      [halfW, halfH, -halfD],   [halfW, halfH, halfD],
    ];
    for (const [cx, cy, cz] of corners) {
      let x = cx * cosRz - cz * sinRz;
      let z = cx * sinRz + cz * cosRz;
      let y = cy;
      const tempY = y * cosRx - z * sinRx;
      z = y * sinRx + z * cosRx;
      y = tempY;
      x += px; y += py; z += pz;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }

  if (!isFinite(minX)) return null;
  const w = maxX - minX;
  const h = maxY - minY;
  const d = maxZ - minZ;
  return [w || 0.5, h || 0.5, d || 0.5];
}

export function getObjectAABB(obj: WorldObject): AABB | null {
  const [ox, oy, oz] = obj.position;
  const sc = obj.scale || [1, 1, 1];

  let size: [number, number, number] | null = null;

  if (obj.customMesh && obj.customMesh.parts.length > 0) {
    size = computeCustomMeshAABB(obj.customMesh);
  } else {
    size = getBaseSize(obj.type);
  }

  if (!size) return null;

  const halfW = (size[0] / 2) * sc[0] + AVATAR_RADIUS + COLLISION_MARGIN;
  const halfH = (size[1] / 2) * sc[1] + AVATAR_RADIUS + COLLISION_MARGIN;
  const halfD = (size[2] / 2) * sc[2] + AVATAR_RADIUS + COLLISION_MARGIN;

  return {
    min: [ox - halfW, oy - halfH, oz - halfD],
    max: [ox + halfW, oy + halfH, oz + halfD],
  };
}

export function checkAABBOverlap(pos: [number, number, number], box: AABB): boolean {
  const [px, py, pz] = pos;
  return (
    px >= box.min[0] && px <= box.max[0] &&
    py >= box.min[1] && py <= box.max[1] &&
    pz >= box.min[2] && pz <= box.max[2]
  );
}

const MAX_COLLISION_ITERATIONS = 8;

export function resolveCollision(
  desiredPos: [number, number, number],
  objects: WorldObject[],
  depth = 0
): [number, number, number] {
  if (depth >= MAX_COLLISION_ITERATIONS) return desiredPos;
  for (const obj of objects) {
    const box = getObjectAABB(obj);
    if (!box) continue;
    if (checkAABBOverlap(desiredPos, box)) {
      // Push out along the shallowest axis
      const [px, py, pz] = desiredPos;
      const overlapX = Math.min(px - box.min[0], box.max[0] - px);
      const overlapY = Math.min(py - box.min[1], box.max[1] - py);
      const overlapZ = Math.min(pz - box.min[2], box.max[2] - pz);

      let newPos: [number, number, number] = [px, py, pz];

      // Push out along the axis with the smallest overlap
      if (overlapX <= overlapY && overlapX <= overlapZ) {
        const distToMin = Math.abs(px - box.min[0]);
        const distToMax = Math.abs(px - box.max[0]);
        newPos[0] += distToMin < distToMax ? -(overlapX + 0.02) : (overlapX + 0.02);
      } else if (overlapY <= overlapX && overlapY <= overlapZ) {
        const distToMin = Math.abs(py - box.min[1]);
        const distToMax = Math.abs(py - box.max[1]);
        newPos[1] += distToMin < distToMax ? -(overlapY + 0.02) : (overlapY + 0.02);
      } else {
        const distToMin = Math.abs(pz - box.min[2]);
        const distToMax = Math.abs(pz - box.max[2]);
        newPos[2] += distToMin < distToMax ? -(overlapZ + 0.02) : (overlapZ + 0.02);
      }

      return resolveCollision(newPos, objects, depth + 1);
    }
  }
  return desiredPos;
}

export function isPositionBlocked(
  pos: [number, number, number],
  objects: WorldObject[]
): boolean {
  for (const obj of objects) {
    const box = getObjectAABB(obj);
    if (!box) continue;
    if (checkAABBOverlap(pos, box)) return true;
  }
  return false;
}