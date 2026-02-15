import { type Genes, decodeTraits, type Traits } from './Genome';

export const GrowthStage = {
  Seed: 0,
  Seedling: 1,
  Growing: 2,
  Mature: 3,
  Dead: 4,
} as const;

export type GrowthStage = (typeof GrowthStage)[keyof typeof GrowthStage];

export type DeathCause = 'energy' | 'age' | 'topple' | 'germination';

// Simulation tuning constants
export let TRUNK_MASS_SCALE = 0.01;
export function setTrunkMassScale(v: number) { TRUNK_MASS_SCALE = v; }
export let LEAF_MASS_SCALE = 0.001;
export function setLeafMassScale(v: number) { LEAF_MASS_SCALE = v; }
export let BRANCH_MASS_SCALE = 0.005;
export function setBranchMassScale(v: number) { BRANCH_MASS_SCALE = v; }
export let MAINTENANCE_RATE = 0.01;
export let GROWTH_COST_RATE = 0.05;

export function setMaintenanceRate(v: number) { MAINTENANCE_RATE = v; }
export function setGrowthCostRate(v: number) { GROWTH_COST_RATE = v; }
const LEAF_GROWTH_COST_RATE = 0.003;
const GERMINATION_BURN_BASE = 0.3;
const GERMINATION_BURN_MULTIPLIER = 10;
const TOPPLE_STABILITY_FACTOR = 0.1;
export let TOPPLE_BASE_CHANCE = 0.005;
export function setToppleBaseChance(v: number) { TOPPLE_BASE_CHANCE = v; }
const MATURITY_HEIGHT_FRACTION = 0.9;
export let UNREALIZED_PENALTY = 0.5;
export function setUnrealizedPenalty(v: number) { UNREALIZED_PENALTY = v; }
const SEED_BUDGET_BUFFER = 0.5;

let nextPlantId = 0;

function leafWeight(traits: Traits): number {
  const size = traits.leafSize;
  return Math.pow(size, 2.5)
    * (0.8 + traits.leafOpacity * 0.2)
    * (0.5 + traits.photoEfficiency * 0.3);
}

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
  deathCause: DeathCause | null = null;

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

  private die(cause: DeathCause): void {
    this.stage = GrowthStage.Dead;
    this.deathCause = cause;
    this.meshDirty = true;
  }

  computeBiomass(): number {
    const trunkMass = Math.pow(this.traits.trunkGirth, 2.3) * Math.pow(this.currentHeight, 1.5) * TRUNK_MASS_SCALE;
    const leafMass = this.currentLeafCount * leafWeight(this.traits) * LEAF_MASS_SCALE;
    const branchMass = this.currentLeafCount * Math.pow(this.traits.branchLength, 1.5) * Math.pow(this.traits.trunkGirth, 2.3) * BRANCH_MASS_SCALE;
    return trunkMass + leafMass + branchMass;
  }

  tick(): void {
    if (!this.isAlive) return;

    this.age++;

    if (this.age >= this.traits.maxAge) {
      this.die('age');
      return;
    }

    // Germination — faster sprouting burns more energy per tick
    if (this.stage === GrowthStage.Seed) {
      const germinationBurn = GERMINATION_BURN_BASE / Math.max(1, this.traits.germinationSpeed) * GERMINATION_BURN_MULTIPLIER;
      this.energy -= germinationBurn;
      this.germinationTimer--;
      if (this.energy <= 0) {
        this.die('germination');
        return;
      }
      if (this.germinationTimer <= 0) {
        this.stage = GrowthStage.Seedling;
        this.meshDirty = true;
      }
      return;
    }

    // Structural failure: insufficient girth for height
    const stabilityRatio = this.traits.trunkGirth / (this.currentHeight * TOPPLE_STABILITY_FACTOR);
    if (stabilityRatio < 1) {
      const toppleChance = (1 - stabilityRatio) * (1 - stabilityRatio) * TOPPLE_BASE_CHANCE;
      if (Math.random() < toppleChance) {
        this.die('topple');
        return;
      }
    }

    if (this.canGrow) {
      this.grow();
    }

    // Check maturity
    if (this.stage === GrowthStage.Seedling || this.stage === GrowthStage.Growing) {
      if (this.currentHeight >= this.traits.maxHeight * MATURITY_HEIGHT_FRACTION || this.age >= this.traits.maturityAge) {
        this.stage = GrowthStage.Mature;
      } else if (this.stage === GrowthStage.Seedling && this.currentHeight > 1) {
        this.stage = GrowthStage.Growing;
      }
    }

    this.biomass = this.computeBiomass();

    // Mature plants pay extra maintenance for unrealized genetic potential
    let maintenanceMultiplier = 1;
    if (this.isMature) {
      const heightRealized = this.currentHeight / this.traits.maxHeight;
      const leafRealized = this.currentLeafCount / this.traits.leafCount;
      const avgRealized = (heightRealized + leafRealized) / 2;
      maintenanceMultiplier = 1 + (1 - avgRealized) * UNREALIZED_PENALTY;
    }
    this.energy -= this.biomass * MAINTENANCE_RATE * maintenanceMultiplier;

    if (this.energy <= 0) {
      this.die('energy');
    }

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
      const growthCost = growth * this.traits.trunkGirth * GROWTH_COST_RATE;
      if (this.energy > growthCost) {
        this.currentHeight += growth;
        this.energy -= growthCost;
      }
    }

    if (this.currentLeafCount < this.traits.leafCount) {
      const leafInterval = Math.max(1, Math.floor(this.traits.maturityAge / this.traits.leafCount));
      if (this.age % leafInterval === 0) {
        const leafCost = leafWeight(this.traits) * LEAF_GROWTH_COST_RATE;
        if (this.energy > leafCost) {
          this.currentLeafCount++;
          this.energy -= leafCost;
        }
      }
    }
  }

  get seedBudget(): number {
    if (!this.isMature) return 0;
    const buffer = this.biomass * SEED_BUDGET_BUFFER;
    return Math.max(0, this.energy - buffer);
  }
}
