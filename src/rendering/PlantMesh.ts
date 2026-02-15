import * as THREE from 'three';
import { type Plant, GrowthStage } from '../simulation/Plant';
import type { Simulation } from '../simulation/Simulation';

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();

function seededRandom(seed: number): () => number {
  let s = seed + 1;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

// Create a leaf shape: pointed oval with optional lobes
function createLeafShape(size: number, rng: () => number): THREE.Shape {
  const shape = new THREE.Shape();
  const elongation = 0.6 + rng() * 0.8; // 0.6-1.4 length/width ratio
  const lobes = rng() > 0.5; // some leaves have wavy edges
  const w = size;
  const h = size * elongation;

  shape.moveTo(0, -h);

  if (lobes) {
    // Leaf with slight indentations
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = -Math.PI / 2 + Math.PI * t;
      const wobble = 1 + Math.sin(t * Math.PI * 4) * 0.12;
      const x = Math.cos(angle) * w * wobble;
      const y = Math.sin(angle) * h;
      shape.lineTo(x, y);
    }
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = Math.PI / 2 + Math.PI * t;
      const wobble = 1 + Math.sin(t * Math.PI * 4) * 0.12;
      const x = Math.cos(angle) * w * wobble;
      const y = Math.sin(angle) * h;
      shape.lineTo(x, y);
    }
  } else {
    // Smooth pointed oval
    shape.quadraticCurveTo(w * 1.1, -h * 0.3, w * 0.9, h * 0.2);
    shape.quadraticCurveTo(w * 0.5, h * 0.9, 0, h);
    shape.quadraticCurveTo(-w * 0.5, h * 0.9, -w * 0.9, h * 0.2);
    shape.quadraticCurveTo(-w * 1.1, -h * 0.3, 0, -h);
  }

  shape.closePath();
  return shape;
}

export function disposeGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) {
        child.material.dispose();
      }
    }
  });
}

export function createPlantGeometry(plant: Plant, sim: Simulation): THREE.Group {
  const group = new THREE.Group();

  if (plant.stage === GrowthStage.Seed || plant.currentHeight < 0.1) {
    const seedGeo = new THREE.SphereGeometry(0.5, 6, 4);
    const seedMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
    const seedMesh = new THREE.Mesh(seedGeo, seedMat);
    seedMesh.position.y = 0.25;
    group.add(seedMesh);
    return group;
  }

  const traits = plant.traits;
  const height = plant.currentHeight;
  const rng = seededRandom(plant.id);

  const trunkRadiusBottom = Math.max(0.3, traits.trunkGirth * 0.5);
  const trunkRadiusTop = trunkRadiusBottom * 0.4;
  const trunkColor = new THREE.Color(0.35 + rng() * 0.1, 0.22 + rng() * 0.05, 0.08);
  const trunkMat = new THREE.MeshLambertMaterial({ color: trunkColor });

  // Trunk stops at the highest branch attachment point
  const leafPositions = sim.getLeafPositions(plant);
  let maxAttachY = height * 0.3; // minimum trunk height
  for (let i = 0; i < plant.currentLeafCount; i++) {
    const lp = leafPositions[i];
    if (!lp) continue;
    const localX = lp.x - plant.x;
    const localZ = lp.y - plant.y;
    const leafY = lp.z;
    const attachY = Math.max(0, leafY - Math.abs(localX + localZ) * 0.3);
    if (attachY > maxAttachY) maxAttachY = attachY;
  }
  const trunkHeight = maxAttachY;

  const trunkGeo = new THREE.CylinderGeometry(trunkRadiusTop, trunkRadiusBottom, trunkHeight, 6, 1);
  const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
  trunkMesh.position.y = trunkHeight / 2;
  group.add(trunkMesh);

  // Leaf material — varies with photo efficiency
  const greenBase = 0.25 + Math.min(0.4, traits.photoEfficiency * 0.1);
  const leafColor = new THREE.Color(0.08, greenBase, 0.04);
  // Slightly lighter underside color for depth
  const leafColorLight = new THREE.Color(0.12, greenBase + 0.1, 0.06);

  // Create a leaf shape once per plant (all leaves share the same genetic shape)
  const leafRng = seededRandom(plant.id + 10000);
  const leafShape = createLeafShape(Math.max(0.5, traits.leafSize), leafRng);
  const leafGeo = new THREE.ShapeGeometry(leafShape, 3);

  // Add a central vein via vertex colors
  const leafColors = new Float32Array(leafGeo.attributes.position.count * 3);
  const positions = leafGeo.attributes.position;
  for (let v = 0; v < positions.count; v++) {
    const vx = positions.getX(v);
    const distFromCenter = Math.abs(vx) / Math.max(0.5, traits.leafSize);
    const t = Math.min(1, distFromCenter * 2);
    const r = leafColor.r * t + leafColorLight.r * (1 - t);
    const g = leafColor.g * t + leafColorLight.g * (1 - t);
    const b = leafColor.b * t + leafColorLight.b * (1 - t);
    leafColors[v * 3] = r;
    leafColors[v * 3 + 1] = g;
    leafColors[v * 3 + 2] = b;
  }
  leafGeo.setAttribute('color', new THREE.BufferAttribute(leafColors, 3));

  const leafMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: Math.min(0.95, traits.leafOpacity * 0.7 + 0.3),
  });

  for (let i = 0; i < plant.currentLeafCount; i++) {
    const leafPos = leafPositions[i];
    if (!leafPos) continue;

    const localX = leafPos.x - plant.x;
    const localZ = leafPos.y - plant.y;
    const leafY = leafPos.z;

    // Branch
    const attachY = Math.max(0, leafY - Math.abs(localX + localZ) * 0.3);
    const dx = localX;
    const dy = leafY - attachY;
    const dz = localZ;
    const branchLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (branchLength > 0.3) {
      const branchRadius = Math.max(0.15, trunkRadiusBottom * 0.25);
      const branchGeo = new THREE.CylinderGeometry(
        branchRadius * 0.3, branchRadius, branchLength, 4, 1
      );
      const branchMesh = new THREE.Mesh(branchGeo, trunkMat);

      branchMesh.position.set(
        localX / 2,
        (attachY + leafY) / 2,
        localZ / 2
      );

      _dir.set(dx, dy, dz).normalize();
      _quat.setFromUnitVectors(_up, _dir);
      branchMesh.quaternion.copy(_quat);

      group.add(branchMesh);
    }

    // Leaf
    const leafMesh = new THREE.Mesh(leafGeo, leafMat);
    leafMesh.position.set(localX, leafY, localZ);
    leafMesh.rotation.x = -Math.PI / 2;
    // Rotate each leaf to face outward from trunk + some variation
    const outwardAngle = Math.atan2(localZ, localX);
    leafMesh.rotation.z = outwardAngle + (rng() - 0.5) * 0.5;

    group.add(leafMesh);
  }

  return group;
}
