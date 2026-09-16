// Browser-only helpers that turn a raw photo upload into the thumb/display
// variants the gallery backend expects. Never import this from src/index.ts —
// it relies on canvas/ImageBitmap APIs that don't exist in the Workers runtime.

const THUMB_SIZE = 400;
const DISPLAY_MAX_DIMENSION = 1920;
const WEBP_QUALITY = 0.85;

export interface PhotoVariants {
    width: number;
    height: number;
    thumb: Blob;
    display: Blob;
}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image.'))),
            'image/webp',
            WEBP_QUALITY
        );
    });
}

// Center-cropped square thumbnail, scaled to a fixed pixel size.
function cropSquareThumb(bitmap: ImageBitmap): Promise<Blob> {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported in this browser.');
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);
    return canvasToWebp(canvas);
}

// Full-frame image scaled down so its longest side is at most DISPLAY_MAX_DIMENSION.
function scaleToDisplay(bitmap: ImageBitmap): Promise<Blob> {
    const scale = Math.min(1, DISPLAY_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported in this browser.');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvasToWebp(canvas);
}

// createImageBitmap() applies EXIF orientation automatically, so the resulting
// canvases (and the reported width/height) are already upright.
export async function buildPhotoVariants(file: File): Promise<PhotoVariants> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
        const [thumb, display] = await Promise.all([cropSquareThumb(bitmap), scaleToDisplay(bitmap)]);
        return { width: bitmap.width, height: bitmap.height, thumb, display };
    } finally {
        bitmap.close();
    }
}
