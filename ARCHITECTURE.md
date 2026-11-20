# Web-based 3D Game Editor — Architecture Blueprint (Phase 0)

> **Status:** Phase 0 Blueprint (awaiting review before Phase 1 implementation)
> **Target Stack:** PlayCanvas Engine v2+ (`playcanvas`), `ammo.js` (WASM), React 18+, TypeScript, Vite, Tailwind CSS, Zustand, `react-resizable-panels`, `idb` (IndexedDB), Lucide Icons, CodeMirror/Monaco.

---

## 0. Current Repository Baseline & Migration Notes

The workspace (`ca-van-nghe-web3d`) currently uses Vite 5 + React 18 + Tailwind CSS 3 + Lucide Icons with JavaScript/JSX (`src/App.jsx`, `src/main.jsx`, and Three.js/R3F components under `src/components/`).

**Phase 0 constraint:** No existing files are modified and no packages are installed yet.

When Phase 1 begins:
1. Add `typescript` (`tsconfig.json`), `playcanvas` (v2+), `ammojs-typed` / `ammo.js` WASM assets, `zustand`, `react-resizable-panels`, and `idb`.
2. Mount the new Editor shell (`src/editor/EditorApp.tsx`) cleanly without breaking existing files, or switch the Vite entry point in `index.html` / `src/main.tsx` as agreed in Phase 1.

---

## 1. Core Architecture Principles & PlayCanvas v2 Constraints

1. **Editor World vs. Game World (`EditorLayer` & `SceneRoot`)**
   - All user-authored entities live under a single root `pc.Entity` named `SceneRoot`.
   - Editor-only objects (Editor Camera, Infinite 3D Grid, `pc.TranslateGizmo` / `pc.RotateGizmo` / `pc.ScaleGizmo`, Orientation Axis, Selection Outline/Wireframe, Drop Preview Ghost) are assigned to a dedicated `pc.Layer` (`EditorLayer`).
   - `EditorLayer` entities are never serialized into `SceneSchema` and are hidden when entering Play Mode.

2. **PlayCanvas v2+ API Mandate**
   - **MUST use `render` component** (`entity.addComponent('render', ...)`) — NEVER deprecated `model`.
   - **MUST use `anim` component** (`entity.addComponent('anim', ...)`) — NEVER deprecated `animation`.
   - **MUST use native PlayCanvas Gizmos** (`pc.TranslateGizmo`, `pc.RotateGizmo`, `pc.ScaleGizmo`) rendered on `EditorLayer`.
   - **Physics:** `ammo.js` (WASM) initialized before `pc.Application` physics systems (`rigidbody` and `collision` components).

3. **Play Mode Isolation (Snapshot & Restore)**
   - **Play:** Serialize `SceneRoot` subtree to an in-memory `SceneSchema` JSON snapshot -> hide `EditorLayer` overlays/gizmos -> switch active camera to Game Camera -> enable Physics (`rigidbody`), `anim` playback, `InteractiveRuntime`, and `ScriptRuntime`.
   - **Pause / Step:** Set `app.timeScale = 0`; Step advances a single fixed delta (`1 / 60` s).
   - **Stop:** Tear down runtime systems and scripts, call `destroy()` on all runtime WebGL resources (Materials, Textures, Meshes, Event listeners) to prevent memory leaks, destroy `SceneRoot`, and deserialize the pre-Play JSON snapshot back into `SceneRoot`.

4. **Command Pattern (`CommandManager`)**
   - Every scene mutation (Transform, Create/Delete Entity, Reparent with world-transform preservation, Edit Property, Add/Remove Component, Keyframe edit) executes via `CommandManager.execute(cmd)` and supports `undo()` / `redo()` (`Ctrl+Z` / `Ctrl+Y`).
   - **Gizmo Drag Rule:** During a gizmo drag, transforms update live in the engine (and throttled UI events notify the Inspector), but **only 1 command** is pushed on `drag:end` capturing `oldTransform` and `newTransform`.

5. **Event-Driven Bridge (`EditorEngine` + `EventBus` + Zustand Split)**
   - `EditorEngine` is a singleton wrapping `pc.Application`, `SceneRoot`, `EditorLayer`, `GizmoManager`, `Picker`, and `EventBus`.
   - **State Split:** React/Zustand stores ONLY lightweight UI state (`selectedEntityIds`, `hierarchyTreeVersion`, `activeTool`, `playState`, `snapSettings`, `inspectorVersion`, etc.) — never raw `pc.Entity` or `pc.Application` instances, and never updated at 60fps. High-frequency viewport updates (e.g. gizmo drag readouts) are throttled before hitting React.

---

## 2. Detailed Folder Structure

```text
src/
├── types/                          # Pure TypeScript contracts (zero runtime/PlayCanvas coupling)
│   ├── scene.ts                    # SceneSchema, EntityData, TransformData, ProjectMetadata
│   ├── components.ts               # ComponentData union (render, light, camera, collision, rigidbody, anim, interactive, script)
│   ├── animation.ts                # AnimationClipData, PropertyTrack, Keyframe, AnimStateGraphData
│   ├── interaction.ts              # InteractionRule, TriggerConfig, ActionConfig, ScriptAttributeDef
│   ├── command.ts                  # ICommand, TransformSnapshot
│   ├── events.ts                   # EditorEventMap, TypedEventBus interface
│   ├── assets.ts                   # AssetManifestEntry, AssetType, PrefabData
│   └── index.ts                    # Barrel export
│
├── engine/                         # PlayCanvas v2 runtime & EditorEngine singleton
│   ├── EditorEngine.ts             # Singleton: pc.Application lifecycle, SceneRoot, Play/Pause/Step/Stop snapshot-restore
│   ├── EventBus.ts                 # Typed EventBus<EditorEventMap>
│   ├── CommandManager.ts           # Undo/Redo stack + concrete commands (Transform, Create, Delete, Reparent, Property, Component, Keyframe)
│   ├── commands/                   # Modular ICommand implementations
│   │   ├── TransformCommand.ts
│   │   ├── EntityCommands.ts       # CreateEntityCommand, DeleteEntityCommand, ReparentEntityCommand, DuplicateEntityCommand
│   │   ├── ComponentCommands.ts    # AddComponentCommand, RemoveComponentCommand, UpdatePropertyCommand
│   │   └── KeyframeCommands.ts     # AddKeyframeCommand, MoveKeyframeCommand, DeleteKeyframeCommand
│   ├── editor-world/               # EditorLayer-only systems (excluded from export)
│   │   ├── EditorCameraController.ts # Fly (RMB+WASD/QE), Orbit (Alt+LMB), Pan (MMB), Zoom, Focus (F), Axis snap
│   │   ├── GizmoController.ts      # Native pc.TranslateGizmo, pc.RotateGizmo, pc.ScaleGizmo + Snap + drag:end command push
│   │   ├── InfiniteGrid.ts         # Distance-faded 3D ground grid on EditorLayer
│   │   ├── OrientationAxis.ts      # Top-right XYZ axis gizmo & quick-view camera snap
│   │   └── SelectionPicker.ts      # pc.Picker framebuffer picking + selection outline/wireframe + drop raycast
│   ├── serialization/              # SceneRoot <-> SceneSchema JSON
│   │   ├── SceneSerializer.ts      # Serialize SceneRoot -> SceneSchema (excludes EditorLayer)
│   │   ├── SceneDeserializer.ts    # Deserialize SceneSchema -> pc.Entity tree + destroy() cleanup
│   │   └── AmmoLoader.ts           # WASM initialization for ammo.js physics
│   ├── animation/                  # Keyframe & GLB Anim runtime
│   │   ├── KeyframeEvaluator.ts    # Evaluates AnimationClipData tracks (Linear/EaseIn/EaseOut/EaseInOut/Step; Once/Loop/PingPong)
│   │   └── GlbAnimExtractor.ts     # Extracts AnimTrack & configures pc.AnimComponent state graphs from .glb
│   └── runtime/                    # Active only in Play Mode (or Timeline Scrub preview)
│       ├── InteractionRuntime.ts   # Evaluates InteractionRule triggers & executes action chains (with Wait/Tween/Force/Sound)
│       ├── ScriptSandbox.ts        # Sandboxed user JS execution (onStart, onUpdate, onClick, onCollision) -> Console errors
│       └── ConsoleBridge.ts        # Intercepts runtime/script log, warn, error -> EventBus
│
├── storage/                        # IndexedDB persistence & Import/Export
│   ├── IndexedDbClient.ts          # `idb` wrapper for database schema (`projects`, `assets`, `blobs`)
│   ├── ProjectRepository.ts        # Save/Load SceneSchema projects, auto-save drafts
│   ├── AssetRepository.ts          # Store/retrieve binary blobs (.glb, .png, .jpg, .mp3), generate 3D/image thumbnails
│   └── BundleExporter.ts           # Export/Import standalone JSON project & asset manifest
│
├── store/                          # Zustand stores (Editor UI state only, decoupled from 60fps engine loop)
│   ├── useEditorStore.ts           # selectedEntityIds, activeTool (Q/W/E/R), coordSpace, snapSettings, playState, hierarchyTreeVersion
│   ├── useAssetStore.ts            # Virtual folder tree, asset manifest list, drag-drop payload
│   ├── useTimelineStore.ts         # activeClipId, playheadTime, isPlayingPreview, isRecording, zoom/scroll
│   └── useConsoleStore.ts          # Log entries, level filters (log/warn/error)
│
└── editor/                         # React 18 + Tailwind CSS + Lucide UI
    ├── EditorApp.tsx               # Root layout using react-resizable-panels (Unity-style docking)
    ├── components/
    │   ├── TopToolbar.tsx          # Q/W/E/R, Local/World, Snap toggles, Play/Pause/Step, File menu
    │   ├── HierarchyPanel.tsx      # SceneRoot tree, Drag-Drop reparent, Search/Tag filter, Context menu, Enabled toggle
    │   ├── ViewportPanel.tsx       # WebGL Canvas host, Orientation Axis overlay, Asset Drop target + Ghost preview
    │   ├── InspectorPanel.tsx      # Entity header, Transform with scrubbing inputs, Add/Remove Component
    │   ├── inspector/              # Per-component Inspector sections
    │   │   ├── RenderInspector.tsx
    │   │   ├── LightInspector.tsx
    │   │   ├── CameraInspector.tsx
    │   │   ├── PhysicsInspector.tsx    # Collision & RigidBody
    │   │   ├── AnimInspector.tsx       # GLB State Graph & Keyframe clips
    │   │   ├── InteractiveInspector.tsx # Visual WHEN [Trigger] -> DO [Actions] builder + Hierarchy entity drop
    │   │   └── ScriptInspector.tsx     # CodeMirror/Monaco script editor + dynamic attributes
    │   ├── BottomDock.tsx          # Tabbed container: Project/Asset Browser, Animation Timeline, Console
    │   ├── AssetBrowserPanel.tsx   # Virtual folders, OS file drop (.glb/.png/.mp3), Prefab creation from Hierarchy
    │   ├── TimelinePanel.tsx       # Dope Sheet, Playhead scrubbing, Record Mode, Interpolation/Loop controls
    │   └── ConsolePanel.tsx        # Filterable log/warn/error viewer + Clear
    └── hooks/
        ├── useEngineSync.ts        # Subscribes to EventBus -> updates Zustand stores (throttled for transforms)
        └── useKeyboardShortcuts.ts # Q/W/E/R, F (Focus), Ctrl+Z/Y, Ctrl+D, Del, F2
```

---

## 3. Complete Core TypeScript Interfaces

All core contracts live in `src/types/` with zero dependency on `playcanvas` runtime classes so they are safe for serialization, Zustand, and worker/UI boundaries.

### 3.1 `src/types/scene.ts` — `SceneSchema` & `EntityData`

```ts
export type Vec3 = [number, number, number];
export type ColorRGB = [number, number, number];
export type ColorRGBA = [number, number, number, number];

export interface TransformData {
  position: Vec3;
  rotation: Vec3; // Euler angles in degrees
  scale: Vec3;
}

export interface EntityData {
  id: string;
  name: string;
  enabled: boolean;
  tags: string[];
  transform: TransformData;
  components: ComponentData[];
  children: EntityData[];
}

export interface SceneSettings {
  ambientColor: ColorRGB;
  skyboxColor: ColorRGBA;
  gravity: Vec3;
  activeCameraEntityId: string | null;
}

export interface SceneSchema {
  version: string; // e.g. "1.0.0"
  metadata: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  assets: AssetManifestEntry[];
  settings: SceneSettings;
  scene: EntityData; // Always represents SceneRoot
  animations: Record<string, AnimationClipData>;
  interactions: Record<string, InteractionRule[]>; // Keyed by entityId
}
```

### 3.2 `src/types/components.ts` — `ComponentData`

Covers all 8 required PlayCanvas v2+ component types (`render`, `light`, `camera`, `collision`, `rigidbody`, `anim`, `interactive`, `script`).

```ts
export type ComponentType =
  | 'render'
  | 'light'
  | 'camera'
  | 'collision'
  | 'rigidbody'
  | 'anim'
  | 'interactive'
  | 'script';

export interface BaseComponentData {
  id: string;
  type: ComponentType;
  enabled: boolean;
}

export interface MaterialOverrideData {
  diffuseColor: ColorRGB;
  metalness: number; // 0..1
  gloss: number;     // 0..1
  emissiveColor: ColorRGB;
  emissiveIntensity: number;
  opacity: number;   // 0..1
  diffuseMapAssetId?: string | null;
  normalMapAssetId?: string | null;
  metalnessMapAssetId?: string | null;
}

export interface RenderComponentData extends BaseComponentData {
  type: 'render';
  meshType: 'box' | 'sphere' | 'plane' | 'cylinder' | 'capsule' | 'asset';
  meshAssetId?: string | null;
  castShadows: boolean;
  receiveShadows: boolean;
  material: MaterialOverrideData;
}

export interface LightComponentData extends BaseComponentData {
  type: 'light';
  lightType: 'directional' | 'point' | 'spot';
  color: ColorRGB;
  intensity: number;
  range: number;
  castShadows: boolean;
  innerConeAngle: number;
  outerConeAngle: number;
}

export interface CameraComponentData extends BaseComponentData {
  type: 'camera';
  fov: number;
  clearColor: ColorRGBA;
  nearClip: number;
  farClip: number;
  priority: number;
  projection: 'perspective' | 'orthographic';
  orthoHeight?: number;
}

export interface CollisionComponentData extends BaseComponentData {
  type: 'collision';
  shape: 'box' | 'sphere' | 'capsule' | 'mesh';
  halfExtents: Vec3;
  radius: number;
  height: number;
  meshAssetId?: string | null;
  isTrigger: boolean;
}

export interface RigidBodyComponentData extends BaseComponentData {
  type: 'rigidbody';
  bodyType: 'static' | 'dynamic' | 'kinematic';
  mass: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
  linearFactor: Vec3;
  angularFactor: Vec3;
}

export interface AnimStateConfig {
  name: string;
  clipAssetId: string; // GLB AnimTrack or AnimationClipData ID
  speed: number;
  loop: boolean;
}

export interface AnimTransitionConfig {
  from: string;
  to: string;
  blendTime: number;
  trigger?: string;
}

export interface AnimComponentData extends BaseComponentData {
  type: 'anim';
  activate: boolean;
  speed: number;
  defaultState: string;
  states: AnimStateConfig[];
  transitions: AnimTransitionConfig[];
  keyframeClipIds: string[];
}

export interface InteractiveComponentData extends BaseComponentData {
  type: 'interactive';
  rules: InteractionRule[];
}

export interface ScriptAttributeValue {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'vec3' | 'color' | 'entity' | 'asset';
  value: unknown;
}

export interface ScriptComponentData extends BaseComponentData {
  type: 'script';
  scriptName: string;
  code: string;
  attributes: ScriptAttributeValue[];
}

export type ComponentData =
  | RenderComponentData
  | LightComponentData
  | CameraComponentData
  | CollisionComponentData
  | RigidBodyComponentData
  | AnimComponentData
  | InteractiveComponentData
  | ScriptComponentData;
```

### 3.3 `src/types/animation.ts` — `AnimationClipData`

```ts
export type InterpolationMode = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'step';
export type LoopMode = 'once' | 'loop' | 'pingpong';

export type AnimatablePropertyPath =
  | 'position'
  | 'rotation'
  | 'scale'
  | 'material.diffuse'
  | 'material.opacity'
  | 'light.intensity';

export interface KeyframeData<T = number | Vec3 | ColorRGB> {
  id: string;
  time: number; // Seconds
  value: T;
  interpolation: InterpolationMode;
}

export interface PropertyTrackData {
  id: string;
  targetEntityId: string;
  property: AnimatablePropertyPath;
  keyframes: KeyframeData[];
}

export interface AnimationClipData {
  id: string;
  name: string;
  duration: number;
  fps: number;
  loopMode: LoopMode;
  tracks: PropertyTrackData[];
}
```

### 3.4 `src/types/interaction.ts` — `InteractionRule`

```ts
export type TriggerType =
  | 'OnStart'
  | 'OnPointerClick'
  | 'OnPointerHoverEnter'
  | 'OnPointerHoverExit'
  | 'OnKeyDown'
  | 'OnCollisionEnter'
  | 'OnTriggerEnter'
  | 'OnProximityEnter'
  | 'OnCustomEvent';

export interface TriggerConfig {
  type: TriggerType;
  key?: string;            // For OnKeyDown
  targetEntityId?: string; // For OnProximityEnter / collision filter
  distance?: number;       // For OnProximityEnter
  eventName?: string;      // For OnCustomEvent
}

export type ActionType =
  | 'PlayAnimation'
  | 'TweenTransform'
  | 'SetActive'
  | 'ChangeMaterialColor'
  | 'ApplyForce'
  | 'PlaySound'
  | 'Wait'
  | 'EmitCustomEvent';

export interface ActionConfig {
  id: string;
  type: ActionType;
  targetEntityId?: string | null; // Supports drag-drop from Hierarchy; null = self
  clipOrStateName?: string;       // PlayAnimation
  transformProperty?: 'position' | 'rotation' | 'scale'; // TweenTransform
  targetVec3?: Vec3;              // TweenTransform / ApplyForce
  duration?: number;              // TweenTransform / Wait
  easing?: InterpolationMode;     // TweenTransform
  active?: boolean;               // SetActive
  color?: ColorRGB;               // ChangeMaterialColor
  soundAssetId?: string;          // PlaySound
  eventName?: string;             // EmitCustomEvent
}

export interface InteractionRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: TriggerConfig;
  actions: ActionConfig[];
}
```

### 3.5 `src/types/command.ts` — `ICommand`

```ts
export interface ICommand {
  readonly id: string;
  readonly label: string;
  readonly timestamp: number;
  execute(): void;
  undo(): void;
  merge?(next: ICommand): boolean;
}
```

### 3.6 `src/types/events.ts` — `EditorEventMap`

```ts
export type PlayModeState = 'edit' | 'playing' | 'paused';
export type TransformTool = 'select' | 'move' | 'rotate' | 'scale';
export type CoordinateSpace = 'local' | 'world';

export interface ConsoleLogPayload {
  id: string;
  level: 'log' | 'warn' | 'error';
  message: string;
  source?: string;
  timestamp: number;
}

export interface EditorEventMap {
  'engine:ready': { version: string };
  'scene:loaded': { sceneId: string };
  'hierarchy:changed': { rootId: string };
  'selection:changed': { entityIds: string[] };
  'entity:transform-updated': { entityId: string; transform: TransformData; fromGizmo: boolean };
  'entity:property-changed': { entityId: string; componentId?: string; property: string };
  'gizmo:drag-start': { entityIds: string[] };
  'gizmo:drag-end': { entityIds: string[] };
  'tool:changed': { tool: TransformTool; space: CoordinateSpace };
  'playmode:changed': { state: PlayModeState };
  'command:executed': { label: string; canUndo: boolean; canRedo: boolean };
  'timeline:scrub': { clipId: string; time: number };
  'timeline:keyframe-recorded': { clipId: string; entityId: string; property: AnimatablePropertyPath; time: number };
  'asset:imported': { asset: AssetManifestEntry };
  'console:message': ConsoleLogPayload;
}
```

### 3.7 `src/types/assets.ts` — `AssetManifestEntry`

```ts
export type AssetType = 'glb' | 'gltf' | 'texture' | 'audio' | 'prefab';

export interface AssetManifestEntry {
  id: string;
  name: string;
  type: AssetType;
  folderPath: string; // Virtual folder path, e.g. "/Models"
  mimeType: string;
  sizeBytes: number;
  indexedDbKey: string;
  thumbnailDataUrl?: string;
  createdAt: string;
}
```

---

## 4. 5-Phase Implementation Roadmap & Swarm Parallelization

Each phase produces a **runnable, testable** application and splits cleanly across swarm workers with disjoint file ownership.

### Phase 1: Engine Core, Viewport & Command Foundation
- **Goal:** Boot PlayCanvas v2+ inside React with Unity-style resizable layout, `EditorLayer` vs `SceneRoot`, Editor Camera, Infinite Grid, Orientation Axis, `pc.Picker`, native Gizmos (`Q/W/E/R`, Local/World, Snap), and `CommandManager` Undo/Redo.
- **Swarm Split (Zero File Collisions):**
  - *Worker A (`types-and-store`):* `src/types/*`, `src/store/useEditorStore.ts`, `src/store/useConsoleStore.ts`.
  - *Worker B (`engine-core`):* `src/engine/EventBus.ts`, `src/engine/EditorEngine.ts`, `src/engine/CommandManager.ts`, `src/engine/commands/*`, `src/engine/serialization/AmmoLoader.ts`.
  - *Worker C (`editor-world`):* `src/engine/editor-world/*` (Camera, Gizmos, Grid, OrientationAxis, SelectionPicker).
  - *Worker D (`ui-shell`):* `src/editor/EditorApp.tsx`, `src/editor/components/TopToolbar.tsx`, `ViewportPanel.tsx`, `HierarchyPanel.tsx`, `ConsolePanel.tsx`, `src/editor/hooks/*`.
- **Acceptance Criteria:**
  1. App builds and renders 3D viewport with Infinite Grid and Orientation Axis.
  2. Create Primitive (Box/Sphere/Plane) from Hierarchy context menu, click-select in Viewport, move/rotate/scale via Gizmos (`W/E/R`), and `Ctrl+Z` / `Ctrl+Y` undoes/redoes in a single step per drag.
  3. Camera navigation (RMB+WASD, Alt+LMB Orbit, MMB Pan, Scroll, `F` Focus) works smoothly.

### Phase 2: Inspector, Dynamic Components, Hierarchy Reparenting & Play Mode Snapshot
- **Goal:** Full Inspector with Transform scrubbing, all PlayCanvas v2 components (`render`, `light`, `camera`, `collision`, `rigidbody`), Hierarchy drag-drop reparenting preserving world transform, and Play/Pause/Step/Stop with `SceneRoot` JSON Snapshot & Restore.
- **Swarm Split:**
  - *Worker A (`serialization`):* `src/engine/serialization/SceneSerializer.ts`, `SceneDeserializer.ts`, plus `EditorEngine` Play/Pause/Step/Stop snapshot integration.
  - *Worker B (`inspector-ui`):* `src/editor/components/InspectorPanel.tsx`, `inspector/RenderInspector.tsx`, `LightInspector.tsx`, `CameraInspector.tsx`, `PhysicsInspector.tsx`.
  - *Worker C (`hierarchy-dnd`):* Drag-drop reparenting, duplicate (`Ctrl+D`), rename (`F2`), delete (`Del`), tag/name search in `HierarchyPanel.tsx` + `EntityCommands.ts`.
- **Acceptance Criteria:**
  1. Add `rigidbody` (Dynamic) + `collision` (Box) to a cube above a static plane; press **Play** -> cube falls under `ammo.js` physics; press **Pause/Step** -> advances 1 frame; press **Stop** -> cube snaps back to exact pre-Play position with zero WebGL leaks.
  2. Reparent child entity in Hierarchy -> world position/rotation/scale remains unchanged.

### Phase 3: IndexedDB Persistence, Asset Browser & GLB/Prefab Pipeline
- **Goal:** IndexedDB storage (`idb`), Project Save/Load, JSON Export/Import, OS drag-drop import (`.glb`/`.gltf`, textures, audio) with auto-generated thumbnails, drag-drop from Asset Browser into Viewport (raycast spawn at Y=0 or collider surface), and Entity-to-Prefab creation.
- **Swarm Split:**
  - *Worker A (`storage`):* `src/storage/*` (`IndexedDbClient.ts`, `ProjectRepository.ts`, `AssetRepository.ts`, `BundleExporter.ts`).
  - *Worker B (`asset-ui`):* `src/store/useAssetStore.ts`, `src/editor/components/AssetBrowserPanel.tsx`, `BottomDock.tsx`.
  - *Worker C (`viewport-drop`):* Raycast drop & ghost wireframe preview in `SelectionPicker.ts` & `ViewportPanel.tsx`, plus `GlbAnimExtractor.ts` GLB loading.
- **Acceptance Criteria:**
  1. Drop a `.glb` and `.png` from desktop into Asset Browser -> stored in IndexedDB with thumbnail, survives page reload.
  2. Drag `.glb` onto Viewport -> spawns at raycast hit point; drag Entity from Hierarchy to Asset Browser -> creates reusable Prefab.

### Phase 4: Dual Animation System (Keyframe Timeline + GLB Skeletal/Morph)
- **Goal:** Keyframe Timeline / Dope Sheet editor (`position`, `rotation`, `scale`, `material.diffuse`, `material.opacity`, `light.intensity`), playhead scrubbing in Edit Mode, interpolation/loop modes, Unity-style **Record Mode**, and GLB `anim` component state graph & transitions.
- **Swarm Split:**
  - *Worker A (`anim-engine`):* `src/engine/animation/KeyframeEvaluator.ts`, `GlbAnimExtractor.ts`, `src/engine/commands/KeyframeCommands.ts`.
  - *Worker B (`timeline-ui`):* `src/store/useTimelineStore.ts`, `src/editor/components/TimelinePanel.tsx`.
  - *Worker C (`anim-inspector`):* `src/editor/components/inspector/AnimInspector.tsx`.
- **Acceptance Criteria:**
  1. Enable **Record Mode**, scrub playhead to `1.0s`, move object with Gizmo -> keyframe auto-created; scrubbing playhead previews smooth interpolation in Edit Mode.
  2. Imported `.glb` lists extracted `AnimTrack` states on `anim` component with configurable transitions and plays in Play Mode.

### Phase 5: Interactive Object System (Visual Trigger-Action + Sandboxed Scripting)
- **Goal:** No-code `WHEN [Trigger] -> DO [Action List]` builder with Hierarchy entity drag-drop targeting, plus CodeMirror/Monaco `Custom Script` editor (`onStart`, `onUpdate`, `onClick`, `onCollision`, dynamic `attributes`) running in a `try/catch` sandbox routed to Console.
- **Swarm Split:**
  - *Worker A (`interaction-runtime`):* `src/engine/runtime/InteractionRuntime.ts`, `ScriptSandbox.ts`, `ConsoleBridge.ts`.
  - *Worker B (`interactive-ui`):* `src/editor/components/inspector/InteractiveInspector.tsx`.
  - *Worker C (`script-ui`):* `src/editor/components/inspector/ScriptInspector.tsx`.
- **Acceptance Criteria:**
  1. Attach `WHEN OnPointerClick -> DO PlayAnimation + ChangeMaterialColor` on an entity -> clicking it in Play Mode triggers both actions without writing code.
  2. Attach a `Custom Script` with an exposed `speed` attribute, edit `speed` in Inspector, and verify `onUpdate(dt)` runs in Play Mode while runtime exceptions appear cleanly in Console without crashing the Editor.
