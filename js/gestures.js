import * as THREE from "three";
import { applyUniformScale } from "./screens.js";
import { haptic } from "./ui.js";

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const worldDelta = new THREE.Vector3();

function eventPoint(event) {
  return event.touches ? event.touches[0] || event.changedTouches[0] : event;
}

function eventNdc(event, renderer) {
  const rect = renderer.domElement.getBoundingClientRect();
  const src = eventPoint(event);
  ndc.x = ((src.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((src.clientY - rect.top) / rect.height) * 2 + 1;
  return ndc;
}

function pinchDistance(touches) {
  const [a, b] = touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function pinchAngle(touches) {
  const [a, b] = touches;
  return Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
}

function snapAngle(rad, step = Math.PI / 2) {
  return Math.round(rad / step) * step;
}

export function attachGestures(opts) {
  const { renderer, camera, getItems, getRoomMeshes, onSelect, onEmptyTap, onLook, snapEnabled, lookEnabled } = opts;
  const state = { mode: "idle", item: null, last: null, pinch0: 0, angle0: 0, rot0: 0, dragging: false, lookLast: null };

  function pickItem(event) {
    eventNdc(event, renderer);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(getItems(), true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && obj.userData?.kind !== "item") obj = obj.parent;
    return obj || null;
  }

  function pickRoom(event) {
    const meshes = getRoomMeshes ? getRoomMeshes() : [];
    if (!meshes.length) return null;
    eventNdc(event, renderer);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(meshes, false);
    return hits[0] || null;
  }

  function onDown(event) {
    const touches = event.touches ? event.touches.length : 1;
    if (touches >= 2) {
      const selected = getItems().find((s) => s.userData.selected);
      if (!selected) return;
      state.mode = "pinch";
      state.item = selected;
      state.pinch0 = pinchDistance(event.touches);
      state.angle0 = pinchAngle(event.touches);
      state.rot0 = selected.rotation.z;
      event.preventDefault();
      return;
    }
    const hit = pickItem(event);
    if (hit) {
      state.mode = "drag";
      state.item = hit;
      state.last = { x: eventNdc(event, renderer).x, y: ndc.y };
      state.dragging = false;
      onSelect(hit);
      event.preventDefault();
      return;
    }
    const src = eventPoint(event);
    state.mode = "look";
    state.lookLast = { x: src.clientX, y: src.clientY };
    state.dragging = false;
  }

  function onMove(event) {
    if (state.mode === "pinch" && event.touches && event.touches.length >= 2 && state.item) {
      const dist = pinchDistance(event.touches);
      applyUniformScale(state.item, dist / Math.max(state.pinch0, 1));
      state.pinch0 = dist;
      let angle = pinchAngle(event.touches) - state.angle0 + state.rot0;
      if (snapEnabled()) {
        const snapped = snapAngle(angle);
        if (Math.abs(snapped - angle) < 0.12) { angle = snapped; haptic(8); }
      }
      state.item.rotation.z = angle;
      event.preventDefault();
      return;
    }
    if (state.mode === "drag" && state.item) {
      eventNdc(event, renderer);
      const dx = ndc.x - state.last.x;
      const dy = ndc.y - state.last.y;
      if (Math.hypot(dx, dy) < 0.004 && !state.dragging) return;
      state.dragging = true;
      state.last = { x: ndc.x, y: ndc.y };
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      right.y = 0;
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      const dist = camera.position.distanceTo(state.item.position);
      const speed = Math.max(dist, 0.6) * 1.15;
      worldDelta.set(0, 0, 0);
      if (snapEnabled()) {
        if (Math.abs(dx) >= Math.abs(dy)) worldDelta.addScaledVector(right, dx * speed);
        else worldDelta.addScaledVector(up, dy * speed);
      } else {
        worldDelta.addScaledVector(right, dx * speed);
        worldDelta.addScaledVector(up, dy * speed);
        worldDelta.addScaledVector(forward, dy * speed * 0.2);
      }
      state.item.position.add(worldDelta);
      event.preventDefault();
      return;
    }
    if (state.mode === "look" && lookEnabled() && state.lookLast) {
      const src = eventPoint(event);
      const dx = src.clientX - state.lookLast.x;
      const dy = src.clientY - state.lookLast.y;
      if (Math.hypot(dx, dy) > 2) state.dragging = true;
      state.lookLast = { x: src.clientX, y: src.clientY };
      onLook(dx, dy);
      event.preventDefault();
    }
  }

  function onUp(event) {
    if (state.mode === "look" && !state.dragging) onEmptyTap(pickRoom(event));
    state.mode = "idle";
    state.item = null;
    state.dragging = false;
    state.lookLast = null;
  }

  const el = document.getElementById("gesture-layer") || renderer.domElement;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.addEventListener("touchstart", onDown, { passive: false });
  el.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp);
  return { pickRoom };
}
