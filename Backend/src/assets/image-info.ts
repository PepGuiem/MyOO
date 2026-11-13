/**
 * Detecta el formato real de una imagen por sus primeros bytes ("firma") y lee
 * su tamaño en píxeles, sin librerías externas.
 *
 * No nos fiamos del `Content-Type` ni de la extensión que manda el cliente:
 * un archivo .png puede ser cualquier cosa. Solo aceptamos PNG, JPEG y WebP.
 */

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImageInfo {
  mime: ImageMime;
  width: number;
  height: number;
}

function png(b: Buffer): ImageInfo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !sig.every((v, i) => b[i] === v)) return null;
  // El primer bloque debe ser IHDR: ancho y alto en los bytes 16-23.
  if (b.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { mime: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function jpeg(b: Buffer): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    // Relleno entre marcadores.
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // Marcadores sin longitud.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    if (len < 2) return null;
    // SOF0..SOF15 (salvo DHT=C4, JPG=C8, DAC=CC) llevan el tamaño.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { mime: 'image/jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function webp(b: Buffer): ImageInfo | null {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    // Fotograma clave: firma 9D 01 2A y tamaño de 14 bits.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { mime: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b.readUInt32LE(21);
    return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return { mime: 'image/webp', width: w, height: h };
  }
  return null;
}

/** Devuelve el formato y tamaño, o null si no es una imagen admitida. */
export function readImageInfo(buffer: Buffer): ImageInfo | null {
  const info = png(buffer) ?? jpeg(buffer) ?? webp(buffer);
  if (!info || info.width < 1 || info.height < 1) return null;
  return info;
}
