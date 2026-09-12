import * as THREE from "three";

let seq = 1;

function frameMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x111318,
    metalness: 0.35,
    roughness: 0.4,
  });
}

function makeGizmo(w, h) {
  const group = new THREE.Group();
  group.name = "gizmo";
  const box = new THREE.BoxHelper(new THREE.Mesh(new THREE.PlaneGeometry(w, h)), 0x7cd4ff);
  box.material.depthTest = false;
  group.add(box);

  const corners = [
    [-w / 2, h / 2],
    [w / 2, h / 2],
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
  ];
  const dotGeo = new THREE.SphereGeometry(0.012, 10, 10);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xc9a6ff });
  for (const [x, y] of corners) {
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(x, y, 0.01);
    group.add(dot);
  }
  group.visible = false;
  return group;
}

export function createImageScreen(file, objectUrl) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      objectUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const img = texture.image;
        const aspect = (img.width || 16) / (img.height || 9);
        resolve(buildScreen({
          type: "image",
          name: file?.name || `Image ${seq}`,
          fileName: file?.name || "",
          mime: file?.type || "image/*",
          texture,
          aspect,
          objectUrl,
        }));
      },
      undefined,
      () => reject(new Error("Could not decode image"))
    );
  });
}

export function createVideoScreen(file, objectUrl, listener) {
  const video = document.createElement("video");
  video.src = objectUrl;
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.loop = true;
  video.preload = "metadata";
  video.muted = false;
  video.setAttribute("playsinline", "");

  return new Promise((resolve, reject) => {
    const onReady = () => {
      video.removeEventListener("loadedmetadata", onReady);
      const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      const screen = buildScreen({
        type: "video",
        name: file?.name || `Video ${seq}`,
        fileName: file?.name || "",
        mime: file?.type || "video/*",
        texture,
        aspect,
        objectUrl,
        video,
      });
      if (listener) {
        const sound = new THREE.PositionalAudio(listener);
        sound.setMediaElementSource(video);
        sound.setRefDistance(1.4);
        sound.setRolloffFactor(1.25);
        sound.setDistanceModel("inverse");
        screen.add(sound);
        screen.userData.sound = sound;
      }
      resolve(screen);
    };
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("error", () => reject(new Error("Could not decode video")));
    video.load();
  });
}

export function createPlaceholderScreen(meta) {
  const aspect = meta.aspect || 16 / 9;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.round(1024 / aspect);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#161822";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#7cd4ff";
  ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
  ctx.fillStyle = "#f4f6fb";
  ctx.font = "48px sans-serif";
  ctx.fillText("Relink media", 48, canvas.height / 2 - 12);
  ctx.fillStyle = "#9aa3b5";
  ctx.font = "32px sans-serif";
  ctx.fillText(meta.fileName || meta.name || "missing file", 48, canvas.height / 2 + 36);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return buildScreen({
    type: meta.type || "image",
    name: meta.name || `Screen ${seq}`,
    fileName: meta.fileName || "",
    mime: meta.mime || "",
    texture,
    aspect,
    objectUrl: null,
    placeholder: true,
  });
}

function buildScreen({ type, name, fileName, mime, texture, aspect, objectUrl, video = null, placeholder = false }) {
  const height = 0.42;
  const width = height * aspect;
  const group = new THREE.Group();
  group.name = `screen-${seq++}`;

  const geo = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const plane = new THREE.Mesh(geo, mat);
  plane.name = "media";
  plane.position.z = 0.012;

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.03, height + 0.03, 0.02),
    frameMaterial()
  );
  frame.position.z = 0;

  const gizmo = makeGizmo(width + 0.04, height + 0.04);

  group.add(frame, plane, gizmo);
  group.userData = {
    kind: "mediaScreen",
    type,
    name,
    fileName,
    mime,
    aspect,
    objectUrl,
    video,
    placeholder,
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    selected: false,
  };
  return group;
}

export function setSelected(screen, selected) {
  screen.userData.selected = selected;
  const gizmo = screen.getObjectByName("gizmo");
  if (gizmo) gizmo.visible = selected;
}

export function applyUniformScale(screen, factor) {
  const next = THREE.MathUtils.clamp(screen.scale.x * factor, 0.25, 8);
  screen.scale.setScalar(next);
}

export function disposeScreen(screen) {
  const { objectUrl, video, sound } = screen.userData;
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  if (sound) {
    try { sound.disconnect(); } catch { /* ignore */ }
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  screen.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
  });
}
