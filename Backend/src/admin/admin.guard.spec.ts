import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function ctx(user?: { role: string }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard();
  it('deja pasar a un admin', () => {
    expect(guard.canActivate(ctx({ role: 'ADMIN' }))).toBe(true);
  });
  it('a cualquier otra cuenta, 403', () => {
    expect(() => guard.canActivate(ctx({ role: 'USER' }))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(ctx())).toThrow(ForbiddenException);
  });
});
