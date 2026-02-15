// Trait definitions: each maps a gene (0,1) to a trait value via logit transform
export interface TraitDef {
  name: string;
  base: number;   // value when gene = 0.5 (logit), or max value (linear)
  k: number;      // sensitivity (steepness of logit curve), unused for linear
  unit: string;   // display unit
  integer?: boolean; // floor the result
  linear?: boolean;  // use gene * base instead of logit mapping
}

export const TRAIT_DEFS: TraitDef[] = [
  { name: 'maxHeight',       base: 20,   k: 3,   unit: 'cm' },
  { name: 'growthRate',      base: 0.2,  k: 2,   unit: 'cm/tick' },
  { name: 'trunkGirth',      base: 2,    k: 1.2, unit: 'cm' },
  { name: 'leafSize',        base: 5,    k: 2,   unit: 'cm' },
  { name: 'leafCount',       base: 8,    k: 2,   unit: '', integer: true },
  { name: 'branchLength',    base: 8,    k: 2,   unit: 'cells' },
  { name: 'leafOpacity',     base: 1,    k: 0,   unit: '', linear: true },
  { name: 'seedRange',       base: 2,    k: 0,   unit: 'x', linear: true },
  { name: 'seedEnergy',      base: 35,   k: 2,   unit: 'E' },
  { name: 'germinationSpeed',base: 50,   k: 1.5, unit: 'ticks', integer: true },
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

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

const TRAIT_MIN = 1e-4;
const TRAIT_MAX = 1e4;

export function traitValue(gene: number, def: TraitDef): number {
  let val: number;
  if (def.linear) {
    val = gene * def.base;
  } else {
    val = def.base * Math.exp(def.k * logit(gene));
  }
  val = Math.max(TRAIT_MIN, Math.min(TRAIT_MAX, val));
  return def.integer ? Math.max(1, Math.floor(val)) : val;
}

// Decoded traits for convenient access
export interface Traits {
  maxHeight: number;
  growthRate: number;
  trunkGirth: number;
  leafSize: number;
  leafCount: number;
  branchLength: number;
  leafOpacity: number;
  seedRange: number;
  seedEnergy: number;
  germinationSpeed: number;
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
    genes[i] = 0.35 + Math.random() * 0.3;
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

export function mutateGenome(parent: Genes, mutationRate: number): Genes {
  const child = new Float64Array(GENE_COUNT);
  for (let i = 0; i < GENE_COUNT; i++) {
    // Mutate in logit space so genes asymptote toward 0/1 instead of clamping
    const parentLogit = logit(parent[i]);
    const mutatedLogit = parentLogit + gaussianRandom(0, mutationRate * 4);
    child[i] = sigmoid(mutatedLogit);
  }
  return child;
}
