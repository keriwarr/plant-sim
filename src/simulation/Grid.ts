export class Grid {
  readonly width: number;
  readonly height: number;

  // Shadow map: accumulated opacity at each cell (0 = full sun, higher = more shade)
  readonly shadow: Float32Array;

  // Occupancy: which cells have a plant trunk (plant ID or -1)
  readonly occupied: Int32Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.shadow = new Float32Array(width * height);
    this.occupied = new Int32Array(width * height).fill(-1);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  isOccupied(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return this.occupied[this.index(x, y)] !== -1;
  }

  occupy(x: number, y: number, plantId: number): void {
    if (this.inBounds(x, y)) {
      this.occupied[this.index(x, y)] = plantId;
    }
  }

  vacate(x: number, y: number): void {
    if (this.inBounds(x, y)) {
      this.occupied[this.index(x, y)] = -1;
    }
  }

  clearShadow(): void {
    this.shadow.fill(0);
  }

  // Stamp a circular leaf's shadow onto the grid
  stampLeafShadow(cx: number, cy: number, radius: number, opacity: number): void {
    const r = Math.ceil(radius);
    const rSq = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= rSq) {
          this.shadow[this.index(x, y)] += opacity;
        }
      }
    }
  }

  // Get available light at a position (1.0 = full sun, 0.0 = fully shaded)
  getLight(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return Math.max(0, 1 - this.shadow[this.index(x, y)]);
  }

  // Get total lit cells under a circular area (for energy calculation)
  getLitArea(cx: number, cy: number, radius: number, opacity: number): number {
    const r = Math.ceil(radius);
    const rSq = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r));

    let totalEnergy = 0;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= rSq) {
          totalEnergy += this.getLight(x, y) * opacity;
        }
      }
    }

    return totalEnergy;
  }
}
