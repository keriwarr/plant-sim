import * as THREE from 'three';
import { Plant, GrowthStage } from '../simulation/Plant';
import { createPlantGeometry, disposeGroup } from '../rendering/PlantMesh';
import type { Simulation } from '../simulation/Simulation';

export const PANEL_WIDTH = 300;
const PAD = 16;
const GAP = 8;

export class PlantPreview {
  private container: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private plantGroup: THREE.Group | null = null;
  private currentPlantId: number | null = null;
  private sim: Simulation;

  constructor(sim: Simulation) {
    this.sim = sim;

    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      top: `${PAD}px`,
      left: `${PAD}px`,
      width: `${PANEL_WIDTH}px`,
      bottom: `calc(50% + ${GAP / 2}px)`,
      borderRadius: '8px',
      overflow: 'hidden',
      display: 'none',
      zIndex: '1000',
      background: 'rgba(0, 0, 0, 0.85)',
      border: '1px solid rgba(255,255,255,0.15)',
    });
    document.body.appendChild(this.container);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(5, 10, 5);
    this.scene.add(light);

    window.addEventListener('resize', () => this.resizeRenderer());
  }

  show(plant: Plant): void {
    if (this.currentPlantId === plant.id) return;
    this.currentPlantId = plant.id;

    this.clearMesh();

    // Mature clone at origin — compute achievable size given growth rate and maturity age
    const mature = new Plant(0, 0, plant.genes, 999, plant.generation);
    (mature as any).id = plant.id;
    mature.stage = GrowthStage.Mature;
    const t = mature.traits;
    // Height limited by growth rate over maturity period
    mature.currentHeight = Math.min(t.maxHeight, 0.5 + t.growthRate * t.maturityAge);
    // Leaves limited by how many can grow before maturity
    const leafInterval = Math.max(1, Math.floor(t.maturityAge / t.leafCount));
    mature.currentLeafCount = Math.min(Math.round(t.leafCount), Math.floor(t.maturityAge / leafInterval));

    this.plantGroup = createPlantGeometry(mature, this.sim);
    this.scene.add(this.plantGroup);

    this.container.style.display = 'block';
    this.resizeRenderer();
    this.frameCamera(mature.currentHeight);
  }

  hide(): void {
    this.container.style.display = 'none';
    this.currentPlantId = null;
    this.clearMesh();
  }

  update(): void {
    if (!this.plantGroup || this.container.style.display === 'none') return;
    this.plantGroup.rotation.y += 0.015;
    this.renderer.render(this.scene, this.camera);
  }

  private frameCamera(plantHeight: number): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const aspect = w / Math.max(1, h);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    const dist = Math.max(plantHeight * 2.5, 25);
    // More overhead angle, plant sits toward bottom of viewport
    this.camera.position.set(dist * 0.35, plantHeight * 1.4, dist * 0.35);
    this.camera.lookAt(0, plantHeight * 0.55, 0);
  }

  private resizeRenderer(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  private clearMesh(): void {
    if (!this.plantGroup) return;
    this.scene.remove(this.plantGroup);
    disposeGroup(this.plantGroup);
    this.plantGroup = null;
  }
}
