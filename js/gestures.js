import * as THREE from "three";
import { applyUniformScale } from "./screens.js";
import { haptic } from "./ui.js";

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const worldDelta = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function eventNdc(event, renderer) {
  const rect = renderer.domElement.getBoundingClientRect();
  const src = event.touches ? event.touches[0] || event.changedTouches[0] : event;
  ndc.x = ((src.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((src.clientY - rect.top) / rect.height) * 2 + 1;
  return ndc;
}

function pinchDistance(touches) {
  const [a, b] = touches;
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function pinchAngle(touches) {
  const [a, b] = touches;
  return Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
}

function snapAngle(rad, step = Math.PI / 2) {
  return Math.round(rad / step) * step;
}

export function attachGestures({ renderer, camera, workspace, getScreens, onSelect, onEmptyTap, snapEnabled }) {
  const state = {
    mode: "idle",
    screen: null,
    last: null,
    pinch0: 0,
    angle0: 0,
    rot0: 0,
    dragging: false,
  };

  function pick(event) {
    eventNdc(event, renderer);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(getScreens(), true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && obj.userData?.kind !== "mediaScreen") obj = obj.parent;
    return obj || null;
  }

  function onPointerDown(event) {
    const touches = event.touches ? event.touches.length : 1;
    if (touches >= 2) {
      const selected = getScreens().find((s) => s.userData.selected);
      if (!selected) return;
      state.mode = "pinch";
      state.screen = selected;
      state.pinch0 = pinchDistance(event.touches);
      state.angle0 = pinchAngle(event.touches);
      state.rot0 = selected.rotation.z;
      event.preventDefault();
      return;
    }

    const hit = pick(event);
    if (hit) {
      state.mode = "drag";
      state.screen = hit;
      state.last = { x: eventNdc(event, renderer).x, y: ndc.y };
      state.dragging = false;
      onSelect(hit);
      event.preventDefault();
    } else {
      state.mode = "empty";
      state.screen = null;
    }
  }

  function onPointerMove(event) {
    if (state.mode === "pinch" && event.touches && event.touches.length >= 2 && state.screen) {
      const dist = pinchDistance(event.touches);
      const scaleFactor = dist / Math.max(state.pinch0, 1);
      applyUniformScale(state.screen, scaleFactor);
      state.pinch0 = dist;

      let angle = pinchAngle(event.touches) - state.angle0 + state.rot0;
      if (snapEnabled()) {
        const snapped = snapAngle(angle);
        if (Math.abs(snapped - angle) < 0.12) {
          angle = snapped;
          haptic(8);
        }
      }
      state.screen.rotation.z = angle;
      event.preventDefault();
      return;
    }

    if (state.mode === "drag" && state.screen) {
      eventNdc(event, renderer);
      const dx = ndc.x - state.last.x;
      const dy = ndc.y - state.last.y;
      if (Math.hypot(dx, dy) < 0.004 && !state.dragging) return;
      state.dragging = true;
      state.last = { x: ndc.x, y: ndc.y };

      const cam = camera;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const up = new THREE.Vector3(0, 1, 0);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      right.y = 0;
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();

      const dist = cam.position.distanceTo(state.screen.position);
      const speed = Math.max(dist, 0.6) * 1.15;

      worldDelta.set(0, 0, 0);
      if (snapEnabled()) {
        if (Math.abs(dx) >= Math.abs(dy)) worldDelta.addScaledVector(right, dx * speed);
        else worldDelta.addScaledVector(up, dy * speed);
      } else {
        worldDelta.addScaledVector(right, dx * speed);
        worldDelta.addScaledVector(up, dy * speed);
        worldDelta.addScaledVector(forward, dy * speed * 0.15);
      }
      state.screen.position.add(worldDelta);
      event.preventDefault();
    }
  }

  function onPointerUp(event) {
    if (state.mode === "empty" && !state.dragging) {
      onEmptyTap();
    }
    if (state.mode === "drag" && state.screen && !state.dragging) {
      onSelect(state.screen);
    }
    state.mode = "idle";
    state.screen = null;
    state.dragging = false;
    event.preventDefault();
  }

  const el = uiTarget(renderer);
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  el.addEventListener("touchstart", onPointerDown, { passive: false });
  el.addEventListener("touchmove", onPointerMove, { passive: false });
  window.addEventListener("touchend", onPointerUp);

  return {
    dispose() {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("touchstart", onPointerDown);
      el.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerUp);
    },
  };
}

function uiTarget(renderer) {
  return document.getElementById("gesture-layer") || renderer.domElement;
}

export function placeFromReticle(screen, reticle, camera) {
  const normal = new THREE.Vector3(0, 1, 0).setFromMatrixColumn(reticle.matrix, 1).normalize();
  const origin = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  const vertical = Math.abs(normal.y) < 0.45;

  if (vertical) {
    screen.position.copy(origin).addScaledVector(normal, 0.02);
    lookTarget.copy(origin).add(normal);
    screen.up.copy(new THREE.Vector3(0, 1, 0));
    screen.lookAt(lookTarget);
  } else {
    const height = screen.userData.height * screen.scale.y;
    screen.position.copy(origin);
    screen.position.y += height / 2 + 0.01;
    lookTarget.copy(camera.position);
    lookTarget.y = screen.position.y;
    screen.up.set(0, 1, 0);
    screen.lookAt(lookTarget);
  }
}
