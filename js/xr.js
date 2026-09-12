export function xrSupportText() {
  const bits = [];
  bits.push(window.isSecureContext ? "HTTPS ok" : "NOT HTTPS");
  bits.push(navigator.xr ? "WebXR present" : "no navigator.xr");
  bits.push(/Android/i.test(navigator.userAgent) ? "Android" : navigator.platform || "device");
  bits.push(navigator.userAgent.match(/Chrome\/(\d+)/)?.[0] || "browser?");
  return bits.join(" · ");
}

export async function probeAR() {
  const result = {
    secure: window.isSecureContext,
    hasXR: Boolean(navigator.xr),
    immersiveAR: false,
    error: null,
  };
  if (!result.secure) result.error = "This page is not HTTPS. Open the GitHub Pages URL in Chrome.";
  if (!result.hasXR) result.error = "This browser has no WebXR. Use Chrome on Android.";
  if (result.hasXR) {
    try {
      result.immersiveAR = await navigator.xr.isSessionSupported("immersive-ar");
    } catch (err) {
      result.error = String(err.message || err);
    }
  }
  if (result.hasXR && !result.immersiveAR && !result.error) {
    result.error = "immersive-ar is not supported. Install Google Play Services for AR and use Chrome.";
  }
  return result;
}

export async function requestARSession(overlayRoot) {
  const attempts = [
    {
      requiredFeatures: ["hit-test", "dom-overlay"],
      optionalFeatures: ["local-floor", "anchors", "plane-detection", "light-estimation"],
      domOverlay: { root: overlayRoot },
    },
    {
      requiredFeatures: ["hit-test", "dom-overlay"],
      optionalFeatures: ["local-floor"],
      domOverlay: { root: overlayRoot },
    },
    {
      requiredFeatures: ["dom-overlay"],
      optionalFeatures: ["hit-test", "local-floor"],
      domOverlay: { root: overlayRoot },
    },
    { requiredFeatures: ["hit-test"] },
    { optionalFeatures: ["hit-test", "dom-overlay"], domOverlay: { root: overlayRoot } },
    {},
  ];

  let lastError = null;
  for (const init of attempts) {
    try {
      const session = await navigator.xr.requestSession("immersive-ar", init);
      return { session, init };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Could not start immersive-ar");
}

export async function makeHitTestSource(session) {
  try {
    const viewerSpace = await session.requestReferenceSpace("viewer");
    if (!session.requestHitTestSource) return null;
    return await session.requestHitTestSource({ space: viewerSpace });
  } catch {
    return null;
  }
}
