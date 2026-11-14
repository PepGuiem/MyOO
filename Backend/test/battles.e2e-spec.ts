import { bearer, createTestApp, registerUser, TestContext } from './utils';

type U = { token: string; userId: string };

describe('STREETWEAR BATTLES (e2e)', () => {
  let ctx: TestContext;
  let ana: U;
  let leo: U;
  let eva: U;
  let max: U;

  /** Crea un outfit de una prenda y devuelve su id. */
  async function outfitOf(u: U, name: string): Promise<string> {
    const type = await ctx.prisma.garmentType.findUniqueOrThrow({
      where: { code: 'T_SHIRT' },
    });
    const wardrobe = await ctx.prisma.wardrobe.findFirstOrThrow({
      where: { userId: u.userId },
    });
    const item = await ctx
      .http()
      .post('/api/wardrobe-items')
      .set(...bearer(u.token))
      .send({
        wardrobeId: wardrobe.id,
        garmentTypeId: type.id,
        name: `Camiseta ${name}`,
        color: '#111111',
      })
      .expect(201);
    const o = await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(u.token))
      .send({ name, items: [{ wardrobeItemId: item.body.id }] })
      .expect(201);
    return o.body.id as string;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    ana = await registerUser(ctx, 'ana');
    leo = await registerUser(ctx, 'leo');
    eva = await registerUser(ctx, 'eva');
    max = await registerUser(ctx, 'max');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('reto directo: solo lo ven los dos, el retado acepta y empieza la votación de 48 h', async () => {
    const outfitA = await outfitOf(ana, 'Noche');
    const b = await ctx
      .http()
      .post('/api/battles')
      .set(...bearer(ana.token))
      .send({ outfitId: outfitA, opponentId: leo.userId, theme: 'Todo negro' })
      .expect(201);
    expect(b.body).toMatchObject({
      status: 'PENDING',
      isOpen: false,
      theme: 'Todo negro',
      mySide: 'A',
      canCancel: true,
      canAccept: false,
    });
    expect(b.body.outfitA.name).toBe('Noche');
    // Copia sin datos de compra
    expect(JSON.stringify(b.body.outfitA)).not.toContain('purchasePrice');

    // Otra persona no ve un reto directo pendiente
    await ctx
      .http()
      .get(`/api/battles/${b.body.id}`)
      .set(...bearer(eva.token))
      .expect(404);
    // Le llega el aviso al retado
    const n = await ctx.prisma.notification.findFirst({
      where: { userId: leo.userId, type: 'BATTLE_CHALLENGE' },
    });
    expect(n?.link).toBe(`/batallas/${b.body.id}`);
    const inbox = await ctx
      .http()
      .get('/api/battles?tab=challenges')
      .set(...bearer(leo.token))
      .expect(200);
    expect(inbox.body.data.map((x: { id: string }) => x.id)).toEqual([
      b.body.id,
    ]);

    // No se puede aceptar con un outfit ajeno
    await ctx
      .http()
      .post(`/api/battles/${b.body.id}/accept`)
      .set(...bearer(leo.token))
      .send({ outfitId: outfitA })
      .expect(404);
    const outfitL = await outfitOf(leo, 'Club');
    const acc = await ctx
      .http()
      .post(`/api/battles/${b.body.id}/accept`)
      .set(...bearer(leo.token))
      .send({ outfitId: outfitL })
      .expect(201);
    expect(acc.body).toMatchObject({
      status: 'ACTIVE',
      mySide: 'B',
      canVote: false,
      voteBlock: 'own_battle',
    });
    const hours =
      (new Date(acc.body.endsAt).getTime() -
        new Date(acc.body.startedAt).getTime()) /
      3_600_000;
    expect(hours).toBe(48);
    // Ya no se puede aceptar dos veces
    await ctx
      .http()
      .post(`/api/battles/${b.body.id}/accept`)
      .set(...bearer(leo.token))
      .send({ outfitId: outfitL })
      .expect(409);
  });

  it('un voto por persona, nunca en tu batalla, y los votos se ocultan hasta votar', async () => {
    const live = await ctx
      .http()
      .get('/api/battles?tab=live')
      .set(...bearer(eva.token))
      .expect(200);
    const id = live.body.data[0].id as string;
    expect(live.body.data[0].votes).toBe(null);
    expect(live.body.data[0].canVote).toBe(true);

    await ctx
      .http()
      .post(`/api/battles/${id}/vote`)
      .set(...bearer(ana.token))
      .send({ side: 'A' })
      .expect(403);
    await ctx
      .http()
      .post(`/api/battles/${id}/vote`)
      .set(...bearer(eva.token))
      .send({ side: 'C' })
      .expect(400);

    // Dos votos a la vez de la misma persona: solo cuenta uno
    const [r1, r2] = await Promise.all([
      ctx
        .http()
        .post(`/api/battles/${id}/vote`)
        .set(...bearer(eva.token))
        .send({ side: 'A' }),
      ctx
        .http()
        .post(`/api/battles/${id}/vote`)
        .set(...bearer(eva.token))
        .send({ side: 'B' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const after = await ctx
      .http()
      .get(`/api/battles/${id}`)
      .set(...bearer(eva.token))
      .expect(200);
    expect(after.body.totalVotes).toBe(1);
    expect(after.body.votes).not.toBe(null);
    expect(after.body.voteBlock).toBe('already_voted');

    await ctx
      .http()
      .post(`/api/battles/${id}/vote`)
      .set(...bearer(max.token))
      .send({ side: 'A' })
      .expect(201);
    const row = await ctx.prisma.battle.findUniqueOrThrow({ where: { id } });
    expect(row.votesA + row.votesB).toBe(2);
    expect(await ctx.prisma.battleVote.count({ where: { battleId: id } })).toBe(
      2,
    );
  });

  it('al vencer el plazo se cierra una sola vez, avisa del resultado y entra en el ranking', async () => {
    const live = await ctx.prisma.battle.findFirstOrThrow({
      where: { status: 'ACTIVE' },
    });
    await ctx.prisma.battle.update({
      where: { id: live.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    // Votar fuera de plazo no cuenta
    const late = await registerUser(ctx, 'tarde');
    await ctx
      .http()
      .post(`/api/battles/${live.id}/vote`)
      .set(...bearer(late.token))
      .send({ side: 'B' })
      .expect(409);

    const done = await ctx
      .http()
      .get(`/api/battles/${live.id}`)
      .set(...bearer(eva.token))
      .expect(200);
    expect(done.body.status).toBe('FINISHED');
    expect(done.body.votes).not.toBe(null);
    const row = await ctx.prisma.battle.findUniqueOrThrow({
      where: { id: live.id },
    });
    expect(row.status).toBe('FINISHED');
    const winnerSide =
      row.votesA > row.votesB ? 'A' : row.votesB > row.votesA ? 'B' : null;
    expect(row.winner).toBe(winnerSide);
    const results = await ctx.prisma.notification.count({
      where: { type: 'BATTLE_RESULT' },
    });
    expect(results).toBe(2);
    // Consultar otra vez no repite avisos
    await ctx
      .http()
      .get('/api/battles?tab=finished')
      .set(...bearer(eva.token))
      .expect(200);
    expect(
      await ctx.prisma.notification.count({ where: { type: 'BATTLE_RESULT' } }),
    ).toBe(2);

    const board = await ctx
      .http()
      .get('/api/battles/leaderboard')
      .set(...bearer(max.token))
      .expect(200);
    if (winnerSide) {
      expect(board.body.top[0].userId).toBe(
        winnerSide === 'A' ? ana.userId : leo.userId,
      );
      expect(board.body.top[0].wins).toBe(1);
    }
    expect(board.body.me).toMatchObject({ wins: 0, played: 0, rank: null });
  });

  it('reto abierto: lo acepta el primero que llega; quien reta puede retirarlo antes', async () => {
    const o = await outfitOf(eva, 'Abierto');
    const open = await ctx
      .http()
      .post('/api/battles')
      .set(...bearer(eva.token))
      .send({ outfitId: o })
      .expect(201);
    expect(open.body.isOpen).toBe(true);
    const list = await ctx
      .http()
      .get('/api/battles?tab=open')
      .set(...bearer(max.token))
      .expect(200);
    expect(
      list.body.data.some((x: { id: string }) => x.id === open.body.id),
    ).toBe(true);
    await ctx
      .http()
      .post(`/api/battles/${open.body.id}/accept`)
      .set(...bearer(eva.token))
      .send({ outfitId: o })
      .expect(400);

    const om = await outfitOf(max, 'Max');
    const ol = await outfitOf(leo, 'Leo 2');
    const [x, y] = await Promise.all([
      ctx
        .http()
        .post(`/api/battles/${open.body.id}/accept`)
        .set(...bearer(max.token))
        .send({ outfitId: om }),
      ctx
        .http()
        .post(`/api/battles/${open.body.id}/accept`)
        .set(...bearer(leo.token))
        .send({ outfitId: ol }),
    ]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);

    // Retirar: solo mientras está pendiente
    await ctx
      .http()
      .delete(`/api/battles/${open.body.id}`)
      .set(...bearer(eva.token))
      .expect(409);
    const o2 = await outfitOf(eva, 'Retirar');
    const p = await ctx
      .http()
      .post('/api/battles')
      .set(...bearer(eva.token))
      .send({ outfitId: o2, opponentId: ana.userId })
      .expect(201);
    await ctx
      .http()
      .post('/api/battles')
      .set(...bearer(eva.token))
      .send({ outfitId: o2, opponentId: ana.userId })
      .expect(409);
    await ctx
      .http()
      .delete(`/api/battles/${p.body.id}`)
      .set(...bearer(leo.token))
      .expect(404);
    await ctx
      .http()
      .delete(`/api/battles/${p.body.id}`)
      .set(...bearer(eva.token))
      .expect(204);
    const gone = await ctx
      .http()
      .get(`/api/battles/${p.body.id}`)
      .set(...bearer(eva.token))
      .expect(200);
    expect(gone.body.status).toBe('CANCELLED');
  });

  it('rechazar, caducar y bloqueos', async () => {
    const o = await outfitOf(max, 'Rechazo');
    const b = await ctx
      .http()
      .post('/api/battles')
      .set(...bearer(max.token))
      .send({ outfitId: o, opponentId: ana.userId })
      .expect(201);
    await ctx
      .http()
      .post(`/api/battles/${b.body.id}/decline`)
      .set(...bearer(eva.token))
      .expect(409);
    const d = await ctx
      .http()
      .post(`/api/battles/${b.body.id}/decline`)
      .set(...bearer(ana.token))
      .expect(201);
    expect(d.body.status).toBe('DECLINED');

    const c = await ctx
      .http()
      .post('/api/battles')
      .set(...bearer(max.token))
      .send({ outfitId: o, opponentId: leo.userId })
      .expect(201);
    await ctx.prisma.battle.update({
      where: { id: c.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const exp = await ctx
      .http()
      .get(`/api/battles/${c.body.id}`)
      .set(...bearer(max.token))
      .expect(200);
    expect(exp.body.status).toBe('EXPIRED');
    await ctx
      .http()
      .post(`/api/battles/${c.body.id}/accept`)
      .set(...bearer(leo.token))
      .send({ outfitId: o })
      .expect(409);

    // Con bloqueo no se puede retar ni se ven sus batallas
    await ctx
      .http()
      .post(`/api/people/${max.userId}/block`)
      .set(...bearer(eva.token))
      .expect((r) => expect([200, 201, 204]).toContain(r.status));
    const o3 = await outfitOf(eva, 'Bloqueo');
    await ctx
      .http()
      .post('/api/battles')
      .set(...bearer(eva.token))
      .send({ outfitId: o3, opponentId: max.userId })
      .expect(403);
    const fin = await ctx
      .http()
      .get('/api/battles?tab=live')
      .set(...bearer(eva.token))
      .expect(200);
    for (const x of fin.body.data as {
      challenger: { id: string };
      opponent: { id: string } | null;
    }[]) {
      expect([x.challenger.id, x.opponent?.id]).not.toContain(max.userId);
    }
  });
});
