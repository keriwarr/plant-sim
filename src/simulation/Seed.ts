import type { Genes } from './Genome';

export interface Seed {
  x: number;
  y: number;
  genes: Genes;
  energy: number;
  generation: number;
  germinationTimer: number;
  age: number;
}
