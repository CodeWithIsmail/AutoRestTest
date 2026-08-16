import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { hashPassword } from './password';
import { SignupService } from './signup.service';
import { TokensService } from './tokens.service';

const USER_ID = 'user-1';
const PASSWORD = 'correct-horse';

describe('AuthService', () => {
  let prisma: {
    user: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };
  let config: { get: jest.Mock };
  let email: {
    sendWelcome: jest.Mock;
    sendEmailVerification: jest.Mock;
    sendPasswordReset: jest.Mock;
    sendPasswordChanged: jest.Mock;
  };
  let tokens: {
    issueResetToken: jest.Mock;
    consumeResetToken: jest.Mock;
  };
  let signup: {
    start: jest.Mock;
    complete: jest.Mock;
    resend: jest.Mock;
  };
  let service: AuthService;
  let passwordHash: string;

  beforeAll(async () => {
    // Hashed once: bcrypt at cost 10 is slow enough to notice per-test.
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    config = { get: jest.fn().mockReturnValue('test-secret') };
    email = {
      sendWelcome: jest.fn().mockResolvedValue(true),
      sendEmailVerification: jest.fn().mockResolvedValue(true),
      sendPasswordReset: jest.fn().mockResolvedValue(true),
      sendPasswordChanged: jest.fn().mockResolvedValue(true),
    };
    tokens = {
      issueResetToken: jest.fn().mockResolvedValue('reset-token'),
      consumeResetToken: jest.fn().mockResolvedValue(USER_ID),
    };
    signup = {
      start: jest
        .fn()
        .mockResolvedValue({ message: 'Check your email for the code.' }),
      complete: jest.fn(),
      resend: jest.fn().mockResolvedValue({ message: 'sent' }),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
      email as unknown as EmailService,
      tokens as unknown as TokensService,
      signup as unknown as SignupService,
    );
  });

  /** A row shaped like PUBLIC_USER_SELECT. */
  function userRow(overrides: Record<string, unknown> = {}) {
    return {
      id: USER_ID,
      username: 'alice',
      email: 'alice@example.com',
      name: null,
      avatarColor: null,
      emailVerifiedAt: null,
      notifyRunFinished: true,
      notifyInvitations: true,
      createdAt: new Date(),
      ...overrides,
    };
  }

  /** The PublicUser shape SignupService.complete resolves with. */
  function publicUser() {
    return {
      id: USER_ID,
      username: 'alice',
      email: 'alice@example.com',
      name: null,
      avatarColor: null,
      emailVerified: true,
      notifyRunFinished: true,
      notifyInvitations: true,
      createdAt: new Date(),
    };
  }

  // --------------------------------------------------------------------------
  describe('register', () => {
    const DTO = {
      username: 'alice',
      email: 'Alice@Example.com',
      password: PASSWORD,
    };
    const ORIGINAL = process.env['REQUIRE_EMAIL_VERIFICATION'];

    afterEach(() => {
      if (ORIGINAL === undefined) {
        delete process.env['REQUIRE_EMAIL_VERIFICATION'];
      } else {
        process.env['REQUIRE_EMAIL_VERIFICATION'] = ORIGINAL;
      }
    });

    it('parks the signup and creates no account', async () => {
      process.env['REQUIRE_EMAIL_VERIFICATION'] = 'true';

      const result = await service.register(DTO);

      expect(signup.start).toHaveBeenCalledWith(DTO);
      expect(result.verificationRequired).toBe(true);
      // The whole point: no users row, so the address stays unclaimed.
      expect(prisma.user.create).not.toHaveBeenCalled();
      // And no session — there is no account to be signed in to yet.
      expect(result).not.toHaveProperty('accessToken');
      expect(email.sendWelcome).not.toHaveBeenCalled();
    });

    it('creates the account outright when verification is switched off', async () => {
      process.env['REQUIRE_EMAIL_VERIFICATION'] = 'false';
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(
        userRow({ emailVerifiedAt: new Date() }),
      );

      const result = await service.register(DTO);

      expect(signup.start).not.toHaveBeenCalled();
      expect(result.verificationRequired).toBe(false);
      // Marked verified: with the check disabled there is no way it ever could
      // be, and a permanently unverifiable account is worse.
      const created = prisma.user.create.mock.calls as Array<
        [{ data: { emailVerifiedAt: Date } }]
      >;
      expect(created[0][0].data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(email.sendWelcome).toHaveBeenCalled();
    });

    it('rejects a taken username on the verification-free path', async () => {
      process.env['REQUIRE_EMAIL_VERIFICATION'] = 'false';
      prisma.user.findFirst.mockResolvedValue({ username: 'alice' });

      await expect(service.register(DTO)).rejects.toThrow(ConflictException);
    });
  });

  // --------------------------------------------------------------------------
  describe('login', () => {
    it('resolves an identifier containing @ as an email, lowercased', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...userRow(),
        password: passwordHash,
      });

      await service.login({
        identifier: '  Alice@Example.com ',
        password: PASSWORD,
      });

      const calls = prisma.user.findFirst.mock.calls as Array<
        [{ where: Record<string, unknown> }]
      >;
      expect(calls[0][0].where).toEqual({ email: 'alice@example.com' });
    });

    it('resolves an identifier without @ as a username, case intact', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...userRow(),
        password: passwordHash,
      });

      await service.login({ identifier: ' Alice ', password: PASSWORD });

      const calls = prisma.user.findFirst.mock.calls as Array<
        [{ where: Record<string, unknown> }]
      >;
      // Not lowercased: `username` is a case-sensitive unique column, so
      // folding case here could match a different account.
      expect(calls[0][0].where).toEqual({ username: 'Alice' });
    });

    it('returns a token and never the password hash', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...userRow(),
        password: passwordHash,
      });

      const result = await service.login({
        identifier: 'alice',
        password: PASSWORD,
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).not.toHaveProperty('password');
    });

    it('gives the same error for an unknown user and a wrong password', async () => {
      /** Runs a login expected to fail and hands back the thrown error. */
      async function failedLogin(identifier: string, password: string) {
        try {
          await service.login({ identifier, password });
        } catch (err) {
          return err as Error;
        }
        throw new Error('expected login to fail');
      }

      prisma.user.findFirst.mockResolvedValue(null);
      const unknown = await failedLogin('nobody', PASSWORD);

      prisma.user.findFirst.mockResolvedValue({
        ...userRow(),
        password: passwordHash,
      });
      const wrongPassword = await failedLogin('alice', 'not-the-password');

      expect(unknown).toBeInstanceOf(UnauthorizedException);
      expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
      // Identical text — anything else turns login into an account enumerator.
      expect(unknown.message).toBe(wrongPassword.message);
    });
  });

  // --------------------------------------------------------------------------
  describe('forgotPassword', () => {
    const KNOWN = { email: 'alice@example.com' };
    const UNKNOWN = { email: 'nobody@example.com' };

    it('answers identically whether or not the address is registered', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'alice@example.com',
        username: 'alice',
      });
      const known = await service.forgotPassword(KNOWN);

      prisma.user.findUnique.mockResolvedValue(null);
      const unknown = await service.forgotPassword(UNKNOWN);

      expect(known).toEqual(unknown);
    });

    it('sends mail only for an address that exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.forgotPassword(UNKNOWN);

      expect(tokens.issueResetToken).not.toHaveBeenCalled();
      expect(email.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('issues a token and mails the link for a known address', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'alice@example.com',
        username: 'alice',
      });

      await service.forgotPassword(KNOWN);

      expect(tokens.issueResetToken).toHaveBeenCalledWith(USER_ID);
      expect(email.sendPasswordReset).toHaveBeenCalledWith(
        'alice@example.com',
        expect.objectContaining({ token: 'reset-token' }),
      );
    });
  });

  // --------------------------------------------------------------------------
  describe('resetPassword', () => {
    it('stamps passwordChangedAt so older tokens stop working', async () => {
      prisma.user.update.mockResolvedValue({
        email: 'alice@example.com',
        username: 'alice',
      });

      await service.resetPassword({
        token: 'reset-token',
        password: 'new-pw-1234',
      });

      const calls = prisma.user.update.mock.calls as Array<
        [{ data: { password: string; passwordChangedAt: Date } }]
      >;
      expect(calls[0][0].data.passwordChangedAt).toBeInstanceOf(Date);
      // Stored hashed, never in the clear.
      expect(calls[0][0].data.password).not.toBe('new-pw-1234');
      expect(email.sendPasswordChanged).toHaveBeenCalled();
    });

    it('does not touch the password when the token is rejected', async () => {
      tokens.consumeResetToken.mockRejectedValue(new UnauthorizedException());

      await expect(
        service.resetPassword({ token: 'bad', password: 'new-pw-1234' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  describe('completeSignup', () => {
    it('promotes the pending signup and returns a session', async () => {
      signup.complete.mockResolvedValue(publicUser());

      const result = await service.completeSignup({
        email: 'alice@example.com',
        code: '123456',
      });

      expect(signup.complete).toHaveBeenCalledWith(
        'alice@example.com',
        '123456',
      );
      // Same shape as login, so the client has one "I am signed in" path.
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.emailVerified).toBe(true);
    });
  });
});
