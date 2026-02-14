import type { Plant } from '../simulation/Plant';
import { TRAIT_DEFS } from '../simulation/Genome';

let inspectorEl: HTMLDivElement | null = null;

function getOrCreateInspector(): HTMLDivElement {
  if (inspectorEl) return inspectorEl;

  inspectorEl = document.createElement('div');
  inspectorEl.id = 'plant-inspector';
  Object.assign(inspectorEl.style, {
    position: 'fixed',
    bottom: '16px',
    left: '16px',
    background: 'rgba(0, 0, 0, 0.85)',
    color: '#eee',
    padding: '12px 16px',
    borderRadius: '8px',
    fontFamily: 'monospace',
    fontSize: '11px',
    lineHeight: '1.5',
    maxWidth: '420px',
    maxHeight: '80vh',
    overflowY: 'auto',
    pointerEvents: 'none',
    zIndex: '1000',
    display: 'none',
  });
  document.body.appendChild(inspectorEl);
  return inspectorEl;
}

function fmt(val: number, integer?: boolean): string {
  if (integer) return String(Math.floor(val));
  if (Math.abs(val) >= 100) return val.toFixed(1);
  return val.toFixed(2);
}

export function showInspector(plant: Plant | null): void {
  const el = getOrCreateInspector();

  if (!plant) {
    el.style.display = 'none';
    return;
  }

  const traits = plant.traits;
  const traitLines = TRAIT_DEFS.map((def, i) => {
    const value = fmt(traits[def.name as keyof typeof traits] as number, def.integer);
    const unit = def.unit ? ` ${def.unit}` : '';
    const gene = plant.genes[i].toFixed(2);
    return `  ${def.name.padEnd(16)} ${(value + unit).padStart(10)}  g=${gene}`;
  }).join('\n');

  el.innerHTML = `<pre style="margin:0"><strong>Plant #${plant.id}</strong> (gen ${plant.generation})
Stage: ${['Seed', 'Seedling', 'Growing', 'Mature', 'Dead'][plant.stage]}
Height: ${plant.currentHeight.toFixed(1)} cm
Energy: ${plant.energy.toFixed(1)}
Biomass: ${plant.biomass.toFixed(2)}
Age: ${plant.age} / ${plant.traits.maxAge} ticks
Leaves: ${plant.currentLeafCount} / ${plant.traits.leafCount}

<strong>Traits</strong>
${traitLines}</pre>`;

  el.style.display = 'block';
}
