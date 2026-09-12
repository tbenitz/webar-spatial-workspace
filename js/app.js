import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ui, setStatus, showBanner, hideBanner, haptic, downloadJson } from "./ui.js";
import {
  createImageScreen,
  createVideoScreen,
  createPlaceholderScreen,
  setSelected,
  disposeScreen,
} from "./screens.js";
import { attachGestures, placeFromReticle } from "./gestures.js";
import { serializeWorkspace, readLayoutFile } from "./layout.js";

const state = {
  mode: "idle",
  snap: false,
  selected: null,
  pendingKind: null,
  missFrames: 0,
  hitTestSource: null,
  hitTestSourceRequested: false,
  previewControls: null,
};

const clock = new THREE.Clock();
const workspace = new THREE.Group();
workspace.name = "workspace";

const scene = new THREE.Scene();
scene.add(workspace);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 40);
camera.position.set(0, 1.4, 2.2);

const listener = new THREE.AudioListener();
camera.add(listener);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
document.body.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 0.8);
key.position.set(1, 2, 1);
scene.add(key);

const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.07, 0.09, 36).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x7cd4ff })
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

const previewRig = buildPreviewRig();
scene.add(previewRig);

function buildPreviewRig() {
  const group = new THREE.Group();
  group.name = "preview-rig";
  const grid = new THREE.GridHelper(8, 16, 0x2a3344, 0x171c26);
  group.add(grid);
  const room = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(6, 3, 6)),
    new THREE.LineBasicMaterial({ color: 0x243044 })
  );
  room.position.y = 1.5;
  group.add(room);
  return group;
}

function screens() {
  return workspace.children.filter((c) => c.userData?.kind === "mediaScreen");
}

function selectScreen(screen) {
  if (state.selected && state.selected !== screen) setSelected(state.selected, false);
  state.selected = screen || null;
  screens().forEach((s) => setSelected(s, s === screen));
  if (!screen) {
    ui.inspector.classList.add("hidden");
    return;
  }
  ui.inspector.classList.remove("hidden");
  ui.selName.textContent = screen.userData.name;
  const video = screen.userData.video;
  if (video) {
    ui.videoControls.classList.remove("hidden");
    ui.play.textContent = video.paused ? "Play" : "Pause";
    ui.loop.style.opacity = video.loop ? "1" : "0.55";
  } else {
    ui.videoControls.classList.add("hidden");
  }
  haptic(10);
}

function adaptiveResolution() {
  const playing = screens().filter((s) => s.userData.video && !s.userData.video.paused).length;
  const cap = playing >= 3 ? 1 : playing === 2 ? 1.25 : Math.min(window.devicePixelRatio, 2);
  if (Math.abs(renderer.getPixelRatio() - cap) > 0.05) renderer.setPixelRatio(cap);
}

async function spawnFromFile(file, kind) {
  const url = URL.createObjectURL(file);
  try {
    const screen =
      kind === "video"
        ? await createVideoScreen(file, url, listener)
        : await createImageScreen(file, url);
    placeScreen(screen);
    workspace.add(screen);
    selectScreen(screen);
    setStatus(`${screens().length} anchored`);
    haptic(18);
    ui.hint.textContent = "Drag to move · pinch to scale · twist to rotate";
    if (kind === "video") {
      screen.userData.video.play().catch(() => {});
    }
  } catch (err) {
    URL.revokeObjectURL(url);
    showBanner(err.message || "Could not load media", 3200);
  }
}

function placeScreen(screen) {
  if (reticle.visible && state.mode === "ar") {
    placeFromReticle(screen, reticle, camera);
    return;
  }
  const offset = screens().length * 0.15;
  screen.position.set(-0.4 + offset, 1.3, -1.4);
  screen.lookAt(camera.position);
}

function duplicateSelected() {
  const src = state.selected;
  if (!src) return;
  const clone = src.clone(true);
  clone.userData = { ...src.userData, video: src.userData.video, sound: null, name: `${src.userData.name} copy` };
  clone.position.x += 0.18;
  clone.position.z += 0.04;
  workspace.add(clone);
  selectScreen(clone);
  haptic(12);
}

function deleteSelected() {
  const src = state.selected;
  if (!src) return;
  workspace.remove(src);
  disposeScreen(src);
  selectScreen(null);
  setStatus(screens().length ? `${screens().length} anchored` : "Ready");
}

function resetSpace() {
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  camera.getWorldDirection(camDir);
  const items = screens();
  if (!items.length) {
    showBanner("No screens to recenter", 1800);
    return;
  }
  const centroid = new THREE.Vector3();
  items.forEach((s) => centroid.add(s.position));
  centroid.multiplyScalar(1 / items.length);
  const target = camPos.clone().addScaledVector(camDir, 1.4);
  target.y = centroid.y;
  const delta = target.sub(centroid);
  items.forEach((s) => s.position.add(delta));
  haptic(20);
  showBanner("Workspace recentered to your stance", 2000);
}

function exportLayout() {
  const data = serializeWorkspace(screens());
  downloadJson(`spatial-layout-${Date.now()}.json`, data);
  showBanner("Layout exported. Media files stay on-device and must be relinked on import.", 3600);
}

async function importLayout(file) {
  try {
    const data = await readLayoutFile(file);
    data.screens.forEach((meta) => {
      const screen = createPlaceholderScreen(meta);
      screen.position.fromArray(meta.position || [0, 1.2, -1.2]);
      if (meta.quaternion) screen.quaternion.fromArray(meta.quaternion);
      if (meta.scale) screen.scale.fromArray(meta.scale);
      workspace.add(screen);
    });
    setStatus(`${screens().length} anchored`);
    showBanner("Layout restored as placeholders. Select a screen and tap Relink file.", 4200);
  } catch (err) {
    showBanner(err.message || "Could not read layout", 2800);
  }
}

async function relinkSelected(file) {
  const target = state.selected;
  if (!target) return;
  const kind = file.type.startsWith("video") ? "video" : "image";
  const url = URL.createObjectURL(file);
  try {
    const fresh =
      kind === "video"
        ? await createVideoScreen(file, url, listener)
        : await createImageScreen(file, url);
    fresh.position.copy(target.position);
    fresh.quaternion.copy(target.quaternion);
    fresh.scale.copy(target.scale);
    workspace.add(fresh);
    workspace.remove(target);
    disposeScreen(target);
    selectScreen(fresh);
    if (kind === "video") fresh.userData.video.play().catch(() => {});
  } catch (err) {
    URL.revokeObjectURL(url);
    showBanner(err.message || "Relink failed", 2800);
  }
}

function onEmptyTap() {
  selectScreen(null);
}

attachGestures({
  renderer,
  camera,
  workspace,
  getScreens: screens,
  onSelect: selectScreen,
  onEmptyTap,
  snapEnabled: () => state.snap,
});

function enterPreview() {
  state.mode = "preview";
  document.body.classList.add("preview-on");
  previewRig.visible = true;
  camera.position.set(0, 1.5, 3.2);
  if (!state.previewControls) {
    state.previewControls = new OrbitControls(camera, renderer.domElement);
    state.previewControls.target.set(0, 1.2, 0);
    state.previewControls.enableDamping = true;
  }
  state.previewControls.enabled = true;
  setStatus("Desktop preview");
  ui.hint.textContent = "Preview mode — enable AR on a compatible phone for world locking.";
}

function onSessionStart() {
  state.mode = "ar";
  document.body.classList.add("session-on");
  previewRig.visible = false;
  if (state.previewControls) state.previewControls.enabled = false;
  setStatus("Scanning surfaces");
  hideBanner();
  ui.hint.textContent = "Pan slowly until the reticle locks onto a surface.";
}

function onSessionEnd() {
  state.mode = "idle";
  document.body.classList.remove("session-on");
  state.hitTestSource = null;
  state.hitTestSourceRequested = false;
  reticle.visible = false;
  previewRig.visible = true;
  setStatus("Session ended");
}

const sessionInit = {
  requiredFeatures: ["hit-test"],
  optionalFeatures: ["dom-overlay", "light-estimation", "anchors", "plane-detection"],
  domOverlay: { root: ui.overlay },
};

const arButton = ARButton.createButton(renderer, sessionInit);
ui.arMount.appendChild(arButton);

if (!navigator.xr) {
  const fallback = document.createElement("button");
  fallback.className = "ghost-btn";
  fallback.textContent = "WebXR not available in this browser";
  fallback.disabled = true;
  ui.arMount.appendChild(fallback);
}

renderer.xr.addEventListener("sessionstart", onSessionStart);
renderer.xr.addEventListener("sessionend", onSessionEnd);

ui.preview.addEventListener("click", enterPreview);
ui.snap.addEventListener("click", () => {
  state.snap = !state.snap;
  ui.snap.setAttribute("aria-pressed", String(state.snap));
  haptic(8);
});
ui.reset.addEventListener("click", resetSpace);
ui.exportBtn.addEventListener("click", exportLayout);
ui.importBtn.addEventListener("click", () => ui.fileJson.click());
ui.addImage.addEventListener("click", () => {
  state.pendingKind = "image";
  ui.fileImage.click();
});
ui.addVideo.addEventListener("click", () => {
  state.pendingKind = "video";
  ui.fileVideo.click();
});
ui.fileImage.addEventListener("change", () => {
  const file = ui.fileImage.files?.[0];
  ui.fileImage.value = "";
  if (file) spawnFromFile(file, "image");
});
ui.fileVideo.addEventListener("change", () => {
  const file = ui.fileVideo.files?.[0];
  ui.fileVideo.value = "";
  if (file) spawnFromFile(file, "video");
});
ui.fileJson.addEventListener("change", () => {
  const file = ui.fileJson.files?.[0];
  ui.fileJson.value = "";
  if (file) importLayout(file);
});
ui.fileRelink.addEventListener("change", () => {
  const file = ui.fileRelink.files?.[0];
  ui.fileRelink.value = "";
  if (file) relinkSelected(file);
});
ui.dup.addEventListener("click", duplicateSelected);
ui.del.addEventListener("click", deleteSelected);
ui.relink.addEventListener("click", () => ui.fileRelink.click());
ui.deselect.addEventListener("click", () => selectScreen(null));
ui.play.addEventListener("click", () => {
  const video = state.selected?.userData.video;
  if (!video) return;
  if (video.paused) video.play().catch(() => showBanner("Tap again to start audio playback", 2200));
  else video.pause();
  ui.play.textContent = video.paused ? "Play" : "Pause";
});
ui.loop.addEventListener("click", () => {
  const video = state.selected?.userData.video;
  if (!video) return;
  video.loop = !video.loop;
  ui.loop.style.opacity = video.loop ? "1" : "0.55";
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

function requestHitTest(session) {
  if (state.hitTestSourceRequested) return;
  state.hitTestSourceRequested = true;
  session.requestReferenceSpace("viewer").then((ref) => {
    session.requestHitTestSource({ space: ref }).then((source) => {
      state.hitTestSource = source;
    }).catch(() => {
      showBanner("Hit-test unavailable on this device", 4000);
    });
  });
  session.addEventListener("end", () => {
    state.hitTestSourceRequested = false;
    state.hitTestSource = null;
  });
}

function animate(time, frame) {
  const dt = clock.getDelta();
  if (state.previewControls && state.mode === "preview") state.previewControls.update(dt);

  if (frame) {
    const session = renderer.xr.getSession();
    if (session) requestHitTest(session);
    const refSpace = renderer.xr.getReferenceSpace();
    if (state.hitTestSource && refSpace) {
      const hits = frame.getHitTestResults(state.hitTestSource);
      if (hits.length) {
        const pose = hits[0].getPose(refSpace);
        if (pose) {
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
          state.missFrames = 0;
          if (ui.status.textContent === "Scanning surfaces") setStatus("Surface locked");
          hideBanner();
        }
      } else {
        reticle.visible = false;
        state.missFrames += 1;
        if (state.missFrames === 45) {
          showBanner("Tracking is weak. Pan the device or add more light.");
        }
      }
    }
  }

  const video = state.selected?.userData.video;
  if (video && video.duration) {
    ui.scrub.value = String(Math.round((video.currentTime / video.duration) * 1000));
  }

  adaptiveResolution();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
setStatus("Ready");
