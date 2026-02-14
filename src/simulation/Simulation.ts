import { Grid } from './Grid';
import { Plant, GrowthStage } from './Plant';
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

export class Simulation {
  readonly grid: Grid;
  readonly config: SimConfig;
  plants: Plant[] = [];
  seeds: Seed[] = [];
  tick: number = 0;

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
        const plant = new Plant(x, y, genes, 50, 0);
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

    // 1. Build shadow map (tallest first)
    this.computeShadowMap();

    // 2. Energy collection
    this.collectEnergy();

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

  private computeShadowMap(): void {
    this.grid.clearShadow();

    // Sort plants by height (tallest first) so their shadows are stamped first
    const sorted = [...this.plants]
      .filter(p => p.isAlive && p.stage !== GrowthStage.Seed)
      .sort((a, b) => b.currentHeight - a.currentHeight);

    for (const plant of sorted) {
      this.stampPlantShadow(plant);
    }
  }

  private stampPlantShadow(plant: Plant): void {
    if (plant.currentLeafCount === 0) return;

    const leafPositions = this.getLeafPositions(plant);
    for (const pos of leafPositions) {
      this.grid.stampLeafShadow(pos.x, pos.y, plant.traits.leafSize, plant.traits.leafOpacity);
    }
  }

  // Compute leaf positions in grid space for a plant
  getLeafPositions(plant: Plant): Array<{ x: number; y: number; z: number }> {
    const positions: Array<{ x: number; y: number; z: number }> = [];
    const angleStep = (Math.PI * 2) / Math.max(1, plant.currentLeafCount);
    // Spread radius: use sin instead of tan to keep proportional and bounded
    const maxSpread = Math.sin(Math.min(80, plant.traits.leafAngle) * Math.PI / 180) * plant.currentHeight * 0.4;

    for (let i = 0; i < plant.currentLeafCount; i++) {
      const angle = angleStep * i;
      // Leaves clustered in the top portion of the plant
      const t = plant.currentLeafCount === 1 ? 1 : i / (plant.currentLeafCount - 1);
      const heightFraction = 0.6 + 0.4 * t;
      const leafHeight = plant.currentHeight * heightFraction;
      const radius = maxSpread * (0.5 + 0.5 * t);

      positions.push({
        x: plant.x + Math.cos(angle) * radius,
        y: plant.y + Math.sin(angle) * radius,
        z: leafHeight,
      });
    }

    return positions;
  }

  private collectEnergy(): void {
    for (const plant of this.plants) {
      if (!plant.isAlive || plant.stage === GrowthStage.Seed) continue;
      if (plant.currentLeafCount === 0) continue;

      const leafPositions = this.getLeafPositions(plant);
      let totalEnergy = 0;

      // Sort leaves top-to-bottom for self-shading
      const sortedLeaves = leafPositions
        .map((pos, i) => ({ pos, i }))
        .sort((a, b) => b.pos.z - a.pos.z);

      // Self-shading: each leaf below accumulates opacity from leaves above it.
      // Wider leaf angles mean less overlap between a plant's own leaves.
      const overlapFactor = 1 - Math.sin(Math.min(80, plant.traits.leafAngle) * Math.PI / 180) * 0.8;
      let selfShade = 0;

      for (const { pos } of sortedLeaves) {
        const selfLight = Math.max(0, 1 - selfShade);
        const leafEnergy = this.grid.getLitArea(
          pos.x, pos.y,
          plant.traits.leafSize,
          plant.traits.leafOpacity
        );
        // Throughput bottleneck: larger leaves are less efficient per unit area
        totalEnergy += leafEnergy * plant.traits.photoEfficiency * selfLight / plant.traits.leafSize;

        // This leaf shades leaves below it
        selfShade += plant.traits.leafOpacity * overlapFactor;
      }

      plant.energy += totalEnergy * 0.006;
    }
  }

  private reproduce(): void {
    const newSeeds: Seed[] = [];

    for (const plant of this.plants) {
      if (!plant.isMature) continue;

      // Only produce seeds every ~50 ticks
      if (plant.age % 50 !== 0) continue;

      const budget = plant.seedBudget;
      const costPerSeed = plant.traits.seedEnergy;
      const numSeeds = Math.min(
        plant.traits.seedCount,
        Math.floor(budget / costPerSeed)
      );

      if (numSeeds <= 0) continue;

      for (let i = 0; i < numSeeds; i++) {
        const angle = Math.random() * Math.PI * 2;
        // Taller/wider plants spread seeds further
        const effectiveRange = plant.traits.seedRange * (plant.currentHeight / Math.max(1, plant.traits.maxHeight));
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
    const MAX_SEED_AGE = 150;

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
    const dead = this.plants.filter(p => !p.isAlive);
    for (const plant of dead) {
      this.removePlant(plant);
    }
    this.plants = this.plants.filter(p => p.isAlive);
  }

  get livingPlantCount(): number {
    return this.plants.filter(p => p.isAlive).length;
  }
}
