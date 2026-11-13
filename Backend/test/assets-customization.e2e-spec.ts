import { bearer, createTestApp, registerUser, TestContext } from './utils';

// PNG real de 1×1 píxel.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('Imágenes y personalización de prendas (e2e)', () => {
  let ctx: TestContext;
  let alice: { token: string; userId: string };
  let bob: { token: string; userId: string };
  let typeIds: Record<string, string>;
  let wardrobeId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    alice = await registerUser(ctx, 'alice');
    bob = await registerUser(ctx, 'bob');
    const types = await ctx.prisma.garmentType.findMany();
    typeIds = Object.fromEntries(types.map((t) => [t.code, t.id]));
    const w = await ctx.http().post('/api/wardrobes').set(...bearer(alice.token)).send({ name: 'Principal' }).expect(201);
    wardrobeId = w.body.id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const upload = (token: string, data: Buffer, filename = 'logo.png') =>
    ctx.http().post('/api/assets').set(...bearer(token)).attach('file', data, filename);

  describe('assets', () => {
    let assetId: string;

    it('sube un PNG y lo lista', async () => {
      const res = await upload(alice.token, PNG, '../../malicioso/logo.png').expect(201);
      assetId = res.body.id;
      expect(res.body).toMatchObject({ mimeType: 'image/png', width: 1, height: 1, sizeBytes: PNG.length, name: 'logo.png' });
      expect(res.body.storageKey).toBeUndefined();
      expect(res.body.userId).toBeUndefined();

      const list = await ctx.http().get('/api/assets').set(...bearer(alice.token)).expect(200);
      expect(list.body.map((a: { id: string }) => a.id)).toContain(assetId);
    });

    it('devuelve el contenido solo a su dueño', async () => {
      const res = await ctx.http().get(`/api/assets/${assetId}/content`).set(...bearer(alice.token)).expect(200);
      expect(res.headers['content-type']).toContain('image/png');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.from(res.body as Buffer).equals(PNG)).toBe(true);

      await ctx.http().get(`/api/assets/${assetId}/content`).set(...bearer(bob.token)).expect(404);
      await ctx.http().get(`/api/assets/${assetId}/content`).expect(401);
    });

    it('rechaza archivos que no son imágenes aunque se llamen .png', async () => {
      await upload(alice.token, Buffer.from('<svg onload="alert(1)"></svg>'), 'x.png').expect(422);
      await upload(alice.token, Buffer.from('GIF89a\x01\x00\x01\x00', 'binary'), 'x.gif').expect(422);
    });

    it('rechaza archivos de más de 2 MB', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
      await upload(alice.token, big).expect(413);
    });

    it('400 sin archivo o con campos extra', async () => {
      await ctx.http().post('/api/assets').set(...bearer(alice.token)).expect(400);
      await ctx.http().post('/api/assets').set(...bearer(alice.token)).field('userId', bob.userId).attach('file', PNG, 'a.png').expect(400);
    });

    it('no se puede subir sin autenticación', async () => {
      await ctx.http().post('/api/assets').attach('file', PNG, 'a.png').expect(401);
    });

    it('otro usuario no puede borrarla', async () => {
      await ctx.http().delete(`/api/assets/${assetId}`).set(...bearer(bob.token)).expect(404);
    });

    describe('personalización de prendas', () => {
      const shirt = (customization: unknown) =>
        ctx
          .http()
          .post('/api/wardrobe-items')
          .set(...bearer(alice.token))
          .send({ wardrobeId, garmentTypeId: typeIds.SHIRT, name: 'Camisa', color: '#8FA6C1', customization });

      it('los tipos exponen sus opciones de personalización', async () => {
        const res = await ctx.http().get(`/api/garment-types/${typeIds.SHIRT}`).expect(200);
        expect(res.body.customizationOptions.colors).toContain('buttons');
        expect(res.body.customizationOptions.parts.map((p: { key: string }) => p.key)).toContain('chestPocket');
      });

      it('guarda colores, piezas, opciones y detalles con imagen', async () => {
        const res = await shirt({
          colors: { buttons: '#c9a15a', stitching: '#ffffff' },
          parts: { chestPocket: false, epaulettes: true },
          options: { buttonStyle: 'shank', stitchStyle: 'double' },
          details: [
            { id: 'logo', kind: 'print', position: [0.08, 1.3, 0.14], normal: [0, 0, 1], rotation: 0, size: 0.06, color: '#151517', assetId },
            { id: 'txt', kind: 'embroidery', position: [-0.08, 1.3, 0.14], normal: [0, 0, 1], size: 0.05, color: '#151517', text: 'Hola', font: 'script' },
          ],
        }).expect(201);
        expect(res.body.customization.colors.buttons).toBe('#C9A15A');
        expect(res.body.customization.details).toHaveLength(2);

        const get = await ctx.http().get(`/api/wardrobe-items/${res.body.id}`).set(...bearer(alice.token)).expect(200);
        expect(get.body.customization.parts).toEqual({ chestPocket: false, epaulettes: true });
      });

      it('409 al borrar una imagen que usa una prenda', async () => {
        await ctx.http().delete(`/api/assets/${assetId}`).set(...bearer(alice.token)).expect(409);
      });

      it('rechaza personalizaciones inválidas', async () => {
        await shirt({ colors: { sole: '#000000' } }).expect(400); // una camisa no tiene suela
        await shirt({ evil: true }).expect(400);
        await shirt({ details: [{ id: 'x', kind: 'patch', position: [0, 1, 0], normal: [0, 0, 1], size: 9, color: '#000000' }] }).expect(400);
        await shirt('no es un objeto').expect(400);
      });

      it('no permite usar la imagen de otro usuario', async () => {
        const bobAsset = await upload(bob.token, PNG).expect(201);
        await shirt({
          details: [{ id: 'robo', kind: 'print', position: [0, 1.3, 0.14], normal: [0, 0, 1], size: 0.05, color: '#000000', assetId: bobAsset.body.id }],
        }).expect(400);
      });

      it('al cambiar de tipo se quitan los colores que el tipo nuevo no tiene', async () => {
        const created = await shirt({ colors: { buttons: '#111111', stitching: '#222222' } }).expect(201);
        const res = await ctx
          .http()
          .patch(`/api/wardrobe-items/${created.body.id}`)
          .set(...bearer(alice.token))
          .send({ garmentTypeId: typeIds.SWEATER })
          .expect(200);
        // El jersey tiene botones pero no pespuntes configurables.
        expect(res.body.customization.colors).toEqual({ buttons: '#111111' });
      });

      it('se puede borrar la imagen cuando ya no se usa', async () => {
        const items = await ctx.http().get('/api/wardrobe-items?pageSize=100').set(...bearer(alice.token)).expect(200);
        for (const item of items.body.data as { id: string }[]) {
          await ctx.http().patch(`/api/wardrobe-items/${item.id}`).set(...bearer(alice.token)).send({ customization: {} }).expect(200);
        }
        await ctx.http().delete(`/api/assets/${assetId}`).set(...bearer(alice.token)).expect(204);
        await ctx.http().get(`/api/assets/${assetId}/content`).set(...bearer(alice.token)).expect(404);
      });
    });
  });
});
