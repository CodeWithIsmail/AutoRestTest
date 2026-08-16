import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy, type JwtPayload } from './jwt.strategy';

const USER_ID = 'user-1';

describe('JwtStrategy', () => {
  let prisma: { user: { findUnique: jest.Mock } };
  let strategy: JwtStrategy;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    const config = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    strategy = new JwtStrategy(prisma as unknown as PrismaService, config);
  });

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: USER_ID,
      username: 'alice',
      email: 'alice@example.com',
      name: null,
      avatarColor: null,
      emailVerifiedAt: new Date(),
      notifyRunFinished: true,
      notifyInvitations: true,
      createdAt: new Date(),
      passwordChangedAt: null,
      ...overrides,
    };
  }

  function payload(issuedAtMs: number): JwtPayload {
    return {
      sub: USER_ID,
      email: 'alice@example.com',
      username: 'alice',
      iat: Math.floor(issuedAtMs / 1000),
    };
  }

  it('rejects a token for a user that no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(strategy.validate(payload(Date.now()))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('never exposes passwordChangedAt on request.user', async () => {
    prisma.user.findUnique.mockResolvedValue(
      row({ passwordChangedAt: new Date(Date.now() - 60_000) }),
    );

    const user = await strategy.validate(payload(Date.now()));

    expect(user).not.toHaveProperty('passwordChangedAt');
    expect(user).not.toHaveProperty('emailVerifiedAt');
    expect(user.emailVerified).toBe(true);
  });

  it('rejects a token minted before the password changed', async () => {
    const changed = new Date();
    prisma.user.findUnique.mockResolvedValue(
      row({ passwordChangedAt: changed }),
    );

    await expect(
      strategy.validate(payload(changed.getTime() - 5_000)),
    ).rejects.toThrow(/Session expired/);
  });

  it('accepts a token minted in the same second as the change', async () => {
    // `iat` is whole seconds, so a token issued at .000 can look older than a
    // change recorded at .800 in the same second. That is exactly what "reset
    // your password, then sign in" produces, and it must not be rejected.
    const changed = new Date(1_700_000_000_800);
    prisma.user.findUnique.mockResolvedValue(
      row({ passwordChangedAt: changed }),
    );

    await expect(
      strategy.validate(payload(1_700_000_000_000)),
    ).resolves.toMatchObject({ id: USER_ID });
  });

  it('accepts a token from a later second', async () => {
    const changed = new Date(1_700_000_000_800);
    prisma.user.findUnique.mockResolvedValue(
      row({ passwordChangedAt: changed }),
    );

    await expect(
      strategy.validate(payload(1_700_000_002_000)),
    ).resolves.toMatchObject({ id: USER_ID });
  });
});
