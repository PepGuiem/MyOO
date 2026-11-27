import { readUnsubscribeToken, unsubscribeToken } from './unsubscribe';

const SECRET = 'x'.repeat(40);
const USER = '3f1b2c4d-5e6f-4a1b-8c9d-0e1f2a3b4c5d';

describe('enlace de baja de los avisos', () => {
  it('ida y vuelta', () => {
    const t = unsubscribeToken(SECRET, USER, 'chat');
    expect(readUnsubscribeToken(SECRET, t)).toEqual({ userId: USER, kind: 'chat' });
  });

  it('no se puede cambiar la cuenta ni el tipo de aviso', () => {
    const t = unsubscribeToken(SECRET, USER, 'chat');
    const other = '00000000-0000-4000-8000-000000000000';
    expect(readUnsubscribeToken(SECRET, t.replace(USER, other))).toBeNull();
    expect(readUnsubscribeToken(SECRET, t.replace('.chat.', '.payments.'))).toBeNull();
  });

  it('con otro secreto no vale', () => {
    const t = unsubscribeToken(SECRET, USER, 'payments');
    expect(readUnsubscribeToken('y'.repeat(40), t)).toBeNull();
  });

  it('basura', () => {
    expect(readUnsubscribeToken(SECRET, undefined)).toBeNull();
    expect(readUnsubscribeToken(SECRET, 'a.b.c')).toBeNull();
    expect(readUnsubscribeToken(SECRET, `${USER}.all.xyz`)).toBeNull();
    expect(readUnsubscribeToken(SECRET, 'z'.repeat(500))).toBeNull();
  });
});
