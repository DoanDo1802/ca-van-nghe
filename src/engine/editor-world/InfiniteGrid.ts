import * as pc from 'playcanvas';

const GRID_HALF_EXTENT = 40;
const MINOR_STEP = 1;
const MAJOR_INTERVAL = 10;
const SEGMENT_LENGTH = 5;

const BG_R = 0.11;
const BG_G = 0.12;
const BG_B = 0.14;

export class InfiniteGrid {
  private readonly app: pc.Application;
  private readonly editorLayer: pc.Layer;
  private visible = true;
  private destroyed = false;

  private cachedCamera: pc.Entity | null = null;
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private lastRefX = NaN;
  private lastRefZ = NaN;
  private lastCenterX = NaN;
  private lastCenterZ = NaN;

  constructor(app: pc.Application, editorLayer: pc.Layer) {
    this.app = app;
    this.editorLayer = editorLayer;
    this.app.on('update', this.onUpdate);
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cachedCamera = null;
    this.positions.length = 0;
    this.colors.length = 0;
    this.app.off('update', this.onUpdate);
  }

  private getCameraPosition(): pc.Vec3 | null {
    if (this.cachedCamera && this.cachedCamera.parent) {
      return this.cachedCamera.getPosition();
    }
    const camEntity = this.app.root.findByName('EditorCamera');
    if (camEntity && camEntity instanceof pc.Entity) {
      this.cachedCamera = camEntity;
      return camEntity.getPosition();
    }
    this.cachedCamera = null;
    return null;
  }

  private pushFadedColor(baseR: number, baseG: number, baseB: number, distSq: number, maxDistSq: number): void {
    const t = Math.max(0, 1 - distSq / maxDistSq);
    const fade = t * t;
    this.colors.push(
      BG_R + (baseR - BG_R) * fade,
      BG_G + (baseG - BG_G) * fade,
      BG_B + (baseB - BG_B) * fade,
      1
    );
  }

  private rebuildGrid(centerX: number, centerZ: number, refX: number, refZ: number): void {
    const maxDistSq = GRID_HALF_EXTENT * GRID_HALF_EXTENT;
    this.positions.length = 0;
    this.colors.length = 0;

    const minX = centerX - GRID_HALF_EXTENT;
    const maxX = centerX + GRID_HALF_EXTENT;
    const minZ = centerZ - GRID_HALF_EXTENT;
    const maxZ = centerZ + GRID_HALF_EXTENT;

    // Lines parallel to Z axis (varying X)
    for (let x = minX; x <= maxX; x += MINOR_STEP) {
      const isAxis = x === 0;
      const isMajor = x % MAJOR_INTERVAL === 0;
      const baseR = isAxis ? 0.25 : isMajor ? 0.36 : 0.22;
      const baseG = isAxis ? 0.48 : isMajor ? 0.38 : 0.24;
      const baseB = isAxis ? 0.85 : isMajor ? 0.42 : 0.27;
      const dx = x - refX;
      const dxSq = dx * dx;

      for (let z = minZ; z < maxZ; z += SEGMENT_LENGTH) {
        const zNext = Math.min(z + SEGMENT_LENGTH, maxZ);
        const dz0 = z - refZ;
        const dz1 = zNext - refZ;

        this.positions.push(x, 0, z, x, 0, zNext);
        this.pushFadedColor(baseR, baseG, baseB, dxSq + dz0 * dz0, maxDistSq);
        this.pushFadedColor(baseR, baseG, baseB, dxSq + dz1 * dz1, maxDistSq);
      }
    }

    // Lines parallel to X axis (varying Z)
    for (let z = minZ; z <= maxZ; z += MINOR_STEP) {
      const isAxis = z === 0;
      const isMajor = z % MAJOR_INTERVAL === 0;
      const baseR = isAxis ? 0.85 : isMajor ? 0.36 : 0.22;
      const baseG = isAxis ? 0.28 : isMajor ? 0.38 : 0.24;
      const baseB = isAxis ? 0.28 : isMajor ? 0.42 : 0.27;
      const dz = z - refZ;
      const dzSq = dz * dz;

      for (let x = minX; x < maxX; x += SEGMENT_LENGTH) {
        const xNext = Math.min(x + SEGMENT_LENGTH, maxX);
        const dx0 = x - refX;
        const dx1 = xNext - refX;

        this.positions.push(x, 0, z, xNext, 0, z);
        this.pushFadedColor(baseR, baseG, baseB, dx0 * dx0 + dzSq, maxDistSq);
        this.pushFadedColor(baseR, baseG, baseB, dx1 * dx1 + dzSq, maxDistSq);
      }
    }
  }

  private onUpdate = (): void => {
    if (this.destroyed || !this.visible) return;

    const camPos = this.getCameraPosition();
    const refX = camPos ? camPos.x : 0;
    const refZ = camPos ? camPos.z : 0;
    const centerX = camPos ? Math.round(refX / MAJOR_INTERVAL) * MAJOR_INTERVAL : 0;
    const centerZ = camPos ? Math.round(refZ / MAJOR_INTERVAL) * MAJOR_INTERVAL : 0;

    if (
      centerX !== this.lastCenterX ||
      centerZ !== this.lastCenterZ ||
      refX !== this.lastRefX ||
      refZ !== this.lastRefZ
    ) {
      this.lastCenterX = centerX;
      this.lastCenterZ = centerZ;
      this.lastRefX = refX;
      this.lastRefZ = refZ;
      this.rebuildGrid(centerX, centerZ, refX, refZ);
    }

    this.app.drawLineArrays(this.positions, this.colors, true, this.editorLayer);
  };
}
