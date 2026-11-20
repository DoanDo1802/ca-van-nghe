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
    this.app.off('update', this.onUpdate);
  }

  private getCameraPosition(): pc.Vec3 | null {
    const camEntity = this.app.root.findByName('EditorCamera');
    if (camEntity && camEntity instanceof pc.Entity) {
      return camEntity.getPosition();
    }
    return null;
  }

  private fadeColor(baseR: number, baseG: number, baseB: number, distSq: number, maxDistSq: number): pc.Color {
    const t = Math.max(0, 1 - distSq / maxDistSq);
    const fade = t * t;
    return new pc.Color(
      BG_R + (baseR - BG_R) * fade,
      BG_G + (baseG - BG_G) * fade,
      BG_B + (baseB - BG_B) * fade,
      1
    );
  }

  private onUpdate = (): void => {
    if (this.destroyed || !this.visible) return;

    const camPos = this.getCameraPosition();
    const centerX = camPos ? Math.round(camPos.x / MAJOR_INTERVAL) * MAJOR_INTERVAL : 0;
    const centerZ = camPos ? Math.round(camPos.z / MAJOR_INTERVAL) * MAJOR_INTERVAL : 0;
    const refX = camPos ? camPos.x : 0;
    const refZ = camPos ? camPos.z : 0;
    const maxDistSq = GRID_HALF_EXTENT * GRID_HALF_EXTENT;

    const positions: pc.Vec3[] = [];
    const colors: pc.Color[] = [];

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

      for (let z = minZ; z < maxZ; z += SEGMENT_LENGTH) {
        const zNext = Math.min(z + SEGMENT_LENGTH, maxZ);
        const dx0 = x - refX;
        const dz0 = z - refZ;
        const dx1 = x - refX;
        const dz1 = zNext - refZ;

        positions.push(new pc.Vec3(x, 0, z), new pc.Vec3(x, 0, zNext));
        colors.push(
          this.fadeColor(baseR, baseG, baseB, dx0 * dx0 + dz0 * dz0, maxDistSq),
          this.fadeColor(baseR, baseG, baseB, dx1 * dx1 + dz1 * dz1, maxDistSq)
        );
      }
    }

    // Lines parallel to X axis (varying Z)
    for (let z = minZ; z <= maxZ; z += MINOR_STEP) {
      const isAxis = z === 0;
      const isMajor = z % MAJOR_INTERVAL === 0;
      const baseR = isAxis ? 0.85 : isMajor ? 0.36 : 0.22;
      const baseG = isAxis ? 0.28 : isMajor ? 0.38 : 0.24;
      const baseB = isAxis ? 0.28 : isMajor ? 0.42 : 0.27;

      for (let x = minX; x < maxX; x += SEGMENT_LENGTH) {
        const xNext = Math.min(x + SEGMENT_LENGTH, maxX);
        const dx0 = x - refX;
        const dz0 = z - refZ;
        const dx1 = xNext - refX;
        const dz1 = z - refZ;

        positions.push(new pc.Vec3(x, 0, z), new pc.Vec3(xNext, 0, z));
        colors.push(
          this.fadeColor(baseR, baseG, baseB, dx0 * dx0 + dz0 * dz0, maxDistSq),
          this.fadeColor(baseR, baseG, baseB, dx1 * dx1 + dz1 * dz1, maxDistSq)
        );
      }
    }

    this.app.drawLines(positions, colors, true, this.editorLayer);
  };
}
