import * as THREE from "three";
import { ui, setStatus, showBanner, hideBanner, haptic, downloadJson, logDebug } from "./ui.js";
import { createImageScreen, createVideoScreen, createPlaceholderScreen, setSelected as setMediaSelected, disposeScreen } from "./screens.js";
import { createPrimitive, setSelected as setPrimSelected, disposeItem, placeOnHit, placeFromReticleMatrix } from "./objects.js";
import { attachGestures } from "./gestures.js";
import { serializeWorkspace, readLayoutFile } from "./layout.js";
import { createRoom } from "./room.js";
import { xrSupportText, probeAR, requestARSession, makeHitTestSource } from "./xr.js";

const state = {
  mode: "idle",
  snap: false,
  selected: null,
  placeType: "screen",
  missFrames: 0,
  hitTestSource: null,
  session: null,
  yaw: 0,
  pitch: 0,
};

const workspace = new THREE.Group();
workspace.name = "workspace";
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);
scene.add(workspace);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 60);
camera.position.set(0, 1.6, 2.2);
const listener = new THREE.AudioListener();
camera.add(listener);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local");
document.body.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3344, 1.05));
const key = new THREE.DirectionalLight(0xffffff, 0.75);
key.position.set(2, 4, 1);
scene.add(key);

const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.06, 0.08, 36).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x7cd4ff })
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

const room = createRoom();
scene.add(room);

function items() {
  return workspace.children.filter((c) => c.userData?.kind === "item");
}

function setSelected(item) {
  if (state.selected && state.selected !== item) {
    setMediaSelected(state.selected, false);
    setPrimSelected(state.selected, false);
  }
  state.selected = item || null;
  items().forEach((s) => {
    setMediaSelected(s, s === item);
    setPrimSelected(s, s === item);
  });
  if (!item) {
    ui.inspector.classList.add("hidden");
    return;
  }
  ui.inspector.classList.remove("hidden");
  ui.selName.textContent = item.userData.name;
  if (item.userData.video) {
    ui.videoControls.classList.remove("hidden");
    ui.play.textContent = item.userData.video.paused ? "Play" : "Pause";
  } else {
    ui.videoControls.classList.add("hidden");
  }
  haptic(10);
}

function applyLook() {
  camera.rotation.order = "YXZ";
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
}

function enterRoomMode() {
  state.mode = "room";
  document.body.classList.add("live");
  scene.background = new THREE.Color(0x8aa0b8);
  room.visible = true;
  camera.position.set(0, 1.6, 2.4);
  state.yaw = 0;
  state.pitch = 0;
  applyLook();
  setStatus("3D room · drag to look around");
  ui.hint.textContent = "Drag to turn 90\u00b0 or look behind you. Drop objects on walls and the floor.";
  hideBanner();
}

function leaveSession() {
  if (state.session) {
    try { state.session.end(); } catch { /* ignore */ }
  }
  state.mode = "idle";
  state.session = null;
  state.hitTestSource = null;
  document.body.classList.remove("live");
  scene.background = new THREE.Color(0x0b0d12);
  room.visible = true;
  reticle.visible = false;
  setStatus("Ready");
}

async function startAR() {
  logDebug("AR tap · " + xrSupportText());
  const probe = await probeAR();
  logDebug(JSON.stringify(probe));
  if (!probe.immersiveAR) {
    showBanner((probe.error || "AR unavailable") + " Opening the 3D room so you can still map space.");
    enterRoomMode();
    return;
  }
  setStatus("Requesting camera…");
  try {
    const { session, init } = await requestARSession(document.body);
    state.session = session;
    logDebug("session ok features=" + JSON.stringify(init.requiredFeatures || []));
    renderer.xr.setReferenceSpaceType("local");
    await renderer.xr.setSession(session);
    state.mode = "ar";
    document.body.classList.add("live");
    scene.background = null;
    room.visible = false;
    setStatus("Scan the room — pan slowly");
    ui.hint.textContent = "Walk the room. Turn to place things beside and behind you.";
    haptic(20);
    state.hitTestSource = await makeHitTestSource(session);
    session.addEventListener("end", () => {
      state.session = null;
      state.hitTestSource = null;
      if (state.mode === "ar") leaveSession();
    });
  } catch (err) {
    const msg = err?.message || String(err);
    logDebug("AR failed: " + msg);
    showBanner("AR failed: " + msg + " · using 3D room instead", 5000);
    enterRoomMode();
  }
}

function currentPlacePoint() {
  if (reticle.visible && state.mode === "ar") {
    return { matrix: reticle.matrix, point: null, normal: null };
  }
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  camera.getWorldPosition(origin);
  camera.getWorldDirection(dir);
  const raycaster = new THREE.Raycaster(origin, dir);
  const hits = raycaster.intersectObjects(room.userData.colliders, false);
  if (hits[0]) return { matrix: null, point: hits[0].point, normal: hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld) };
  return { matrix: null, point: origin.clone().addScaledVector(dir, 1.6), normal: new THREE.Vector3(0, 1, 0) };
}

function seatItem(item) {
  const hit = currentPlacePoint();
  if (hit.matrix) placeFromReticleMatrix(item, hit.matrix, camera);
  else placeOnHit(item, hit.point, hit.normal, camera);
}

async function spawnMedia(kind, file) {
  const url = URL.createObjectURL(file);
  try {
    const item = kind === "video" ? await createVideoScreen(file, url, listener) : await createImageScreen(file, url);
    seatItem(item);
    workspace.add(item);
    setSelected(item);
    setStatus(`${items().length} objects in room`);
    haptic(18);
    if (kind === "video") item.userData.video.play().catch(() => {});
  } catch (err) {
    URL.revokeObjectURL(url);
    showBanner(err.message || "Could not load media", 3200);
  }
}

function spawnPrimitive(type) {
  const item = createPrimitive(type);
  seatItem(item);
  workspace.add(item);
  setSelected(item);
  setStatus(`${items().length} objects in room`);
  haptic(16);
}

function dropPending() {
  if (state.placeType === "image") { ui.fileImage.click(); return; }
  if (state.placeType === "video") { ui.fileVideo.click(); return; }
  spawnPrimitive(state.placeType);
}

function duplicateSelected() {
  const src = state.selected;
  if (!src) return;
  if (src.userData.video || src.userData.type === "image" || src.userData.type === "video") {
    const clone = src.clone(true);
    clone.userData = { ...src.userData, sound: null, name: `${src.userData.name} copy` };
    clone.position.x += 0.18;
    workspace.add(clone);
    setSelected(clone);
    return;
  }
  const item = createPrimitive(src.userData.type);
  item.position.copy(src.position).add(new THREE.Vector3(0.18, 0, 0.04));
  item.quaternion.copy(src.quaternion);
  item.scale.copy(src.scale);
  workspace.add(item);
  setSelected(item);
}

function deleteSelected() {
  const src = state.selected;
  if (!src) return;
  workspace.remove(src);
  disposeScreen(src);
  disposeItem(src);
  setSelected(null);
  setStatus(items().length ? `${items().length} objects in room` : "Room empty");
}

function resetSpace() {
  const list = items();
  if (!list.length) { showBanner("Nothing to recenter", 1600); return; }
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  camera.getWorldDirection(camDir);
  const centroid = new THREE.Vector3();
  list.forEach((s) => centroid.add(s.position));
  centroid.multiplyScalar(1 / list.length);
  const target = camPos.clone().addScaledVector(camDir, 1.5);
  target.y = centroid.y;
  const delta = target.sub(centroid);
  list.forEach((s) => s.position.add(delta));
  haptic(18);
  showBanner("Layout moved in front of you", 1800);
}

attachGestures({
  renderer,
  camera,
  getItems: items,
  getRoomMeshes: () => (room.visible ? room.userData.colliders : []),
  onSelect: setSelected,
  onEmptyTap: (roomHit) => {
    if (roomHit && state.mode !== "idle") {
      const itemType = state.placeType;
      if (itemType === "image" || itemType === "video") { setSelected(null); return; }
      const item = createPrimitive(itemType);
      placeOnHit(item, roomHit.point, roomHit.face.normal.clone().transformDirection(roomHit.object.matrixWorld), camera);
      workspace.add(item);
      setSelected(item);
      setStatus(`${items().length} objects in room`);
      return;
    }
    setSelected(null);
  },
  onLook: (dx, dy) => {
    if (state.mode !== "room") return;
    state.yaw -= dx * 0.005;
    state.pitch -= dy * 0.004;
    state.pitch = Math.max(-1.2, Math.min(1.2, state.pitch));
    applyLook();
  },
  snapEnabled: () => state.snap,
  lookEnabled: () => state.mode === "room",
});

ui.tray.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-place]");
  if (!btn) return;
  state.placeType = btn.dataset.place;
  ui.tray.querySelectorAll(".tool").forEach((el) => el.classList.toggle("on", el === btn));
  if (state.placeType === "image") ui.fileImage.click();
  if (state.placeType === "video") ui.fileVideo.click();
});

ui.ar.addEventListener("click", startAR);
ui.arHero.addEventListener("click", startAR);
ui.room.addEventListener("click", enterRoomMode);
ui.drop.addEventListener("click", dropPending);
ui.exit.addEventListener("click", leaveSession);
ui.snap.addEventListener("click", () => {
  state.snap = !state.snap;
  ui.snap.setAttribute("aria-pressed", String(state.snap));
});
ui.reset.addEventListener("click", resetSpace);
ui.exportBtn.addEventListener("click", () => {
  downloadJson(`spatial-layout-${Date.now()}.json`, serializeWorkspace(items()));
  showBanner("Layout exported. Relink media files after import.", 3200);
});
ui.importBtn.addEventListener("click", () => ui.fileJson.click());
ui.fileImage.addEventListener("change", () => {
  const file = ui.fileImage.files?.[0];
  ui.fileImage.value = "";
  if (file) spawnMedia("image", file);
});
ui.fileVideo.addEventListener("change", () => {
  const file = ui.fileVideo.files?.[0];
  ui.fileVideo.value = "";
  if (file) spawnMedia("video", file);
});
ui.fileJson.addEventListener("change", async () => {
  const file = ui.fileJson.files?.[0];
  ui.fileJson.value = "";
  if (!file) return;
  try {
    const data = await readLayoutFile(file);
    data.screens.forEach((meta) => {
      const item = ["image", "video"].includes(meta.type) ? createPlaceholderScreen(meta) : createPrimitive(meta.type || "marker");
      if (meta.position) item.position.fromArray(meta.position);
      if (meta.quaternion) item.quaternion.fromArray(meta.quaternion);
      if (meta.scale) item.scale.fromArray(meta.scale);
      workspace.add(item);
    });
    setStatus(`${items().length} objects in room`);
    showBanner("Layout restored. Relink image/video files if needed.", 3600);
  } catch (err) {
    showBanner(err.message || "Bad layout file", 2400);
  }
});
ui.fileRelink.addEventListener("change", async () => {
  const file = ui.fileRelink.files?.[0];
  ui.fileRelink.value = "";
  const target = state.selected;
  if (!file || !target) return;
  const kind = file.type.startsWith("video") ? "video" : "image";
  const url = URL.createObjectURL(file);
  try {
    const fresh = kind === "video" ? await createVideoScreen(file, url, listener) : await createImageScreen(file, url);
    fresh.position.copy(target.position);
    fresh.quaternion.copy(target.quaternion);
    fresh.scale.copy(target.scale);
    workspace.add(fresh);
    workspace.remove(target);
    disposeScreen(target);
    setSelected(fresh);
  } catch (err) {
    URL.revokeObjectURL(url);
    showBanner(err.message || "Relink failed", 2400);
  }
});
ui.dup.addEventListener("click", duplicateSelected);
ui.del.addEventListener("click", deleteSelected);
ui.relink.addEventListener("click", () => ui.fileRelink.click());
ui.deselect.addEventListener("click", () => setSelected(null));
ui.play.addEventListener("click", () => {
  const video = state.selected?.userData.video;
  if (!video) return;
  if (video.paused) video.play().catch(() => {});
  else video.pause();
  ui.play.textContent = video.paused ? "Play" : "Pause";
});
ui.loop.addEventListener("click", () => {
  const video = state.selected?.userData.video;
  if (!video) return;
  video.loop = !video.loop;
});
ui.scrub.addEventListener("input", () => {
  const video = state.selected?.userData.video;
  if (!video || !video.duration) return;
  video.currentTime = (Number(ui.scrub.value) / 1000) * video.duration;
});
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener("keydown", (event) => {
  if (state.mode !== "room") return;
  const move = new THREE.Vector3();
  if (event.key === "w" || event.key === "ArrowUp") move.z = -1;
  if (event.key === "s" || event.key === "ArrowDown") move.z = 1;
  if (event.key === "a" || event.key === "ArrowLeft") move.x = -1;
  if (event.key === "d" || event.key === "ArrowRight") move.x = 1;
  if (!move.lengthSq()) return;
  move.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);
  camera.position.addScaledVector(move, 0.12);
  camera.position.y = 1.6;
});
function adaptiveResolution() {
  const playing = items().filter((s) => s.userData.video && !s.userData.video.paused).length;
  const cap = playing >= 3 ? 1 : Math.min(window.devicePixelRatio, 2);
  if (Math.abs(renderer.getPixelRatio() - cap) > 0.05) renderer.setPixelRatio(cap);
}
function animate(_time, frame) {
  if (state.mode === "room") applyLook();
  if (frame && state.hitTestSource) {
    const refSpace = renderer.xr.getReferenceSpace();
    if (refSpace) {
      const hits = frame.getHitTestResults(state.hitTestSource);
      if (hits.length) {
        const pose = hits[0].getPose(refSpace);
        if (pose) {
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
          state.missFrames = 0;
          if (ui.status.textContent.includes("Scan the room")) setStatus("Surface locked · walk and place");
          hideBanner();
        }
      } else {
        reticle.visible = false;
        state.missFrames += 1;
        if (state.missFrames === 40) showBanner("Keep panning. Point at floors, tables, and walls to map the room.");
      }
    }
  }
  const video = state.selected?.userData.video;
  if (video && video.duration) ui.scrub.value = String(Math.round((video.currentTime / video.duration) * 1000));
  adaptiveResolution();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
probeAR().then((probe) => {
  ui.compat.textContent = xrSupportText() + (probe.immersiveAR ? " · AR ready" : " · AR not reported");
  setStatus(probe.immersiveAR ? "AR ready" : "AR not available here");
  if (!probe.immersiveAR && probe.error) logDebug(probe.error);
});
