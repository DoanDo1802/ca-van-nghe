import * as pc from 'playcanvas';

const HIGHLIGHT_COLOR = new pc.Color(1, 0.65, 0.1, 1);
const DROP_GHOST_COLOR = new pc.Color(0.25, 0.78, 1.0, 0.95);
const GROUND_PLANE = new pc.Plane(new pc.Vec3(0, 1, 0), 0);
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

    const near = this.camera.screenToWorld(canvasX, canvasY, this.camera.nearClip);
    const far = this.camera.screenToWorld(canvasX, canvasY, this.camera.farClip);
    const dir = far.clone().sub(near).normalize();
    const ray = new pc.Ray(near, dir);

    let closestDistSq = Infinity;
    let closestHit: pc.Vec3 | null = null;
    const hitPoint = new pc.Vec3();

    const visit = (node: pc.GraphNode) => {
      if (node instanceof pc.Entity && node !== this.sceneRoot) {
        if (!node.enabled) return;
        const render = node.render;
        if (render && render.enabled && render.meshInstances) {
          for (const mi of render.meshInstances) {
            if (mi.aabb && mi.aabb.intersectsRay(ray, hitPoint)) {
              const distSq = near.distanceSq(hitPoint);
              if (distSq < closestDistSq) {
                closestDistSq = distSq;
                closestHit = hitPoint.clone();
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

    if (closestHit) {
      return closestHit;
    }

    const groundHit = new pc.Vec3();
    if (GROUND_PLANE.intersectsRay(ray, groundHit)) {
      return groundHit;
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

  private computeEntityAabb(entity: pc.Entity): pc.BoundingBox {
    const box = new pc.BoundingBox();
    let hasMesh = false;

    const visit = (node: pc.GraphNode) => {
      if (!(node instanceof pc.Entity) || !node.enabled) return;

      const render = node.render;
      if (render && render.enabled && render.meshInstances) {
        for (const mi of render.meshInstances) {
          if (!mi.aabb) continue;
          if (!hasMesh) {
            box.copy(mi.aabb);
            hasMesh = true;
          } else {
            box.add(mi.aabb);
          }
        }
      }

      for (const child of node.children) {
        visit(child);
      }
    };

    visit(entity);

    if (hasMesh) {
      return box;
    }

    const pos = entity.getPosition();
    return new pc.BoundingBox(pos.clone(), new pc.Vec3(0.25, 0.25, 0.25));
  }

  private appendWireframeBox(
    aabb: pc.BoundingBox,
    color: pc.Color,
    positions: pc.Vec3[],
    colors: pc.Color[]
  ): void {
    const min = aabb.getMin();
    const max = aabb.getMax();

    const p000 = new pc.Vec3(min.x, min.y, min.z);
    const p100 = new pc.Vec3(max.x, min.y, min.z);
    const p010 = new pc.Vec3(min.x, max.y, min.z);
    const p110 = new pc.Vec3(max.x, max.y, min.z);
    const p001 = new pc.Vec3(min.x, min.y, max.z);
    const p101 = new pc.Vec3(max.x, min.y, max.z);
    const p011 = new pc.Vec3(min.x, max.y, max.z);
    const p111 = new pc.Vec3(max.x, max.y, max.z);

    const edges: [pc.Vec3, pc.Vec3][] = [
      // Bottom face
      [p000, p100],
      [p100, p101],
      [p101, p001],
      [p001, p000],
      // Top face
      [p010, p110],
      [p110, p111],
      [p111, p011],
      [p011, p010],
      // Vertical edges
      [p000, p010],
      [p100, p110],
      [p101, p111],
      [p001, p011],
    ];

    for (const [a, b] of edges) {
      positions.push(a, b);
      colors.push(color, color);
    }
  }

  private onUpdate = (): void => {
    if (this.destroyed || (this.highlightedEntities.length === 0 && !this.dropGhostPos)) return;

    const positions: pc.Vec3[] = [];
    const colors: pc.Color[] = [];

    for (const entity of this.highlightedEntities) {
      if (!entity.parent || !entity.enabled) continue;
      const aabb = this.computeEntityAabb(entity);
      this.appendWireframeBox(aabb, HIGHLIGHT_COLOR, positions, colors);
    }

    if (this.dropGhostPos) {
      const ghostCenter = new pc.Vec3(
        this.dropGhostPos.x,
        this.dropGhostPos.y + 0.5,
        this.dropGhostPos.z
      );
      const ghostAabb = new pc.BoundingBox(ghostCenter, new pc.Vec3(0.5, 0.5, 0.5));
      this.appendWireframeBox(ghostAabb, DROP_GHOST_COLOR, positions, colors);
    }

    if (positions.length > 0) {
      this.app.drawLines(positions, colors, false, this.editorLayer);
    }
  };
}
