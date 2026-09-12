# WebAR Spatial Workspace

Fully client-side, mobile-first WebAR workspace. Scan a room, lock virtual media screens to tables and walls, then drag, pinch, and twist local videos and images in physical space.

No server, no accounts, no cloud storage. Files never leave the device.

**Live site (after Pages is enabled):** https://tbenitz.github.io/webar-spatial-workspace/

**Repository:** https://github.com/tbenitz/webar-spatial-workspace

## What it does

- Starts an immersive WebXR AR session with a live surface reticle (hit-test)
- Pins screens to vertical walls or stands them on floors and tables
- Loads images (`jpg`, `png`, `webp`) and videos (`mp4`, `webm`) through the native file picker
- Renders video on 3D planes with play / pause / loop / scrub
- Uses positional audio so volume falls off with distance
- Single-finger drag, pinch-to-scale, two-finger twist
- Optional axis-lock snap (90° rotation steps, axis-constrained move)
- One-tap **Reset Space** recenters the layout on your current stance
- Select, duplicate, delete, and relink media
- Export / import the layout as JSON (transforms + filenames; binary media stays local)

## Run it

### On a phone (real AR)

1. Open the GitHub Pages URL in **Chrome for Android** (WebXR AR).
2. Tap **START AR** and allow the camera.
3. Pan until the cyan reticle locks onto a surface.
4. Tap **Add Image** or **Add Video**, then place and manipulate screens.

HTTPS is required. GitHub Pages already serves HTTPS.

### On a desktop

Use **Desktop preview** to orbit a stand-in room and test spawning / transforms. World-locked AR still needs a WebXR AR browser.

## Enable GitHub Pages

The repo includes `.github/workflows/pages.yml`. One-time setup:

1. Repo **Settings → Pages**
2. **Source:** GitHub Actions
3. Re-run the **Deploy GitHub Pages** workflow if it has not published yet

Alternatively set Pages source to **Deploy from a branch → `main` / root**.

## Project layout

```
index.html
css/styles.css
js/app.js          session, renderer, UI wiring
js/screens.js      image / video / placeholder meshes
js/gestures.js     raycast select, drag, pinch, twist
js/layout.js       JSON snapshot helpers
js/ui.js           overlay helpers
assets/favicon.svg
```

Three.js is loaded from jsDelivr via an import map. There is no build step.

## Browser notes

| Platform | Expectation |
| --- | --- |
| Android Chrome / Samsung Internet | Full WebXR hit-test AR |
| Desktop Chrome / Edge / Firefox | Preview mode only |
| iOS Safari | WebXR immersive AR is still limited; preview works |

Tracking quality depends on light and textured surfaces. A banner appears when hit-test drops out.

## Layout JSON

Export writes screen pose, scale, type, and original filename. Object URLs are not portable, so import restores **placeholders**. Select a screen and tap **Relink file** to attach the original media again.

## License

MIT
