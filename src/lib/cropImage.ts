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
    // crossOrigin on blob:/data: URLs makes the load fail in some browsers after a few photos.
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      image.setAttribute('crossOrigin', 'anonymous');
    }
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

/**
 * Read pixel size for layout. Do not set crossOrigin — admin storage URLs often
 * fail CORS on a canvas-tainted Image, which made landscape photos look portrait.
 */
export async function getImageNaturalSize(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (width < 2 || height < 2) {
        reject(new Error('Could not read image size'));
        return;
      }
      resolve({ width, height });
    };
    image.onerror = () => reject(new Error('Could not read image size'));
    image.src = src;
  });
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

/** Scale the full image (no crop) for feed upload. */
export async function encodeFullImageDataUrl(src: string, maxWidth = 1920): Promise<string> {
  const image = await createImage(src);
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  if (width > maxWidth) {
    height = Math.max(1, Math.round((maxWidth / width) * height));
    width = maxWidth;
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function sourceToJpegFile(
  src: string,
  fileName: string,
): Promise<{ file: File; preview: string }> {
  const jpegName = fileName.replace(/\.[^.]+$/, '') + '.jpg';
  try {
    const preview = await encodeFullImageDataUrl(src);
    const file = await dataUrlToFile(preview, jpegName);
    return { file, preview };
  } catch {
    if (src.startsWith('data:')) {
      const file = await dataUrlToFile(src, jpegName);
      return { file, preview: src };
    }
    const res = await fetch(src);
    const blob = await res.blob();
    const file = new File([blob], jpegName, { type: blob.type || 'image/jpeg' });
    return { file, preview: src };
  }
}

/**
 * Phone-style vertical for the tourist swipe feed.
 * 9:16 is shorter than modern phones (~9:19.5) and left letterboxing on the feed.
 */
export const PORTRAIT_ASPECT = 9 / 19.5;
export const PORTRAIT_OUTPUT_WIDTH = 1080;
export const PORTRAIT_OUTPUT_HEIGHT = 2340;
