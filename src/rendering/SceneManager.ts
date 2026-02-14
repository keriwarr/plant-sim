import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createGround } from './Ground';
import { createPlantGeometry } from './PlantMesh';
import { Plant } from '../simulation/Plant';
import type { Simulation } from '../simulation/Simulation';

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private plantMeshes: Map<number, THREE.Group> = new Map();
  private sim: Simulation;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // For plant inspector
  selectedPlantId: number | null = null;
  onPlantSelected?: (plant: Plant | null) => void;

  constructor(sim: Simulation) {
    this.sim = sim;
    const w = sim.config.gridWidth;
    const h = sim.config.gridHeight;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB); // sky blue

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
    this.camera.position.set(w * 0.5, w * 0.25, h * 1.4);
    this.camera.lookAt(w / 2, 0, h / 2);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    document.body.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(w / 2, 0, h / 2);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.update();

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(w * 0.3, w, h * 0.3);
    this.scene.add(sun);

    // Ground plane
    this.scene.add(createGround(w, h));

    // Handle resize
    window.addEventListener('resize', () => this.onResize());

    // Click to select plant
    this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));

    // Wire up simulation events
    sim.onPlantAdded = (plant) => this.addPlantMesh(plant);
    sim.onPlantRemoved = (plant) => this.removePlantMesh(plant);

    // Add meshes for initial plants
    for (const plant of sim.plants) {
      this.addPlantMesh(plant);
    }
  }

  private addPlantMesh(plant: Plant): void {
    const group = createPlantGeometry(plant, this.sim);
    group.position.set(plant.x, 0, plant.y);
    group.userData.plantId = plant.id;
    this.scene.add(group);
    this.plantMeshes.set(plant.id, group);
  }

  private removePlantMesh(plant: Plant): void {
    const mesh = this.plantMeshes.get(plant.id);
    if (mesh) {
      this.scene.remove(mesh);
      // Dispose geometry and materials
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      this.plantMeshes.delete(plant.id);
    }
    if (this.selectedPlantId === plant.id) {
      this.selectedPlantId = null;
      this.onPlantSelected?.(null);
    }
  }

  updatePlantMeshes(): void {
    for (const plant of this.sim.plants) {
      if (!plant.meshDirty) continue;
      plant.meshDirty = false;

      // Remove old mesh and create new one
      const oldMesh = this.plantMeshes.get(plant.id);
      if (oldMesh) {
        this.scene.remove(oldMesh);
        oldMesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
      }

      const newGroup = createPlantGeometry(plant, this.sim);
      newGroup.position.set(plant.x, 0, plant.y);
      newGroup.userData.plantId = plant.id;
      this.scene.add(newGroup);
      this.plantMeshes.set(plant.id, newGroup);
    }
  }

  private onClick(event: MouseEvent): void {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const meshes: THREE.Object3D[] = [];
    this.plantMeshes.forEach(group => {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshes.push(child);
        }
      });
    });

    const intersects = this.raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      // Walk up to find the group with plantId
      let obj: THREE.Object3D | null = intersects[0].object;
      while (obj && obj.userData.plantId === undefined) {
        obj = obj.parent;
      }
      if (obj && obj.userData.plantId !== undefined) {
        this.selectedPlantId = obj.userData.plantId;
        const plant = this.sim.plants.find(p => p.id === this.selectedPlantId);
        this.onPlantSelected?.(plant ?? null);
      }
    } else {
      this.selectedPlantId = null;
      this.onPlantSelected?.(null);
    }
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
