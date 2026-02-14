import { Simulation } from './simulation/Simulation';
import { SceneManager } from './rendering/SceneManager';
import { createControls, updateControlsDisplay, type SimControls } from './ui/Controls';
import { showInspector } from './ui/Inspector';

const sim = new Simulation({
  gridWidth: 256,
  gridHeight: 256,
  initialPlants: 20,
  maxPlants: 2000,
});

const scene = new SceneManager(sim);

const controls: SimControls = {
  ticksPerFrame: 1,
  paused: true,
  maxPlants: sim.config.maxPlants,
};

const gui = createControls(sim, controls);

scene.onPlantSelected = (plant) => {
  showInspector(plant);
};

// Spacebar to pause/resume
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    controls.paused = !controls.paused;
    gui.controllersRecursive().find(c => c.property === 'paused')?.updateDisplay();
  }
});

function animate(): void {
  requestAnimationFrame(animate);

  if (!controls.paused) {
    for (let i = 0; i < controls.ticksPerFrame; i++) {
      sim.step();
    }
    scene.updatePlantMeshes();
  }

  updateControlsDisplay(gui);

  if (scene.selectedPlantId !== null) {
    const plant = sim.plants.find(p => p.id === scene.selectedPlantId);
    showInspector(plant ?? null);
  }

  scene.render();
}

animate();
