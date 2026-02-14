import * as THREE from 'three';

export function createGround(width: number, height: number): THREE.Mesh {
  const depth = 12;
  const geometry = new THREE.BoxGeometry(width, depth, height);
  const material = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
  const ground = new THREE.Mesh(geometry, material);
  ground.position.set(width / 2, -depth / 2, height / 2);
  return ground;
}
