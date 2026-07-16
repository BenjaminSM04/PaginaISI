import sharp from 'sharp';

export const MAX_IMAGE_DIMENSION = 12_000;
export const MAX_IMAGE_PIXELS = 25_000_000;
export const MAX_ANIMATED_FRAMES = 50;
export const MAX_ANIMATED_TOTAL_PIXELS = 60_000_000;
export const MAX_OPTIMIZED_IMAGE_SIZE = 5 * 1024 * 1024;
export const OUTPUT_IMAGE_DIMENSION = 1_920;

export class UnsafeImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeImageError';
  }
}

export interface OptimizedImage {
  buffer: Buffer;
  mime: 'image/webp';
  extension: '.webp';
  width: number;
  height: number;
  frames: number;
}

/**
 * Decodifica y vuelve a codificar cada imagen antes de publicarla. Además de
 * ahorrar espacio, esto elimina metadatos (EXIF/GPS) y evita servir contenido
 * activo oculto detrás de una extensión de imagen.
 */
export async function optimizeImage(buffer: Buffer, mime: string): Promise<OptimizedImage> {
  const animated = mime === 'image/gif';

  try {
    const input = sharp(buffer, {
      animated,
      failOn: 'warning',
      limitInputPixels: MAX_IMAGE_PIXELS,
    });
    const metadata = await input.metadata();
    const width = metadata.width ?? 0;
    const pageHeight = metadata.pageHeight ?? metadata.height ?? 0;
    const frames = metadata.pages ?? 1;

    if (!width || !pageHeight) {
      throw new UnsafeImageError('No se pudieron determinar las dimensiones de la imagen');
    }
    if (width > MAX_IMAGE_DIMENSION || pageHeight > MAX_IMAGE_DIMENSION) {
      throw new UnsafeImageError(`La imagen supera ${MAX_IMAGE_DIMENSION}px por lado`);
    }
    if (width * pageHeight > MAX_IMAGE_PIXELS) {
      throw new UnsafeImageError('La imagen contiene demasiados píxeles');
    }
    if (frames > MAX_ANIMATED_FRAMES || width * pageHeight * frames > MAX_ANIMATED_TOTAL_PIXELS) {
      throw new UnsafeImageError('La imagen animada tiene demasiados fotogramas o píxeles');
    }

    const { data, info } = await input
      .rotate()
      .resize({
        width: OUTPUT_IMAGE_DIMENSION,
        height: OUTPUT_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80, alphaQuality: 82, effort: 5, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });

    if (data.length > MAX_OPTIMIZED_IMAGE_SIZE) {
      throw new UnsafeImageError('La imagen optimizada continúa siendo demasiado grande');
    }

    return {
      buffer: data,
      mime: 'image/webp',
      extension: '.webp',
      width: info.width,
      height: info.height,
      frames,
    };
  } catch (error) {
    if (error instanceof UnsafeImageError) throw error;
    throw new UnsafeImageError('La imagen está dañada o usa un formato no seguro');
  }
}
