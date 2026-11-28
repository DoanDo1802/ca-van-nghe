import * as pc from 'playcanvas';

export interface TwoBoneIKResult {
  upperWorldRot: pc.Quat;
  lowerWorldRot: pc.Quat;
}

function quatFromUnitVecs(from: pc.Vec3, to: pc.Vec3, out: pc.Quat): pc.Quat {
  const dot = pc.math.clamp(from.dot(to), -1, 1);
  if (dot > 0.99995) return out.set(0, 0, 0, 1);
  if (dot < -0.99995) {
    const axis = new pc.Vec3(1, 0, 0).cross(from, new pc.Vec3());
    if (axis.lengthSq() < 1e-4) axis.set(0, 1, 0).cross(from, axis);
    axis.normalize();
    return out.setFromAxisAngle(axis, 180);
  }
  const c = new pc.Vec3().cross(from, to);
  out.set(c.x, c.y, c.z, 1 + dot).normalize();
  return out;
}

/**
 * Analytic Two-Bone IK solver (Law of Cosines + pole-plane alignment) in world space.
 * Computes new world rotations for `upper` (shoulder/thigh) and `lower` (elbow/knee)
 * so the end effector (`endPos`) reaches `targetPos` while bending toward `poleDirHint`.
 */
export function solveTwoBoneIK(params: {
  upperPos: pc.Vec3;
  lowerPos: pc.Vec3;
  endPos: pc.Vec3;
  upperWorldRot: pc.Quat;
  lowerWorldRot: pc.Quat;
  targetPos: pc.Vec3;
  poleDirHint?: pc.Vec3;
}): TwoBoneIKResult {
  const { upperPos, lowerPos, endPos, upperWorldRot, lowerWorldRot, targetPos, poleDirHint } = params;

  const curUpperVec = new pc.Vec3().sub2(lowerPos, upperPos);
  const curLowerVec = new pc.Vec3().sub2(endPos, lowerPos);
  const len1 = curUpperVec.length();
  const len2 = curLowerVec.length();
  if (len1 < 1e-5 || len2 < 1e-5) {
    return { upperWorldRot: upperWorldRot.clone(), lowerWorldRot: lowerWorldRot.clone() };
  }

  const toTarget = new pc.Vec3().sub2(targetPos, upperPos);
  let targetDist = toTarget.length();
  if (targetDist < 1e-5) {
    return { upperWorldRot: upperWorldRot.clone(), lowerWorldRot: lowerWorldRot.clone() };
  }

  const minDist = Math.abs(len1 - len2) + 0.005;
  const maxDist = (len1 + len2) * 0.998;
  targetDist = pc.math.clamp(targetDist, minDist, maxDist);
  const targetDir = toTarget.clone().normalize();

  // Law of Cosines: angle at upper joint between upper limb and upper->target line
  const cosUpper = pc.math.clamp(
    (len1 * len1 + targetDist * targetDist - len2 * len2) / (2 * len1 * targetDist),
    -1,
    1
  );
  const sinUpper = Math.sqrt(Math.max(0, 1 - cosUpper * cosUpper));

  // Determine bend plane normal: prefer poleDirHint, fallback to current elbow/knee bend plane
  let bendPlaneDir = poleDirHint ? poleDirHint.clone() : new pc.Vec3();
  if (bendPlaneDir.lengthSq() < 1e-5) {
    const curTotal = new pc.Vec3().sub2(endPos, upperPos);
    if (curTotal.lengthSq() > 1e-6) {
      curTotal.normalize();
      const proj = curUpperVec.dot(curTotal);
      bendPlaneDir.copy(curUpperVec).sub(new pc.Vec3().copy(curTotal).mulScalar(proj));
    }
  } else {
    const proj = bendPlaneDir.dot(targetDir);
    bendPlaneDir.sub(new pc.Vec3().copy(targetDir).mulScalar(proj));
  }

  if (bendPlaneDir.lengthSq() < 1e-6) {
    // Straight arm fallback: pick a perpendicular axis
    bendPlaneDir.set(0, 0, -1);
    const proj = bendPlaneDir.dot(targetDir);
    bendPlaneDir.sub(new pc.Vec3().copy(targetDir).mulScalar(proj));
    if (bendPlaneDir.lengthSq() < 1e-6) {
      bendPlaneDir.set(0, 1, 0).cross(targetDir, bendPlaneDir);
    }
  }
  bendPlaneDir.normalize();

  // Desired elbow/knee world position & directions
  const desiredUpperDir = new pc.Vec3()
    .copy(targetDir)
    .mulScalar(cosUpper)
    .add(new pc.Vec3().copy(bendPlaneDir).mulScalar(sinUpper))
    .normalize();

  const newLowerPos = new pc.Vec3()
    .copy(upperPos)
    .add(new pc.Vec3().copy(desiredUpperDir).mulScalar(len1));
  const clampedTarget = new pc.Vec3()
    .copy(upperPos)
    .add(new pc.Vec3().copy(targetDir).mulScalar(targetDist));
  const desiredLowerDir = new pc.Vec3().sub2(clampedTarget, newLowerPos).normalize();

  // Compute upper rotation delta (curUpperDir -> desiredUpperDir)
  const curUpperDir = curUpperVec.clone().normalize();
  const qUpperDelta = quatFromUnitVecs(curUpperDir, desiredUpperDir, new pc.Quat());
  const newUpperWorldRot = new pc.Quat().mul2(qUpperDelta, upperWorldRot).normalize();

  // Compute lower rotation after upper delta has been applied, then swing to desiredLowerDir
  const swungLowerDir = qUpperDelta.transformVector(curLowerVec.clone().normalize(), new pc.Vec3()).normalize();
  const qLowerSwing = quatFromUnitVecs(swungLowerDir, desiredLowerDir, new pc.Quat());
  const newLowerWorldRot = new pc.Quat()
    .mul2(qLowerSwing, new pc.Quat().mul2(qUpperDelta, lowerWorldRot))
    .normalize();

  return {
    upperWorldRot: newUpperWorldRot,
    lowerWorldRot: newLowerWorldRot,
  };
}
