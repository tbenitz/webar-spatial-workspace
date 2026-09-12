import * as THREE from "three";

let seq = 1;

function mark(group, type, name) {
  group.userData = {
    kind: "item",
    type,
    name,
    fileName: "",
    mime: "",
    aspect: 16 / 9,
    placeholder: false,
    selected: false,
  };
  group.name = `${type}-${seq++}`;
  return group;
}

function addGizmo(group, size = 0.25) {
  const gizmo = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(size, size, size)), 0x7cd4ff);
  gizmo.name = "gizmo";
  gizmo.visible = false;
  group.add(gizmo);
}

export function createPrimitive(type) {
  const group = new THREE.Group();
  if (type === "box") {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x7cd4ff, roughness: 0.35, metalness: 0.2 })
    );
    mesh.position.y = 0.14;
    group.add(mesh);
    addGizmo(group, 0.32);
    return mark(group, "box", `Box ${seq}`);
  }
  if (type === "lamp") {
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.05, 0.55, 12),
      new THREE.MeshStandardMaterial({ color: 0x22252c })
    );
    stand.position.y = 0.275;
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe6b0 })
    );
    bulb.position.y = 0.58;
    const light = new THREE.PointLight(0xffe2b0, 1.4, 4);
    light.position.y = 0.58;
    group.add(stand, bulb, light);
    addGizmo(group, 0.4);
    return mark(group, "lamp", `Lamp ${seq}`);
  }
  if (type === "sign") {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x11141a, side: THREE.DoubleSide })
    );
    board.position.z = 0.01;
    group.add(board);
    addGizmo(group, 0.4);
    return mark(group, "sign", `Sign ${seq}`);
  }
  if (type === "marker") {
    const pin = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.16, 10),
      new THREE.MeshStandardMaterial({ color: 0xff7b8a })
    );
    pin.rotation.x = Math.PI;
    pin.position.y = 0.08;
    group.add(pin);
    addGizmo(group, 0.2);
    return mark(group, "marker", `Pin ${seq}`);
  }
  if (type === "frame" || type === "screen") {
    const w = type === "screen" ? 0.72 : 0.42;
    const h = type === "screen" ? 0.42 : 0.32;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.03, h + 0.03, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x16181f, metalness: 0.3, roughness: 0.4 })
    );
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: type === "screen" ? 0x123044 : 0xd7c4a3,
        side: THREE.DoubleSide,
      })
    );
    pane.position.z = 0.012;
    group.add(frame, pane);
    addGizmo(group, Math.max(w, h));
    const item = mark(group, type, type === "screen" ? `Screen ${seq}` : `Frame ${seq}`);
    item.userData.aspect = w / h;
    item.userData.height = h;
    return item;
  }
  return createPrimitive("marker");
}

export function setSelected(item, selected) {
  item.userData.selected = selected;
  const gizmo = item.getObjectByName("gizmo");
  if (gizmo) gizmo.visible = selected;
}

export function applyUniformScale(item, factor) {
  const next = THREE.MathUtils.clamp(item.scale.x * factor, 0.2, 8);
  item.scale.setScalar(next);
}

export function disposeItem(item) {
  const { objectUrl, video, sound } = item.userData;
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  if (sound) {
    try { sound.disconnect(); } catch { /* ignore */ }
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  item.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}

export function placeOnHit(item, point, normal, camera) {
  const n = normal.clone().normalize();
  item.position.copy(point).addScaledVector(n, 0.02);
  const vertical = Math.abs(n.y) < 0.4;
  if (vertical || item.userData.type === "screen" || item.userData.type === "frame" || item.userData.type === "sign" || item.userData.type === "image" || item.userData.type === "video") {
    if (vertical) {
      const look = point.clone().add(n);
      item.up.set(0, 1, 0);
      item.lookAt(look);
    } else if (item.userData.type === "box" || item.userData.type === "lamp" || item.userData.type === "marker") {
      item.position.y = point.y;
      item.rotation.set(0, 0, 0);
    } else {
      const target = camera.position.clone();
      target.y = item.position.y + (item.userData.height || 0.2) * 0.5;
      item.position.y += (item.userData.height || 0.2) * 0.5;
      item.up.set(0, 1, 0);
      item.lookAt(target);
    }
  } else {
    item.position.y = point.y;
    item.rotation.set(0, 0, 0);
  }
}

export function placeFromReticleMatrix(item, matrix, camera) {
  const pos = new THREE.Vector3().setFromMatrixPosition(matrix);
  const normal = new THREE.Vector3().setFromMatrixColumn(matrix, 1).normalize();
  placeOnHit(item, pos, normal, camera);
}
