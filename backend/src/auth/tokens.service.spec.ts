import {
  ConflictException,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { AuthTokenType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode, TokensService } from './tokens.service';

const USER_ID = 'user-1';

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** `expect.any` is typed `any`, which the repo's typed lint rules reject. */
const ANY_DATE: unknown = expect.any(Date);

describe('generateCode', () => {
  it('always produces six digits, zero-padded', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe('TokensService', () => {
  let prisma: {
    authToken: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let service: TokensService;

  beforeEach(() => {
    prisma = {
      authToken: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn(),
      },
      // The issue path passes an array of operations, not a callback.
      $transaction: jest.fn().mockResolvedValue([]),
    };
    service = new TokensService(prisma as unknown as PrismaService);
  });

  /** Build a stored row for a known secret. */
  function row(raw: string, overrides: Record<string, unknown> = {}) {
    return {
      id: 'token-1',
      userId: USER_ID,
      type: AuthTokenType.password_reset,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      attempts: 0,
      ...overrides,
    };
  }

  describe('issuing', () => {
    it('retires any earlier unconsumed token of the same type', async () => {
      await service.issueResetToken(USER_ID);

      // Both operations go into one $transaction call, so a new token can
      // never coexist with the one it replaces.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.authToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          type: AuthTokenType.password_reset,
          consumedAt: null,
        },
        data: { consumedAt: ANY_DATE },
      });
    });

    it('stores only the hash, never the secret itself', async () => {
      const raw = await service.issueResetToken(USER_ID);

      const calls = prisma.authToken.create.mock.calls as Array<
        [{ data: { tokenHash: string } }]
      >;
      const stored = calls[0][0].data.tokenHash;
      expect(stored).toBe(sha256(raw));
      expect(stored).not.toBe(raw);
    });
  });

  describe('consumeResetToken', () => {
    it('returns the owner and burns the token', async () => {
      prisma.authToken.findFirst.mockResolvedValue(row('secret'));

      await expect(service.consumeResetToken('secret')).resolves.toBe(USER_ID);
      expect(prisma.authToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: { consumedAt: ANY_DATE },
      });
    });

    it('rejects an unknown token', async () => {
      prisma.authToken.findFirst.mockResolvedValue(null);
      await expect(service.consumeResetToken('nope')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects reuse of a token that has already been spent', async () => {
      prisma.authToken.findFirst.mockResolvedValue(
        row('secret', { consumedAt: new Date() }),
      );
      await expect(service.consumeResetToken('secret')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects an expired token with 410 rather than 401', async () => {
      prisma.authToken.findFirst.mockResolvedValue(
        row('secret', { expiresAt: new Date(Date.now() - 1) }),
      );
      await expect(service.consumeResetToken('secret')).rejects.toThrow(
        GoneException,
      );
    });
  });
});
