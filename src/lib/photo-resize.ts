// Browser-only helpers that turn a raw photo upload into the thumb/display
// variants the gallery backend expects. Never import this from src/index.ts —
// it relies on canvas/ImageBitmap APIs that don't exist in the Workers runtime.

const THUMB_SIZE = 400;
const DISPLAY_MAX_DIMENSION = 1920;
const ENCODE_QUALITY = 0.85;

export interface PhotoVariants {
    width: number;
    height: number;
    thumb: Blob;
    thumbType: string;
    display: Blob;
    displayType: string;
}

function encodeCanvasAs(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, type, ENCODE_QUALITY));
}

// Browsers unreliably honor 'image/webp' in canvas.toBlob (Safari silently
// falls back to an oversized PNG), so we always encode variants as JPEG.
async function encodeCanvas(canvas: HTMLCanvasElement): Promise<{ blob: Blob; mimeType: string }> {
    const jpeg = await encodeCanvasAs(canvas, 'image/jpeg');
    if (!jpeg) throw new Error('Could not encode image.');
    return { blob: jpeg, mimeType: 'image/jpeg' };
}

// Center-cropped square thumbnail, scaled to a fixed pixel size.
function cropSquareThumb(bitmap: ImageBitmap): Promise<{ blob: Blob; mimeType: string }> {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported in this browser.');
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);
    return encodeCanvas(canvas);
}

// Full-frame image scaled down so its longest side is at most DISPLAY_MAX_DIMENSION.
function scaleToDisplay(bitmap: ImageBitmap): Promise<{ blob: Blob; mimeType: string }> {
    const scale = Math.min(1, DISPLAY_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported in this browser.');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return encodeCanvas(canvas);
}

// createImageBitmap() applies EXIF orientation automatically, so the resulting
// canvases (and the reported width/height) are already upright.
export async function buildPhotoVariants(file: File): Promise<PhotoVariants> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
        const [thumb, display] = await Promise.all([cropSquareThumb(bitmap), scaleToDisplay(bitmap)]);
        return {
            width: bitmap.width,
            height: bitmap.height,
            thumb: thumb.blob,
            thumbType: thumb.mimeType,
            display: display.blob,
            displayType: display.mimeType,
        };
    } finally {
        bitmap.close();
    }
}
