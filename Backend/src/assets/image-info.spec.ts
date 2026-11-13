import { readImageInfo } from './image-info';

// PNG real de 1×1 píxel.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function fakeJpeg(width: number, height: number): Buffer {
  // SOI + APP0 (longitud 16) + SOF0 con el tamaño.
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

function fakeWebpLossless(width: number, height: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(22, 4);
  b.write('WEBP', 8, 'ascii');
  b.write('VP8L', 12, 'ascii');
  b.writeUInt32LE(10, 16);
  b[20] = 0x2f;
  b.writeUInt32LE(((height - 1) << 14) | (width - 1), 21);
  return b;
}

describe('readImageInfo', () => {
  it('lee un PNG', () => {
    expect(readImageInfo(PNG_1X1)).toEqual({ mime: 'image/png', width: 1, height: 1 });
  });

  it('lee un JPEG', () => {
    expect(readImageInfo(fakeJpeg(640, 480))).toEqual({ mime: 'image/jpeg', width: 640, height: 480 });
  });

  it('lee un WebP sin pérdida', () => {
    expect(readImageInfo(fakeWebpLossless(300, 200))).toEqual({ mime: 'image/webp', width: 300, height: 200 });
  });

  it.each([
    ['vacío', Buffer.alloc(0)],
    ['texto', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['GIF', Buffer.from('GIF89a\x01\x00\x01\x00', 'binary')],
    ['PNG truncado', PNG_1X1.subarray(0, 12)],
    ['ejecutable', Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'binary')],
  ])('rechaza %s', (_name, buf) => {
    expect(readImageInfo(buf)).toBeNull();
  });
});
