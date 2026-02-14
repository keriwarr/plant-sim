// Trait definitions: each maps a gene (0,1) to a trait value via logit transform
export interface TraitDef {
  name: string;
  base: number;   // value when gene = 0.5
  k: number;      // sensitivity (steepness of logit curve)
  unit: string;   // display unit
  integer?: boolean; // floor the result
}

export const TRAIT_DEFS: TraitDef[] = [
  { name: 'maxHeight',       base: 30,   k: 3,   unit: 'cm' },
  { name: 'growthRate',      base: 0.2,  k: 2,   unit: 'cm/tick' },
  { name: 'trunkGirth',      base: 2,    k: 2,   unit: 'cm' },
  { name: 'leafSize',        base: 3,    k: 2,   unit: 'cm' },
  { name: 'leafCount',       base: 8,    k: 2,   unit: '', integer: true },
  { name: 'leafAngle',       base: 25,   k: 1.2, unit: 'deg' },
  { name: 'leafOpacity',     base: 0.6,  k: 1.5, unit: '' },
  { name: 'seedCount',       base: 3,    k: 2,   unit: '', integer: true },
  { name: 'seedRange',       base: 15,   k: 2,   unit: 'cells' },
  { name: 'seedEnergy',      base: 20,   k: 2,   unit: 'E' },
  { name: 'germinationSpeed',base: 50,   k: 1.5, unit: 'ticks', integer: true },
  { name: 'branchAngle',     base: 40,   k: 1.5, unit: 'deg' },
  { name: 'branchCount',     base: 3,    k: 1.5, unit: '', integer: true },
  { name: 'photoEfficiency', base: 1.0,  k: 1.5, unit: 'E/cell' },
  { name: 'maturityAge',     base: 150,  k: 1.5, unit: 'ticks', integer: true },
  { name: 'maxAge',          base: 1000, k: 2,   unit: 'ticks', integer: true },
];

export const GENE_COUNT = TRAIT_DEFS.length;

export type Genes = Float64Array;

function logit(x: number): number {
  const clamped = Math.max(1e-6, Math.min(1 - 1e-6, x));
  return Math.log(clamped / (1 - clamped));
}

export function traitValue(gene: number, def: TraitDef): number {
  const raw = def.base * Math.exp(def.k * logit(gene));
  const val = Math.max(0, raw);
  return def.integer ? Math.max(1, Math.floor(val)) : val;
}

// Decoded traits for convenient access
export interface Traits {
  maxHeight: number;
  growthRate: number;
  trunkGirth: number;
  leafSize: number;
  leafCount: number;
  leafAngle: number;
  leafOpacity: number;
  seedCount: number;
  seedRange: number;
  seedEnergy: number;
  germinationSpeed: number;
  branchAngle: number;
  branchCount: number;
  photoEfficiency: number;
  maturityAge: number;
  maxAge: number;
}

export function decodeTraits(genes: Genes): Traits {
  const result: Record<string, number> = {};
  for (let i = 0; i < TRAIT_DEFS.length; i++) {
    result[TRAIT_DEFS[i].name] = traitValue(genes[i], TRAIT_DEFS[i]);
  }
  return result as unknown as Traits;
}

export function createRandomGenome(): Genes {
  const genes = new Float64Array(GENE_COUNT);
  for (let i = 0; i < GENE_COUNT; i++) {
    // Start near center with some spread
    genes[i] = 0.3 + Math.random() * 0.4;
  }
  return genes;
}

// Box-Muller transform for gaussian random
function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

const EPSILON = 1e-4;

export function mutateGenome(parent: Genes, mutationRate: number = 0.02): Genes {
  const child = new Float64Array(GENE_COUNT);
  for (let i = 0; i < GENE_COUNT; i++) {
    const mutated = parent[i] + gaussianRandom(0, mutationRate);
    child[i] = Math.max(EPSILON, Math.min(1 - EPSILON, mutated));
  }
  return child;
}
