import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { isValidUsername } from './profile-options';

function check(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateProfileDto, body);
  return {
    dto,
    errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
  };
}

describe('UpdateProfileDto', () => {
  it('normaliza el @usuario (sin @ y en minúsculas)', () => {
    const { dto, errors } = check({ username: '  @Ana.Street ' });
    expect(errors).toHaveLength(0);
    expect(dto.username).toBe('ana.street');
  });

  it.each(['ab', '.ana', 'ana.', 'a..b', 'ana-ruiz', 'añá', 'x'.repeat(31)])(
    'rechaza el @usuario %j',
    (username) => {
      expect(check({ username }).errors.length).toBeGreaterThan(0);
    },
  );

  it('texto vacío borra el campo (null)', () => {
    const { dto, errors } = check({ bio: '   ', website: '', username: '' });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ bio: null, website: null, username: null });
  });

  it('la web tiene que ser http(s)', () => {
    expect(
      check({ website: 'javascript:alert(1)' }).errors.length,
    ).toBeGreaterThan(0);
    expect(check({ website: 'ftp://x.com' }).errors.length).toBeGreaterThan(0);
    expect(check({ website: 'https://myout.app/ana' }).errors).toHaveLength(0);
  });

  it('estilos: solo de la lista, sin repetir y como mucho 5', () => {
    expect(
      check({ styleTags: ['streetwear', 'minimalist'] }).errors,
    ).toHaveLength(0);
    expect(check({ styleTags: ['inventado'] }).errors.length).toBeGreaterThan(
      0,
    );
    expect(
      check({ styleTags: ['casual', 'casual'] }).errors.length,
    ).toBeGreaterThan(0);
    expect(
      check({
        styleTags: [
          'casual',
          'streetwear',
          'minimalist',
          'formal',
          'sporty',
          'vintage',
        ],
      }).errors.length,
    ).toBeGreaterThan(0);
  });

  it('colores en hexadecimal (se guardan en mayúsculas)', () => {
    const { dto, errors } = check({
      favoriteColors: ['#1a1a1a', '#FF5A1F'],
      accentColor: '#ff5a1f',
    });
    expect(errors).toHaveLength(0);
    expect(dto.favoriteColors).toEqual(['#1A1A1A', '#FF5A1F']);
    expect(dto.accentColor).toBe('#FF5A1F');
    expect(check({ favoriteColors: ['rojo'] }).errors.length).toBeGreaterThan(
      0,
    );
  });

  it('el @ de Instagram se guarda sin la @', () => {
    const { dto, errors } = check({ instagramHandle: '@ana.street_' });
    expect(errors).toHaveLength(0);
    expect(dto.instagramHandle).toBe('ana.street_');
  });

  it('la foto tiene que ser un UUID (o null para quitarla)', () => {
    expect(
      check({ avatarAssetId: 'no-es-uuid' }).errors.length,
    ).toBeGreaterThan(0);
    expect(check({ avatarAssetId: null }).errors).toHaveLength(0);
  });

  it('no deja cambiar campos sensibles (email, contraseña)', () => {
    expect(check({ email: 'x@y.z' }).errors.length).toBeGreaterThan(0);
    expect(check({ passwordHash: 'x' }).errors.length).toBeGreaterThan(0);
  });
});

describe('isValidUsername', () => {
  it('rechaza nombres reservados', () => {
    expect(isValidUsername('admin')).toBe(false);
    expect(isValidUsername('myout')).toBe(false);
    expect(isValidUsername('ana_street')).toBe(true);
  });
});
