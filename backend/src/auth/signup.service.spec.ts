import {
  ConflictException,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { SignupService } from './signup.service';
import { MAX_VERIFY_ATTEMPTS } from './tokens.service';

const EMAIL = 'victim@example.com';

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

describe('SignupService', () => {
  let prisma: {
    user: { findFirst: jest.Mock; create: jest.Mock };
    pendingSignup: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let email: {
    sendEmailVerification: jest.Mock;
    sendWelcome: jest.Mock;
  };
  let service: SignupService;

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      pendingSignup: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((cb: (tx: typeof prisma) => unknown) => cb(prisma)),
    };
    email = {
      sendEmailVerification: jest.fn().mockResolvedValue(true),
      sendWelcome: jest.fn().mockResolvedValue(true),
    };

    service = new SignupService(
      prisma as unknown as PrismaService,
      email as unknown as EmailService,
    );
  });

  function dto(overrides: Partial<Record<string, string>> = {}) {
    return {
      username: 'squatter',
      email: EMAIL,
      password: 'a-password-123',
      ...overrides,
    };
  }

  /** The code handed to the mailer by the most recent `start`/`resend`. */
  function lastCode(): string {
    const calls = email.sendEmailVerification.mock.calls as Array<
      [string, { code: string }]
    >;
    return calls[calls.length - 1][1].code;
  }

  /** The row `upsert` would have written, as `findUnique` should return it. */
  function lastPendingRow(overrides: Record<string, unknown> = {}) {
    const calls = prisma.pendingSignup.upsert.mock.calls as Array<
      [{ create: { username: string; password: string; codeHash: string } }]
    >;
    const created = calls[calls.length - 1][0].create;
    return {
      email: EMAIL,
      username: created.username,
      password: created.password,
      codeHash: created.codeHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    };
  }

  // --------------------------------------------------------------------------
  // The bug this whole table exists to fix.
  // --------------------------------------------------------------------------
  describe('squatting', () => {
    it('creates no user row, so an unproven address is never claimed', async () => {
      await service.start(dto());

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.pendingSignup.upsert).toHaveBeenCalledTimes(1);
    });

    it('lets a second registration overwrite the first for the same address', async () => {
      await service.start(dto({ username: 'squatter' }));
      const squattersCode = lastCode();

      // The real owner comes along and registers the same address.
      await service.start(dto({ username: 'realowner' }));
      const ownersCode = lastCode();

      // Upsert, not create: one row per address, and it now belongs to whoever
      // registered last — which is the person who can read the inbox.
      expect(prisma.pendingSignup.upsert).toHaveBeenCalledTimes(2);
      const calls = prisma.pendingSignup.upsert.mock.calls as Array<
        [{ where: { email: string }; update: { username: string } }]
      >;
      expect(calls[1][0].where).toEqual({ email: EMAIL });
      expect(calls[1][0].update.username).toBe('realowner');
      expect(ownersCode).not.toBe(squattersCode);
    });

    it('accepts the newest code and rejects the one it replaced', async () => {
      await service.start(dto({ username: 'squatter' }));
      const squattersCode = lastCode();
      await service.start(dto({ username: 'realowner' }));
      const ownersCode = lastCode();

      prisma.pendingSignup.findUnique.mockResolvedValue(lastPendingRow());
      prisma.user.create.mockResolvedValue(userRow('realowner'));

      await expect(service.complete(EMAIL, squattersCode)).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(service.complete(EMAIL, ownersCode)).resolves.toMatchObject({
        username: 'realowner',
      });
    });

    it('resets the attempt counter, so an abandoned attempt cannot lock out the next one', async () => {
      await service.start(dto());

      const calls = prisma.pendingSignup.upsert.mock.calls as Array<
        [{ update: { attempts: number } }]
      >;
      expect(calls[0][0].update.attempts).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  describe('start', () => {
    it('rejects an email a real account already holds', async () => {
      prisma.user.findFirst.mockResolvedValue({ username: 'someone-else' });
      await expect(service.start(dto())).rejects.toThrow(ConflictException);
      expect(prisma.pendingSignup.upsert).not.toHaveBeenCalled();
    });

    it('rejects a username a real account already holds', async () => {
      prisma.user.findFirst.mockResolvedValue({ username: 'squatter' });
      await expect(service.start(dto())).rejects.toThrow(
        /Username is already taken/,
      );
    });

    it('stores the code hashed, never in the clear', async () => {
      await service.start(dto());

      const calls = prisma.pendingSignup.upsert.mock.calls as Array<
        [{ create: { codeHash: string; password: string } }]
      >;
      expect(calls[0][0].create.codeHash).toBe(sha256(lastCode()));
      expect(calls[0][0].create.password).not.toBe('a-password-123');
    });

    it('still resolves when the mailer throws', async () => {
      email.sendEmailVerification.mockRejectedValue(new Error('smtp down'));
      await expect(service.start(dto())).resolves.toHaveProperty('message');
    });
  });

  // --------------------------------------------------------------------------
  describe('complete', () => {
    it('rejects when nothing is pending', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(null);
      await expect(service.complete(EMAIL, '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('discards an expired signup and reports 410', async () => {
      await service.start(dto());
      prisma.pendingSignup.findUnique.mockResolvedValue(
        lastPendingRow({ expiresAt: new Date(Date.now() - 1) }),
      );

      await expect(service.complete(EMAIL, lastCode())).rejects.toThrow(
        GoneException,
      );
      expect(prisma.pendingSignup.deleteMany).toHaveBeenCalledWith({
        where: { email: EMAIL },
      });
    });

    it('counts a wrong code without destroying the signup', async () => {
      await service.start(dto());
      prisma.pendingSignup.findUnique.mockResolvedValue(
        lastPendingRow({ attempts: 1 }),
      );

      await expect(service.complete(EMAIL, '000000')).rejects.toThrow(
        /attempt\(s\) left/,
      );
      expect(prisma.pendingSignup.update).toHaveBeenCalledWith({
        where: { email: EMAIL },
        data: { attempts: 2 },
      });
      expect(prisma.pendingSignup.deleteMany).not.toHaveBeenCalled();
    });

    it('destroys the signup once the attempt limit is reached', async () => {
      await service.start(dto());
      prisma.pendingSignup.findUnique.mockResolvedValue(
        lastPendingRow({ attempts: MAX_VERIFY_ATTEMPTS - 1 }),
      );

      // A counter nobody acts on is not a limit — the row has to go, or all
      // million guesses still get a turn.
      await expect(service.complete(EMAIL, '000000')).rejects.toThrow(
        /Too many incorrect codes/,
      );
      expect(prisma.pendingSignup.deleteMany).toHaveBeenCalledWith({
        where: { email: EMAIL },
      });
    });

    it('creates the verified user and clears the pending row together', async () => {
      await service.start(dto());
      prisma.pendingSignup.findUnique.mockResolvedValue(lastPendingRow());
      prisma.user.create.mockResolvedValue(userRow('squatter'));

      const user = await service.complete(EMAIL, lastCode());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const created = prisma.user.create.mock.calls as Array<
        [{ data: { emailVerifiedAt: Date } }]
      >;
      expect(created[0][0].data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(prisma.pendingSignup.delete).toHaveBeenCalledWith({
        where: { email: EMAIL },
      });
      expect(user.emailVerified).toBe(true);
      expect(email.sendWelcome).toHaveBeenCalled();
    });

    it('refuses if the username was taken while the code sat unread', async () => {
      await service.start(dto());
      prisma.pendingSignup.findUnique.mockResolvedValue(lastPendingRow());
      // The start-time check is a whole day stale by now; only the one inside
      // the transaction can be trusted.
      prisma.user.findFirst.mockResolvedValue({ username: 'squatter' });

      await expect(service.complete(EMAIL, lastCode())).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  describe('resend', () => {
    it('answers the same whether or not a signup is pending', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(null);
      const missing = await service.resend('nobody@example.com');

      await service.start(dto());
      prisma.pendingSignup.findUnique.mockResolvedValue(lastPendingRow());
      const present = await service.resend(EMAIL);

      expect(missing).toEqual(present);
    });

    it('sends nothing for an address with no pending signup', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(null);
      await service.resend('nobody@example.com');
      expect(email.sendEmailVerification).not.toHaveBeenCalled();
    });
  });
});

/** A row shaped like PUBLIC_USER_SELECT. */
function userRow(username: string) {
  return {
    id: 'user-1',
    username,
    email: EMAIL,
    name: null,
    avatarColor: null,
    emailVerifiedAt: new Date(),
    notifyRunFinished: true,
    notifyInvitations: true,
    createdAt: new Date(),
  };
}
