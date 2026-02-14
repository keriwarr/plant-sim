import { type Genes, decodeTraits, type Traits } from './Genome';

export const GrowthStage = {
  Seed: 0,
  Seedling: 1,
  Growing: 2,
  Mature: 3,
  Dead: 4,
} as const;

export type GrowthStage = (typeof GrowthStage)[keyof typeof GrowthStage];

let nextPlantId = 0;

export class Plant {
  readonly id: number;
  readonly genes: Genes;
  readonly traits: Traits;
  readonly x: number;
  readonly y: number;
  readonly generation: number;

  stage: GrowthStage = GrowthStage.Seed;
  age: number = 0;
  currentHeight: number = 0;
  currentLeafCount: number = 0;
  energy: number;
  biomass: number = 0;
  germinationTimer: number;

  meshDirty: boolean = true;
  private prevHeight: number = 0;
  private prevLeafCount: number = 0;

  constructor(x: number, y: number, genes: Genes, startEnergy: number, generation: number = 0) {
    this.id = nextPlantId++;
    this.x = x;
    this.y = y;
    this.genes = genes;
    this.traits = decodeTraits(genes);
    this.energy = startEnergy;
    this.generation = generation;
    this.germinationTimer = this.traits.germinationSpeed;
  }

  get isAlive(): boolean {
    return this.stage !== GrowthStage.Dead;
  }

  get isMature(): boolean {
    return this.stage === GrowthStage.Mature;
  }

  get canGrow(): boolean {
    return this.stage === GrowthStage.Growing || this.stage === GrowthStage.Seedling;
  }

  computeBiomass(): number {
    // Trunk: linear in height (not quadratic) so tallness is viable
    const trunkMass = this.currentHeight * this.traits.trunkGirth * 0.02;
    // Leaves: cubic in size — large leaves are disproportionately heavy
    const leafMass = this.currentLeafCount * this.traits.leafSize * this.traits.leafSize * this.traits.leafSize * 0.001;
    return trunkMass + leafMass;
  }

  tick(): void {
    if (!this.isAlive) return;

    this.age++;

    // Age-based death
    if (this.age >= this.traits.maxAge) {
      this.stage = GrowthStage.Dead;
      this.meshDirty = true;
      return;
    }

    // Germination
    if (this.stage === GrowthStage.Seed) {
      this.germinationTimer--;
      if (this.germinationTimer <= 0) {
        this.stage = GrowthStage.Seedling;
        this.meshDirty = true;
      }
      return;
    }

    // Grow toward genetic targets
    if (this.canGrow) {
      this.grow();
    }

    // Check maturity
    if (this.stage === GrowthStage.Seedling || this.stage === GrowthStage.Growing) {
      if (this.currentHeight >= this.traits.maxHeight * 0.9 || this.age >= this.traits.maturityAge) {
        this.stage = GrowthStage.Mature;
      } else if (this.stage === GrowthStage.Seedling && this.currentHeight > 1) {
        this.stage = GrowthStage.Growing;
      }
    }

    // Update biomass
    this.biomass = this.computeBiomass();

    // Maintenance cost
    const maintenanceCost = this.biomass * 0.02;
    this.energy -= maintenanceCost;

    if (this.energy <= 0) {
      this.stage = GrowthStage.Dead;
      this.meshDirty = true;
    }

    // Check if geometry changed
    if (this.currentHeight !== this.prevHeight || this.currentLeafCount !== this.prevLeafCount) {
      this.meshDirty = true;
      this.prevHeight = this.currentHeight;
      this.prevLeafCount = this.currentLeafCount;
    }
  }

  private grow(): void {
    const heightGap = this.traits.maxHeight - this.currentHeight;
    if (heightGap > 0) {
      const growth = Math.min(this.traits.growthRate, heightGap);
      const growthCost = growth * this.traits.trunkGirth * 0.05;
      if (this.energy > growthCost) {
        this.currentHeight += growth;
        this.energy -= growthCost;
      }
    }

    // Add leaves progressively
    if (this.currentLeafCount < this.traits.leafCount) {
      const leafInterval = Math.max(1, Math.floor(this.traits.maturityAge / this.traits.leafCount));
      if (this.age % leafInterval === 0) {
        const leafCost = this.traits.leafSize * this.traits.leafSize * this.traits.leafSize * 0.005;
        if (this.energy > leafCost) {
          this.currentLeafCount++;
          this.energy -= leafCost;
        }
      }
    }
  }

  get seedBudget(): number {
    if (!this.isMature) return 0;
    const buffer = this.biomass * 0.5;
    return Math.max(0, this.energy - buffer);
  }
}
