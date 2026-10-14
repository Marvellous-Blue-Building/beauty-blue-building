/**
 * Crops a captured scan image to the head region the user aligned to on the
 * scan screen — the guide oval drawn over the live preview (see
 * components/scan/NativeSkinScanEngine.tsx: 66% x 72%, centered in a 3:4
 * container that the camera feed fills with CSS `object-cover`).
 *
 * Runs after analysis, so the CV service still sees the full, uncropped frame.
 * Returns a JPEG data URL of just the head.
 */
const SCAN_CONTAINER_ASPECT = 3 / 4;
const OVAL_WIDTH = 0.66;
const OVAL_HEIGHT = 0.72;

export async function cropFaceDataUrl(src: string): Promise<string> {
  const img = await loadImage(src);
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  if (!sw || !sh) return src;

  const srcAspect = sw / sh;

  // Map a container-normalized point (0..1 within the 3:4 preview) back to a
  // source-normalized point, inverting the `object-cover` fit of the video.
  let mapX: (x: number) => number;
  let mapY: (y: number) => number;
  if (srcAspect >= SCAN_CONTAINER_ASPECT) {
    // Wider than the container: sides are cropped away.
    const visible = SCAN_CONTAINER_ASPECT / srcAspect;
    mapX = (x) => 0.5 + (x - 0.5) * visible;
    mapY = (y) => y;
  } else {
    // Taller than the container: top/bottom are cropped away.
    const visible = srcAspect / SCAN_CONTAINER_ASPECT;
    mapX = (x) => x;
    mapY = (y) => 0.5 + (y - 0.5) * visible;
  }

  const left = 0.5 - OVAL_WIDTH / 2;
  const right = 0.5 + OVAL_WIDTH / 2;
  const top = 0.5 - OVAL_HEIGHT / 2;
  const bottom = 0.5 + OVAL_HEIGHT / 2;

  const sx = mapX(left) * sw;
  const sy = mapY(top) * sh;
  const cropW = (mapX(right) - mapX(left)) * sw;
  const cropH = (mapY(bottom) - mapY(top)) * sh;
  if (cropW < 1 || cropH < 1) return src;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cropW);
  canvas.height = Math.round(cropH);
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;

  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}
