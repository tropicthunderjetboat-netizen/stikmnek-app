/** Crop helpers (used with react-easy-crop). */

export type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (e) => reject(e));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });
}

/**
 * Returns a JPEG data URL of the cropped region.
 * Pass matching width/height for square logos, or portrait (e.g. 1080×2340) for feed covers.
 */
export async function getCroppedImageDataUrl(
  imageSrc: string,
  pixelCrop: PixelCrop,
  outputWidth = 800,
  outputHeight = outputWidth,
): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  canvas.width = Math.max(1, Math.round(outputWidth));
  canvas.height = Math.max(1, Math.round(outputHeight));

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], fileName, { type: 'image/jpeg' });
}

export async function getImageNaturalSize(
  src: string,
): Promise<{ width: number; height: number }> {
  const image = await createImage(src);
  return { width: image.naturalWidth, height: image.naturalHeight };
}

export function isLandscapeSize(width: number, height: number): boolean {
  return width > height;
}

/** Encode a landscape crop at 1920px wide, keeping the cropped aspect. */
export function landscapeOutputSize(
  cropWidth: number,
  cropHeight: number,
): { width: number; height: number } {
  const width = 1920;
  const height = Math.max(1, Math.round((cropHeight / Math.max(1, cropWidth)) * width));
  return { width, height };
}

/**
 * Phone-style vertical for the tourist swipe feed.
 * 9:16 is shorter than modern phones (~9:19.5) and left letterboxing on the feed.
 */
export const PORTRAIT_ASPECT = 9 / 19.5;
export const PORTRAIT_OUTPUT_WIDTH = 1080;
export const PORTRAIT_OUTPUT_HEIGHT = 2340;
