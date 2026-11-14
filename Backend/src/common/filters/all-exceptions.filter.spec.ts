import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, locals: {} }),
      getRequest: () => ({ method: 'GET', url: '/api/test' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('db error', {
    code,
    clientVersion: 'test',
  });
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('mantiene el estado y mensaje de las HttpException', () => {
    const { host, status, json } = createHost();
    filter.catch(new NotFoundException('Wardrobe not found'), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Wardrobe not found',
        path: '/api/test',
      }),
    );
  });

  it('conserva los mensajes de validación (array)', () => {
    const { host, json } = createHost();
    filter.catch(new BadRequestException(['name should not be empty']), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['name should not be empty'],
      }),
    );
  });

  it.each([
    ['P2002', 409],
    ['P2003', 400],
    ['P2025', 404],
  ])('traduce el error de Prisma %s a HTTP %i', (code, expected) => {
    const { host, status } = createHost();
    filter.catch(prismaError(code), host);
    expect(status).toHaveBeenCalledWith(expected);
  });

  it('oculta los detalles de errores inesperados', () => {
    const { host, status, json } = createHost();
    // Silenciamos el log de error esperado durante este test.
    const spy = jest
      .spyOn(filter['logger'], 'error')
      .mockImplementation(() => undefined);
    filter.catch(new Error('SELECT * FROM secret_table'), host);
    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0] as { message: string };
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('secret_table');
    spy.mockRestore();
  });
});
