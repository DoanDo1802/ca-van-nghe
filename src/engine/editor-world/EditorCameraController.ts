import * as pc from 'playcanvas';

export type CameraSnapView = 'top' | 'front' | 'right' | 'iso';

const MIN_PITCH = -89.5;
const MAX_PITCH = 89.5;
const MIN_DISTANCE = 0.5;
const MAX_DISTANCE = 500;
const ORBIT_SENSITIVITY = 0.25;
const FLY_LOOK_SENSITIVITY = 0.2;
const BASE_FLY_SPEED = 8;
const MIN_FLY_SPEED = 2;
const MAX_FLY_SPEED = 40;
const BOOST_MULTIPLIER = 2.5;
const PAN_SENSITIVITY = 0.0015;
const DOLLY_SENSITIVITY = 0.005;
const ZOOM_STEP = 0.1;

export class EditorCameraController {
  public readonly cameraEntity: pc.Entity;

  private readonly app: pc.Application;
  private readonly canvas: HTMLCanvasElement;

  private focusPoint = new pc.Vec3(0, 1.4, -6);
  private distance = 14.6;
  private yaw = 0;
  private pitch = -6.3;
  private flySpeed = BASE_FLY_SPEED;

  private activeMode: 'none' | 'fly' | 'orbit' | 'pan' | 'dolly' = 'none';
  private lastPointerX = 0;
  private lastPointerY = 0;
  private readonly pressedKeys = new Set<string>();
  private destroyed = false;

  private readonly tempForward = new pc.Vec3();
  private readonly tempRight = new pc.Vec3();
  private readonly tempUp = new pc.Vec3();
  private readonly tempMove = new pc.Vec3();

  constructor(app: pc.Application, canvas: HTMLCanvasElement, editorLayer: pc.Layer) {
    this.app = app;
    this.canvas = canvas;

    this.cameraEntity = new pc.Entity('EditorCamera');
    this.cameraEntity.addComponent('camera', {
      clearColor: new pc.Color(0.11, 0.12, 0.14, 1),
      fov: 50,
      nearClip: 0.1,
      farClip: 2000,
      layers: [pc.LAYERID_WORLD, pc.LAYERID_SKYBOX, editorLayer.id],
    });

    this.app.root.addChild(this.cameraEntity);
    this.updateOrbitTransform();

    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    this.app.on('update', this.onUpdate);
  }

  public focusOn(target: pc.Vec3, radius = 2): void {
    if (this.destroyed) return;
    this.focusPoint.copy(target);
    this.distance = pc.math.clamp(Math.max(radius * 2.5, 1.5), MIN_DISTANCE, MAX_DISTANCE);
    this.updateOrbitTransform();
  }

  public snapView(view: CameraSnapView): void {
    if (this.destroyed) return;
    switch (view) {
      case 'top':
        this.yaw = 0;
        this.pitch = -89.5;
        break;
      case 'front':
        this.yaw = 0;
        this.pitch = 0;
        break;
      case 'right':
        this.yaw = 90;
        this.pitch = 0;
        break;
      case 'iso':
        this.yaw = 45;
        this.pitch = -30;
        break;
    }
    this.updateOrbitTransform();
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.app.off('update', this.onUpdate);

    this.pressedKeys.clear();
    if (this.cameraEntity.parent) {
      this.cameraEntity.destroy();
    }
  }

  private updateOrbitTransform(): void {
    this.cameraEntity.setEulerAngles(this.pitch, this.yaw, 0);
    this.tempForward.copy(this.cameraEntity.forward).mulScalar(this.distance);
    this.cameraEntity.setPosition(
      this.focusPoint.x - this.tempForward.x,
      this.focusPoint.y - this.tempForward.y,
      this.focusPoint.z - this.tempForward.z
    );
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (this.destroyed) return;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    if (e.button === 2 && e.altKey) {
      this.activeMode = 'dolly';
    } else if (e.button === 2) {
      this.activeMode = 'fly';
    } else if (e.button === 0 && e.altKey) {
      this.activeMode = 'orbit';
    } else if (e.button === 1) {
      e.preventDefault();
      this.activeMode = 'pan';
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.destroyed || this.activeMode === 'none') return;

    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    if (this.activeMode === 'fly') {
      this.yaw -= dx * FLY_LOOK_SENSITIVITY;
      this.pitch = pc.math.clamp(this.pitch - dy * FLY_LOOK_SENSITIVITY, MIN_PITCH, MAX_PITCH);
      this.cameraEntity.setEulerAngles(this.pitch, this.yaw, 0);

      // Keep focusPoint in front of the camera so switching to Orbit/Zoom is seamless
      const pos = this.cameraEntity.getPosition();
      this.tempForward.copy(this.cameraEntity.forward).mulScalar(this.distance);
      this.focusPoint.set(
        pos.x + this.tempForward.x,
        pos.y + this.tempForward.y,
        pos.z + this.tempForward.z
      );
    } else if (this.activeMode === 'orbit') {
      this.yaw -= dx * ORBIT_SENSITIVITY;
      this.pitch = pc.math.clamp(this.pitch - dy * ORBIT_SENSITIVITY, MIN_PITCH, MAX_PITCH);
      this.updateOrbitTransform();
    } else if (this.activeMode === 'pan') {
      const scale = this.distance * PAN_SENSITIVITY;
      this.tempRight.copy(this.cameraEntity.right).mulScalar(-dx * scale);
      this.tempUp.copy(this.cameraEntity.up).mulScalar(dy * scale);
      this.focusPoint.add(this.tempRight).add(this.tempUp);
      this.updateOrbitTransform();
    } else if (this.activeMode === 'dolly') {
      const delta = dx + dy;
      const factor = Math.exp(-delta * DOLLY_SENSITIVITY);
      this.distance = pc.math.clamp(this.distance * factor, MIN_DISTANCE, MAX_DISTANCE);
      this.updateOrbitTransform();
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (
      ((this.activeMode === 'fly' || this.activeMode === 'dolly') && e.button === 2) ||
      (this.activeMode === 'orbit' && e.button === 0) ||
      (this.activeMode === 'pan' && e.button === 1)
    ) {
      this.activeMode = 'none';
    }
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.destroyed) return;
    e.preventDefault();
    if (this.activeMode === 'fly') {
      const factor = 1 - Math.sign(e.deltaY) * ZOOM_STEP;
      this.flySpeed = pc.math.clamp(this.flySpeed * factor, MIN_FLY_SPEED, MAX_FLY_SPEED);
      return;
    }
    const factor = 1 + Math.sign(e.deltaY) * ZOOM_STEP;
    this.distance = pc.math.clamp(this.distance * factor, MIN_DISTANCE, MAX_DISTANCE);
    this.updateOrbitTransform();
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.destroyed) return;
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (this.activeMode !== 'fly' && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
      return;
    }
    this.pressedKeys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.pressedKeys.delete(e.code);
  };

  private onWindowBlur = (): void => {
    this.activeMode = 'none';
    this.pressedKeys.clear();
  };

  private onUpdate = (dt: number): void => {
    if (this.destroyed || this.activeMode !== 'fly') return;

    let forwardInput = 0;
    let rightInput = 0;
    let upInput = 0;

    if (this.pressedKeys.has('KeyW')) forwardInput += 1;
    if (this.pressedKeys.has('KeyS')) forwardInput -= 1;
    if (this.pressedKeys.has('KeyD')) rightInput += 1;
    if (this.pressedKeys.has('KeyA')) rightInput -= 1;
    if (this.pressedKeys.has('KeyE')) upInput += 1;
    if (this.pressedKeys.has('KeyQ')) upInput -= 1;

    if (forwardInput === 0 && rightInput === 0 && upInput === 0) return;

    const speed =
      this.flySpeed *
      (this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight')
        ? BOOST_MULTIPLIER
        : 1) *
      dt;

    this.tempMove.set(0, 0, 0);
    if (forwardInput !== 0) {
      this.tempForward.copy(this.cameraEntity.forward).mulScalar(forwardInput);
      this.tempMove.add(this.tempForward);
    }
    if (rightInput !== 0) {
      this.tempRight.copy(this.cameraEntity.right).mulScalar(rightInput);
      this.tempMove.add(this.tempRight);
    }
    if (upInput !== 0) {
      this.tempMove.y += upInput;
    }

    if (this.tempMove.lengthSq() > 0) {
      this.tempMove.normalize().mulScalar(speed);
      this.cameraEntity.translate(this.tempMove);
      this.focusPoint.add(this.tempMove);
    }
  };
}
