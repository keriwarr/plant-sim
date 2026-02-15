import { Simulation } from './simulation/Simulation';
import { SceneManager } from './rendering/SceneManager';
import { createControls, loadSavedControls, SPEED_STEPS, type SimControls } from './ui/Controls';
import { showInspector } from './ui/Inspector';
import { PlantPreview } from './ui/PlantPreview';

const saved = loadSavedControls();

const sim = new Simulation({
  gridWidth: 256,
  gridHeight: 256,
  initialPlants: 30,
  maxPlants: saved.maxPlants ?? 2000,
});

const scene = new SceneManager(sim);

const controls: SimControls = {
  ticksPerFrame: saved.ticksPerFrame ?? 1,
  paused: saved.paused ?? true,
  maxPlants: sim.config.maxPlants,
  fps: 0,
};

const { gui, updateDisplay, setSpeed } = createControls(sim, controls);

const preview = new PlantPreview(sim);

scene.onPlantSelected = (plant) => {
  showInspector(plant);
  if (plant) {
    preview.show(plant);
  } else {
    preview.hide();
  }
};

window.addEventListener('keydown', (e) => {
  if (e.target !== document.body) return;

  if (e.code === 'Space') {
    e.preventDefault();
    controls.paused = !controls.paused;
    gui.controllersRecursive().find(c => c.property === 'paused')?.updateDisplay();
    return;
  }

  // Keys 1-7 select speed step
  const digit = parseInt(e.key);
  if (digit >= 1 && digit <= SPEED_STEPS.length) {
    setSpeed(digit - 1);
  }
});

const MIN_FRAME_MS = 1000 / 60;
let lastFrameTime = 0;
let fpsAccum = 0;
let fpsFrames = 0;

function animate(now: number): void {
  requestAnimationFrame(animate);

  if (now - lastFrameTime < MIN_FRAME_MS) return;
  const dt = now - lastFrameTime;
  lastFrameTime = now;

  // Smooth FPS over ~0.5s
  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 500) {
    controls.fps = fpsFrames / (fpsAccum / 1000);
    fpsAccum = 0;
    fpsFrames = 0;
  }

  if (!controls.paused) {
    for (let i = 0; i < controls.ticksPerFrame; i++) {
      sim.step();
    }
    scene.updatePlantMeshes();
  }

  updateDisplay();

  if (scene.selectedPlantId !== null) {
    const plant = sim.plants.find(p => p.id === scene.selectedPlantId);
    showInspector(plant ?? null);
  }

  preview.update();
  scene.render();
}

requestAnimationFrame(animate);
