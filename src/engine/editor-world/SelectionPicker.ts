import * as pc from 'playcanvas';

const HIGHLIGHT_COLOR = new pc.Color(1, 0.65, 0.1, 1);
const DROP_GHOST_COLOR = new pc.Color(0.25, 0.78, 1.0, 0.95);
const GROUND_PLANE = new pc.Plane(new pc.Vec3(0, 1, 0), 0);
const FALLBACK_HALF_EXTENTS = new pc.Vec3(0.25, 0.25, 0.25);
const GHOST_HALF_EXTENTS = new pc.Vec3(0.5, 0.5, 0.5);
const SCENE_GROUP_FOLDERS = new Set([
  'Environment_Shell',
  'Walls',
  'Ceiling_Coffered',
  'Lighting_Rig',
  'Main_Stage',
  'Acoustic_Stage',
  'Lounge_Furniture',
]);

export class SelectionPicker {
  private readonly app: pc.Application;
  private readonly camera: pc.CameraComponent;
  private readonly sceneRoot: pc.Entity;
  private readonly editorLayer: pc.Layer;
  private readonly picker: pc.Picker;

  private highlightedEntities: pc.Entity[] = [];
  private dropGhostPos: pc.Vec3 | null = null;
  private destroyed = false;

  // Reusable scratch buffers to avoid per-frame allocations
  private readonly wirePositions: number[] = [];
  private readonly wireColors: number[] = [];
  private readonly scratchAabb = new pc.BoundingBox();
  private readonly scratchGhostCenter = new pc.Vec3();
  private readonly scratchNear = new pc.Vec3();
  private readonly scratchFar = new pc.Vec3();
  private readonly scratchDir = new pc.Vec3();
  private readonly scratchRay = new pc.Ray();
  private readonly scratchHitPoint = new pc.Vec3();
  private readonly scratchClosestHit = new pc.Vec3();
  private readonly scratchGroundHit = new pc.Vec3();

  constructor(
    app: pc.Application,
    camera: pc.CameraComponent,
    sceneRoot: pc.Entity,
    editorLayer: pc.Layer
  ) {
    this.app = app;
    this.camera = camera;
    this.sceneRoot = sceneRoot;
    this.editorLayer = editorLayer;

    const canvas = app.graphicsDevice.canvas;
    const width = Math.max(1, Math.floor(canvas.clientWidth || app.graphicsDevice.width));
    const height = Math.max(1, Math.floor(canvas.clientHeight || app.graphicsDevice.height));
    this.picker = new pc.Picker(app, width, height);

    this.app.on('update', this.onUpdate);
  }

  public pick(canvasX: number, canvasY: number): pc.Entity | null {
    if (this.destroyed) return null;

    const canvas = this.app.graphicsDevice.canvas;
    const width = Math.max(1, Math.floor(canvas.clientWidth || this.app.graphicsDevice.width));
    const height = Math.max(1, Math.floor(canvas.clientHeight || this.app.graphicsDevice.height));

    if (this.picker.width !== width || this.picker.height !== height) {
      this.picker.resize(width, height);
    }

    const pickLayers: pc.Layer[] = [];
    for (const layerId of this.camera.layers) {
      if (layerId === this.editorLayer.id) continue;
      const layer = this.app.scene.layers.getLayerById(layerId);
      if (layer) pickLayers.push(layer);
    }

    this.picker.prepare(
      this.camera,
      this.app.scene,
      pickLayers.length > 0 ? pickLayers : undefined
    );

    const hits = this.picker.getSelection(canvasX, canvasY);
    if (!hits || hits.length === 0) return null;

    for (const hit of hits) {
      const startNode: pc.GraphNode | null =
        'node' in hit ? hit.node : 'entity' in hit ? hit.entity : null;
      const resolved = this.resolveSceneEntity(startNode);
      if (resolved) return resolved;
    }

    return null;
  }

  public updateSelectionHighlight(entities: pc.Entity[]): void {
    if (this.destroyed) return;
    this.highlightedEntities = entities.filter((e) => e.parent !== null);
  }

  public raycastDropPoint(canvasX: number, canvasY: number): pc.Vec3 {
    if (this.destroyed) return new pc.Vec3(0, 0, 0);

    const near = this.camera.screenToWorld(canvasX, canvasY, this.camera.nearClip, this.scratchNear);
    const far = this.camera.screenToWorld(canvasX, canvasY, this.camera.farClip, this.scratchFar);
    const dir = this.scratchDir.sub2(far, near).normalize();
    this.scratchRay.set(near, dir);

    let closestDistSq = Infinity;
    let hasHit = false;

    const visit = (node: pc.GraphNode) => {
      if (node instanceof pc.Entity && node !== this.sceneRoot) {
        if (!node.enabled) return;
        const render = node.render;
        if (render && render.enabled && render.meshInstances) {
          for (const mi of render.meshInstances) {
            if (mi.aabb && mi.aabb.intersectsRay(this.scratchRay, this.scratchHitPoint)) {
              const distSq = near.distanceSq(this.scratchHitPoint);
              if (distSq < closestDistSq) {
                closestDistSq = distSq;
                this.scratchClosestHit.copy(this.scratchHitPoint);
                hasHit = true;
              }
            }
          }
        }
      }
      for (const child of node.children) {
        visit(child);
      }
    };

    visit(this.sceneRoot);

    if (hasHit) {
      return this.scratchClosestHit.clone();
    }

    if (GROUND_PLANE.intersectsRay(this.scratchRay, this.scratchGroundHit)) {
      return this.scratchGroundHit.clone();
    }

    return near.clone().add(dir.mulScalar(6));
  }

  public updateDropGhost(worldPos: pc.Vec3 | null): void {
    if (this.destroyed) return;
    this.dropGhostPos = worldPos ? worldPos.clone() : null;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.highlightedEntities = [];
    this.dropGhostPos = null;
    this.app.off('update', this.onUpdate);
    this.picker.destroy();
  }

  private resolveSceneEntity(node: pc.GraphNode | null): pc.Entity | null {
    let curr: pc.GraphNode | null = node;
    while (
      curr &&
      curr !== this.sceneRoot &&
      (!(curr instanceof pc.Entity) || curr.tags.has('__glb_internal__'))
    ) {
      curr = curr.parent;
    }
    if (!curr || curr === this.sceneRoot) return null;

    let resolved: pc.Entity | null = null;
    let cursor: pc.GraphNode | null = curr;
    while (cursor && cursor !== this.sceneRoot) {
      if (
        !resolved &&
        cursor instanceof pc.Entity &&
        !cursor.tags.has('__glb_internal__')
      ) {
        const parent = cursor.parent;
        if (
          parent === this.sceneRoot ||
          (parent instanceof pc.Entity && SCENE_GROUP_FOLDERS.has(parent.name))
        ) {
          resolved = cursor;
        }
      }
      cursor = cursor.parent;
    }

    return cursor === this.sceneRoot ? resolved : null;
  }

  private computeEntityAabb(entity: pc.Entity, outBox: pc.BoundingBox): pc.BoundingBox {
    let hasMesh = false;

    const visit = (node: pc.GraphNode) => {
      if (!(node instanceof pc.Entity) || !node.enabled) return;

      const render = node.render;
      if (render && render.enabled && render.meshInstances) {
        for (const mi of render.meshInstances) {
          if (!mi.aabb) continue;
          if (!hasMesh) {
            outBox.copy(mi.aabb);
            hasMesh = true;
          } else {
            outBox.add(mi.aabb);
          }
        }
      }

      for (const child of node.children) {
        visit(child);
      }
    };

    visit(entity);

    if (hasMesh) {
      return outBox;
    }

    outBox.center.copy(entity.getPosition());
    outBox.halfExtents.copy(FALLBACK_HALF_EXTENTS);
    return outBox;
  }

  private appendWireframeBox(aabb: pc.BoundingBox, color: pc.Color): void {
    const min = aabb.getMin();
    const max = aabb.getMax();
    const x0 = min.x;
    const y0 = min.y;
    const z0 = min.z;
    const x1 = max.x;
    const y1 = max.y;
    const z1 = max.z;

    // 12 edges = 24 vertices (flat xyz)
    this.wirePositions.push(
      // Bottom face
      x0, y0, z0, x1, y0, z0,
      x1, y0, z0, x1, y0, z1,
      x1, y0, z1, x0, y0, z1,
      x0, y0, z1, x0, y0, z0,
      // Top face
      x0, y1, z0, x1, y1, z0,
      x1, y1, z0, x1, y1, z1,
      x1, y1, z1, x0, y1, z1,
      x0, y1, z1, x0, y1, z0,
      // Vertical edges
      x0, y0, z0, x0, y1, z0,
      x1, y0, z0, x1, y1, z0,
      x1, y0, z1, x1, y1, z1,
      x0, y0, z1, x0, y1, z1
    );

    const r = color.r;
    const g = color.g;
    const b = color.b;
    const a = color.a;
    for (let i = 0; i < 24; i++) {
      this.wireColors.push(r, g, b, a);
    }
  }

  private onUpdate = (): void => {
    if (this.destroyed || (this.highlightedEntities.length === 0 && !this.dropGhostPos)) return;

    this.wirePositions.length = 0;
    this.wireColors.length = 0;

    for (const entity of this.highlightedEntities) {
      if (!entity.parent || !entity.enabled) continue;
      this.computeEntityAabb(entity, this.scratchAabb);
      this.appendWireframeBox(this.scratchAabb, HIGHLIGHT_COLOR);
    }

    if (this.dropGhostPos) {
      this.scratchGhostCenter.set(
        this.dropGhostPos.x,
        this.dropGhostPos.y + 0.5,
        this.dropGhostPos.z
      );
      this.scratchAabb.center.copy(this.scratchGhostCenter);
      this.scratchAabb.halfExtents.copy(GHOST_HALF_EXTENTS);
      this.appendWireframeBox(this.scratchAabb, DROP_GHOST_COLOR);
    }

    if (this.wirePositions.length > 0) {
      this.app.drawLineArrays(this.wirePositions, this.wireColors, false, this.editorLayer);
    }
  };
}
