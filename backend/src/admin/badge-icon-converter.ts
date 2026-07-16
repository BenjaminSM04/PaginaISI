import sharp from 'sharp';

export const BADGE_ICON_KEYS = [
  'award',
  'rocket',
  'file-text',
  'message-circle',
  'graduation-cap',
  'bug',
  'microscope',
  'code',
  'users',
  'trophy',
  'check-circle',
] as const;

export const MAX_BADGE_SOURCE_SIZE = 512 * 1024;
export const MAX_BADGE_SOURCE_DIMENSION = 1_024;
export const MAX_BADGE_SOURCE_PIXELS = 1_048_576;
export const MAX_BADGE_ICON_LENGTH = 64 * 1024;
export const BADGE_ICON_DATA_PREFIX = 'data:image/svg+xml;base64,';

const OUTPUT_SIZE = 24;
const ALLOWED_MIME_FORMAT: Readonly<Record<string, 'png' | 'jpeg' | 'webp'>> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};

export class UnsafeBadgeIconError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeBadgeIconError';
  }
}

function hasValidRasterSignature(buffer: Buffer, mime: string): boolean {
  if (!buffer.length) return false;
  if (mime === 'image/png') {
    return buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mime === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

function quantizeChannel(value: number): number {
  return Math.min(255, Math.round(value / 51) * 51);
}

function hexadecimal(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function opacityFor(alpha: number): string {
  if (alpha < 96) return '0.25';
  if (alpha < 160) return '0.5';
  if (alpha < 224) return '0.75';
  return '1';
}

function buildGeneratedSvg(pixels: Buffer): string {
  const paths = new Map<string, string[]>();

  for (let y = 0; y < OUTPUT_SIZE; y += 1) {
    let x = 0;
    while (x < OUTPUT_SIZE) {
      const offset = (y * OUTPUT_SIZE + x) * 4;
      const alpha = pixels[offset + 3];
      if (alpha < 32) {
        x += 1;
        continue;
      }

      const red = quantizeChannel(pixels[offset]);
      const green = quantizeChannel(pixels[offset + 1]);
      const blue = quantizeChannel(pixels[offset + 2]);
      const opacity = opacityFor(alpha);
      const key = `#${hexadecimal(red)}${hexadecimal(green)}${hexadecimal(blue)}|${opacity}`;
      const start = x;
      x += 1;

      while (x < OUTPUT_SIZE) {
        const nextOffset = (y * OUTPUT_SIZE + x) * 4;
        if (pixels[nextOffset + 3] < 32) break;
        const nextKey = `#${hexadecimal(quantizeChannel(pixels[nextOffset]))}${hexadecimal(quantizeChannel(pixels[nextOffset + 1]))}${hexadecimal(quantizeChannel(pixels[nextOffset + 2]))}|${opacityFor(pixels[nextOffset + 3])}`;
        if (nextKey !== key) break;
        x += 1;
      }

      const commands = paths.get(key) ?? [];
      commands.push(`M${start} ${y}h${x - start}v1H${start}z`);
      paths.set(key, commands);
    }
  }

  if (paths.size === 0) throw new UnsafeBadgeIconError('La imagen no contiene píxeles visibles');

  const pathMarkup = [...paths.entries()].map(([key, commands]) => {
    const [fill, opacity] = key.split('|');
    const opacityAttribute = opacity === '1' ? '' : ` fill-opacity="${opacity}"`;
    return `<path fill="${fill}"${opacityAttribute} d="${commands.join('')}"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges" data-isi-badge="1">${pathMarkup}</svg>`;
}

/**
 * Convierte un raster pequeño en un SVG de rutas generado por el servidor.
 * Nunca copia metadatos, XML ni texto aportado por el archivo original.
 */
export async function convertRasterToBadgeIcon(buffer: Buffer, mime: string) {
  if (!ALLOWED_MIME_FORMAT[mime]) {
    throw new UnsafeBadgeIconError('Solo se aceptan imágenes PNG, JPEG o WebP');
  }
  if (!buffer?.length || buffer.length > MAX_BADGE_SOURCE_SIZE) {
    throw new UnsafeBadgeIconError('La imagen está vacía o supera 512 KB');
  }
  if (!hasValidRasterSignature(buffer, mime)) {
    throw new UnsafeBadgeIconError('El contenido no coincide con el tipo de imagen declarado');
  }

  try {
    const input = sharp(buffer, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: MAX_BADGE_SOURCE_PIXELS,
    });
    const metadata = await input.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const pages = metadata.pages ?? 1;

    if (metadata.format !== ALLOWED_MIME_FORMAT[mime]) {
      throw new UnsafeBadgeIconError('El contenido no coincide con el tipo de imagen declarado');
    }
    if (!width || !height) throw new UnsafeBadgeIconError('No se pudieron determinar las dimensiones de la imagen');
    if (pages !== 1) throw new UnsafeBadgeIconError('No se aceptan imágenes animadas');
    if (width > MAX_BADGE_SOURCE_DIMENSION || height > MAX_BADGE_SOURCE_DIMENSION || width * height > MAX_BADGE_SOURCE_PIXELS) {
      throw new UnsafeBadgeIconError('La imagen supera 1024 px por lado o un millón de píxeles');
    }

    const pixels = await input
      .rotate()
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const svg = buildGeneratedSvg(pixels);
    const icon = `${BADGE_ICON_DATA_PREFIX}${Buffer.from(svg, 'utf8').toString('base64')}`;

    if (!isSafeGeneratedBadgeIcon(icon)) {
      throw new UnsafeBadgeIconError('No se pudo generar un icono SVG seguro');
    }

    return {
      icon,
      width: 48,
      height: 48,
      sourceWidth: width,
      sourceHeight: height,
      sizeBytes: Buffer.byteLength(svg),
    };
  } catch (error) {
    if (error instanceof UnsafeBadgeIconError) throw error;
    throw new UnsafeBadgeIconError('La imagen está dañada o usa un formato no seguro');
  }
}

export function isKnownBadgeIcon(icon: string): icon is typeof BADGE_ICON_KEYS[number] {
  return (BADGE_ICON_KEYS as readonly string[]).includes(icon);
}

/** Valida la gramática completa del SVG generado antes de persistirlo. */
export function isSafeGeneratedBadgeIcon(icon: string): boolean {
  if (!icon.startsWith(BADGE_ICON_DATA_PREFIX) || icon.length > MAX_BADGE_ICON_LENGTH) return false;
  const encoded = icon.slice(BADGE_ICON_DATA_PREFIX.length);
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;

  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.toString('base64') !== encoded) return false;
  const svg = decoded.toString('utf8');
  const start = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges" data-isi-badge="1">';
  if (!svg.startsWith(start) || !svg.endsWith('</svg>')) return false;

  const body = svg.slice(start.length, -6);
  if (!body) return false;

  const pathPattern = /<path fill="#[0-9A-F]{6}"(?: fill-opacity="(?:0\.25|0\.5|0\.75)")? d="([^"]+)"\/>/g;
  let bodyCursor = 0;
  let paths = 0;
  let commands = 0;
  let pathMatch: RegExpExecArray | null;

  while ((pathMatch = pathPattern.exec(body)) !== null) {
    if (pathMatch.index !== bodyCursor) return false;
    paths += 1;
    if (paths > OUTPUT_SIZE * OUTPUT_SIZE) return false;

    const data = pathMatch[1];
    const commandPattern = /M(\d{1,2}) (\d{1,2})h(\d{1,2})v1H(\d{1,2})z/g;
    let commandCursor = 0;
    let commandMatch: RegExpExecArray | null;
    while ((commandMatch = commandPattern.exec(data)) !== null) {
      if (commandMatch.index !== commandCursor) return false;
      const x = Number(commandMatch[1]);
      const y = Number(commandMatch[2]);
      const run = Number(commandMatch[3]);
      const end = Number(commandMatch[4]);
      if (x >= OUTPUT_SIZE || y >= OUTPUT_SIZE || run < 1 || x + run > OUTPUT_SIZE || end !== x) return false;
      commands += 1;
      if (commands > OUTPUT_SIZE * OUTPUT_SIZE) return false;
      commandCursor = commandPattern.lastIndex;
    }
    if (commandCursor !== data.length || commandCursor === 0) return false;
    bodyCursor = pathPattern.lastIndex;
  }

  return paths > 0 && bodyCursor === body.length;
}

export function isSafeBadgeIcon(icon: string): boolean {
  return isKnownBadgeIcon(icon) || isSafeGeneratedBadgeIcon(icon);
}
