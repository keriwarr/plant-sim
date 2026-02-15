import { Grid } from './Grid';
import { Plant, GrowthStage, type DeathCause } from './Plant';
import { createRandomGenome, mutateGenome, decodeTraits } from './Genome';
import type { Seed } from './Seed';

export interface SimConfig {
  gridWidth: number;
  gridHeight: number;
  initialPlants: number;
  maxPlants: number;
  mutationRate: number;
}

const DEFAULT_CONFIG: SimConfig = {
  gridWidth: 256,
  gridHeight: 256,
  initialPlants: 50,
  maxPlants: 500,
  mutationRate: 0.02,
};

export let ENERGY_SCALE = 0.01;
export function setEnergyScale(v: number) { ENERGY_SCALE = v; }
const REPRO_INTERVAL_FRACTION = 0.05;
const MAX_SEED_AGE = 150;
export let SEED_DISPERSAL_SCALE = 1.0;
export function setSeedDispersalScale(v: number) { SEED_DISPERSAL_SCALE = v; }

export class Simulation {
  readonly grid: Grid;
  readonly config: SimConfig;
  plants: Plant[] = [];
  seeds: Seed[] = [];
  tick: number = 0;
  deathCounts: Record<DeathCause, number> = { energy: 0, age: 0, topple: 0, germination: 0 };

  // Events for the renderer
  onPlantAdded?: (plant: Plant) => void;
  onPlantRemoved?: (plant: Plant) => void;

  constructor(config: Partial<SimConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.grid = new Grid(this.config.gridWidth, this.config.gridHeight);
    this.spawnInitialPlants();
  }

  private spawnInitialPlants(): void {
    for (let i = 0; i < this.config.initialPlants; i++) {
      const x = Math.floor(Math.random() * this.grid.width);
      const y = Math.floor(Math.random() * this.grid.height);
      if (!this.grid.isOccupied(x, y)) {
        const genes = createRandomGenome();
        const traits = decodeTraits(genes);
        const plant = new Plant(x, y, genes, traits.seedEnergy * 2, 0);
        plant.stage = GrowthStage.Seedling; // skip germination for initial plants
        plant.currentHeight = 1;
        this.addPlant(plant);
      }
    }
  }

  private addPlant(plant: Plant): void {
    this.plants.push(plant);
    this.grid.occupy(plant.x, plant.y, plant.id);
    this.onPlantAdded?.(plant);
  }

  private removePlant(plant: Plant): void {
    this.grid.vacate(plant.x, plant.y);
    this.onPlantRemoved?.(plant);
  }

  step(): void {
    this.tick++;

    // 1-2. Height-aware shadow + energy: process leaves top-to-bottom
    // so each leaf only sees shade from leaves above it
    this.computeLightAndEnergy();

    // 3-4. Plant ticks (maintenance, growth, etc.)
    for (const plant of this.plants) {
      plant.tick();
    }

    // 5. Reproduction
    this.reproduce();

    // 6. Germinate seeds
    this.germinateSeeds();

    // 7. Remove dead plants
    this.cleanup();
  }

  private computeLightAndEnergy(): void {
    this.grid.clearShadow();

    // Gather all leaves from all living plants
    interface LeafEntry {
      x: number; y: number; z: number;
      leafSize: number; leafOpacity: number; photoEfficiency: number;
      plantIndex: number;
    }
    const allLeaves: LeafEntry[] = [];

    for (let pi = 0; pi < this.plants.length; pi++) {
      const plant = this.plants[pi];
      if (!plant.isAlive || plant.stage === GrowthStage.Seed) continue;
      if (plant.currentLeafCount === 0) continue;

      const positions = this.getLeafPositions(plant);
      for (const pos of positions) {
        allLeaves.push({
          x: pos.x, y: pos.y, z: pos.z,
          leafSize: plant.traits.leafSize,
          leafOpacity: plant.traits.leafOpacity,
          photoEfficiency: plant.traits.photoEfficiency,
          plantIndex: pi,
        });
      }
    }

    // Sort highest first — each leaf only sees shade from leaves above it
    allLeaves.sort((a, b) => b.z - a.z);

    // Single pass: read light, then stamp shadow
    const energyByPlant = new Float64Array(this.plants.length);
    for (const leaf of allLeaves) {
      const leafEnergy = this.grid.getLitArea(
        leaf.x, leaf.y, leaf.leafSize, leaf.leafOpacity
      );
      const effectiveEfficiency = 1 - Math.exp(-leaf.photoEfficiency);
      energyByPlant[leaf.plantIndex] += leafEnergy * effectiveEfficiency;

      this.grid.stampLeafShadow(leaf.x, leaf.y, leaf.leafSize, leaf.leafOpacity);
    }

    // Apply collected energy
    for (let i = 0; i < this.plants.length; i++) {
      if (energyByPlant[i] > 0) {
        this.plants[i].energy += energyByPlant[i] * ENERGY_SCALE;
      }
    }
  }

  // Compute leaf positions in grid space for a plant
  getLeafPositions(plant: Plant): Array<{ x: number; y: number; z: number }> {
    const positions: Array<{ x: number; y: number; z: number }> = [];
    const angleStep = (Math.PI * 2) / Math.max(1, plant.currentLeafCount);
    // Deterministic random rotation per plant so they don't all face the same way
    const angleOffset = (plant.id * 2654435761 & 0xFFFFFF) / 0xFFFFFF * Math.PI * 2;

    for (let i = 0; i < plant.currentLeafCount; i++) {
      const angle = angleOffset + angleStep * i;
      // Leaves distributed in the top portion of the plant
      const t = plant.currentLeafCount === 1 ? 1 : i / (plant.currentLeafCount - 1);
      const heightFraction = 0.6 + 0.4 * t;
      const leafHeight = plant.currentHeight * heightFraction;
      // Branches taper toward the top — widest at bottom, narrowest at top
      const taper = 1 - t * 0.7;
      const radius = plant.traits.branchLength * taper;

      positions.push({
        x: plant.x + Math.cos(angle) * radius,
        y: plant.y + Math.sin(angle) * radius,
        z: leafHeight,
      });
    }

    return positions;
  }


  private reproduce(): void {
    const newSeeds: Seed[] = [];

    for (const plant of this.plants) {
      if (!plant.isMature) continue;

      // Reproduction interval scales with lifespan
      const reproInterval = Math.max(1, Math.floor(plant.traits.maxAge * REPRO_INTERVAL_FRACTION));
      if (plant.age % reproInterval !== 0) continue;

      const budget = plant.seedBudget;
      const costPerSeed = plant.traits.seedEnergy;
      const numSeeds = Math.floor(budget / costPerSeed);

      if (numSeeds <= 0) continue;

      for (let i = 0; i < numSeeds; i++) {
        const angle = Math.random() * Math.PI * 2;
        const effectiveRange = plant.currentHeight * SEED_DISPERSAL_SCALE * plant.traits.seedRange;
        const dist = Math.random() * effectiveRange;
        const sx = Math.round(plant.x + Math.cos(angle) * dist);
        const sy = Math.round(plant.y + Math.sin(angle) * dist);

        if (!this.grid.inBounds(sx, sy)) continue;
        if (this.grid.isOccupied(sx, sy)) continue;

        const childGenes = mutateGenome(plant.genes, this.config.mutationRate);
        const childTraits = decodeTraits(childGenes);

        newSeeds.push({
          x: sx,
          y: sy,
          genes: childGenes,
          energy: plant.traits.seedEnergy,
          generation: plant.generation + 1,
          germinationTimer: childTraits.germinationSpeed,
          age: 0,
        });

        plant.energy -= costPerSeed;
      }
    }

    this.seeds.push(...newSeeds);
    // Mark seed positions as occupied to prevent double-planting
    for (const seed of newSeeds) {
      this.grid.occupy(seed.x, seed.y, -2); // -2 = seed placeholder
    }
  }

  private germinateSeeds(): void {
    const germinated: Seed[] = [];
    const remaining: Seed[] = [];

    for (const seed of this.seeds) {
      seed.age++;
      seed.germinationTimer--;

      if (seed.age > MAX_SEED_AGE) {
        // Expired - free the cell
        this.grid.vacate(seed.x, seed.y);
      } else if (seed.germinationTimer <= 0) {
        germinated.push(seed);
      } else {
        remaining.push(seed);
      }
    }

    this.seeds = remaining;

    const livingCount = this.plants.filter(p => p.isAlive).length;
    let added = 0;

    for (const seed of germinated) {
      this.grid.vacate(seed.x, seed.y);

      if (livingCount + added >= this.config.maxPlants) continue;
      if (this.grid.isOccupied(seed.x, seed.y)) continue;

      const plant = new Plant(seed.x, seed.y, seed.genes, seed.energy, seed.generation);
      plant.stage = GrowthStage.Seedling;
      plant.currentHeight = 0.5;
      this.addPlant(plant);
      added++;
    }
  }

  private cleanup(): void {
    const alive: Plant[] = [];
    for (const plant of this.plants) {
      if (plant.isAlive) {
        alive.push(plant);
      } else {
        if (plant.deathCause) {
          this.deathCounts[plant.deathCause]++;
        }
        this.removePlant(plant);
      }
    }
    this.plants = alive;
  }

  get livingPlantCount(): number {
    return this.plants.filter(p => p.isAlive).length;
  }
}
