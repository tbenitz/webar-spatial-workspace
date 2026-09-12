export const $ = (id) => document.getElementById(id);

export const ui = {
  overlay: $("overlay"),
  landing: $("landing"),
  banner: $("banner"),
  status: $("status-line"),
  hint: $("place-hint"),
  inspector: $("inspector"),
  selName: $("sel-name"),
  videoControls: $("video-controls"),
  play: $("btn-play"),
  loop: $("btn-loop"),
  scrub: $("scrub"),
  snap: $("btn-snap"),
  reset: $("btn-reset"),
  exportBtn: $("btn-export"),
  importBtn: $("btn-import"),
  addImage: $("btn-add-image"),
  addVideo: $("btn-add-video"),
  preview: $("btn-preview"),
  arMount: $("ar-button-mount"),
  fileImage: $("file-image"),
  fileVideo: $("file-video"),
  fileJson: $("file-json"),
  fileRelink: $("file-relink"),
  dup: $("btn-dup"),
  relink: $("btn-relink"),
  del: $("btn-delete"),
  deselect: $("btn-deselect"),
};

export function setStatus(text) {
  ui.status.textContent = text;
}

export function showBanner(text, ms = 0) {
  ui.banner.textContent = text;
  ui.banner.classList.remove("hidden");
  if (ms) {
    window.clearTimeout(showBanner._t);
    showBanner._t = window.setTimeout(hideBanner, ms);
  }
}

export function hideBanner() {
  ui.banner.classList.add("hidden");
}

export function haptic(ms = 12) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
