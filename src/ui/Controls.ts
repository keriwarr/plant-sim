import GUI from 'lil-gui';
import type { Simulation } from '../simulation/Simulation';
import { TRAIT_DEFS, type Traits } from '../simulation/Genome';

export interface SimControls {
  ticksPerFrame: number;
  paused: boolean;
  maxPlants: number;
}

export function createControls(sim: Simulation, controls: SimControls): GUI {
  const gui = new GUI({ title: 'Plant Evolution Simulator' });

  gui.add(controls, 'paused').name('Paused');
  gui.add(controls, 'ticksPerFrame', [1, 2, 5, 10, 25, 50, 100]).name('Ticks / Frame');
  gui.add(controls, 'maxPlants', 10, 5000, 10).name('Max Plants').onChange((v: number) => {
    sim.config.maxPlants = v;
  });

  const info = {
    get plants() { return sim.livingPlantCount; },
    get tick() { return sim.tick; },
    get seeds() { return sim.seeds.length; },
  };

  const statsFolder = gui.addFolder('Stats');
  statsFolder.add(info, 'plants').name('Living Plants').listen().disable();
  statsFolder.add(info, 'tick').name('Tick').listen().disable();
  statsFolder.add(info, 'seeds').name('Seeds').listen().disable();

  // Average trait values folder
  const avgFolder = gui.addFolder('Avg Traits');
  avgFolder.open();

  const avgObj: Record<string, number> = {};
  for (const def of TRAIT_DEFS) {
    avgObj[def.name] = 0;
  }

  const avgControllers: Record<string, ReturnType<typeof avgFolder.add>> = {};
  for (const def of TRAIT_DEFS) {
    const label = def.unit ? `${def.name} (${def.unit})` : def.name;
    avgControllers[def.name] = avgFolder.add(avgObj, def.name).name(label).listen().disable();
  }

  (gui as any)._avgObj = avgObj;
  (gui as any)._sim = sim;

  return gui;
}

export function updateControlsDisplay(gui: GUI): void {
  const avgObj = (gui as any)._avgObj as Record<string, number>;
  const sim = (gui as any)._sim as Simulation;

  if (!avgObj || !sim) return;

  const living = sim.plants.filter(p => p.isAlive);
  const count = living.length;

  if (count === 0) {
    for (const def of TRAIT_DEFS) {
      avgObj[def.name] = 0;
    }
    return;
  }

  for (const def of TRAIT_DEFS) {
    let sum = 0;
    for (const plant of living) {
      sum += plant.traits[def.name as keyof Traits];
    }
    const avg = sum / count;
    avgObj[def.name] = def.integer ? Math.round(avg) : Math.round(avg * 100) / 100;
  }
}
