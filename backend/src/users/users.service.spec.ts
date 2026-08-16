import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { hashPassword } from '../auth/password';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const USER_ID = 'user-1';
const PASSWORD = 'correct-horse';

describe('UsersService', () => {
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; delete: jest.Mock };
    project: { deleteMany: jest.Mock };
    projectMember: { deleteMany: jest.Mock };
    projectInvitation: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let email: { sendPasswordChanged: jest.Mock };
  let service: UsersService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
      project: { deleteMany: jest.fn() },
      projectMember: { deleteMany: jest.fn() },
      projectInvitation: { deleteMany: jest.fn() },
      $transaction: jest.fn((cb: (tx: typeof prisma) => unknown) => cb(prisma)),
    };
    email = { sendPasswordChanged: jest.fn().mockResolvedValue(true) };

    service = new UsersService(
      prisma as unknown as PrismaService,
      email as unknown as EmailService,
    );
  });

  function userRow(overrides: Record<string, unknown> = {}) {
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
      ...overrides,
    };
  }

  // --------------------------------------------------------------------------
  describe('updateProfile', () => {
    it('trims a display name', async () => {
      prisma.user.update.mockResolvedValue(userRow({ name: 'Alice B' }));

      await service.updateProfile(USER_ID, { name: '  Alice B  ' });

      const calls = prisma.user.update.mock.calls as Array<
        [{ data: { name: string | null } }]
      >;
      expect(calls[0][0].data.name).toBe('Alice B');
    });

    it('stores an emptied name as null, not an empty string', async () => {
      prisma.user.update.mockResolvedValue(userRow());

      await service.updateProfile(USER_ID, { name: '   ' });

      // One representation of "no display name" keeps the UI's
      // `name ?? username` fallback working.
      const calls = prisma.user.update.mock.calls as Array<
        [{ data: { name: string | null } }]
      >;
      expect(calls[0][0].data.name).toBeNull();
    });

    it('leaves fields the caller omitted untouched', async () => {
      prisma.user.update.mockResolvedValue(userRow());

      await service.updateProfile(USER_ID, { avatarColor: 'purple' });

      const calls = prisma.user.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(calls[0][0].data).toEqual({ avatarColor: 'purple' });
    });
  });

  // --------------------------------------------------------------------------
  describe('changePassword', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'alice@example.com',
        username: 'alice',
        password: passwordHash,
      });
      prisma.user.update.mockResolvedValue(userRow());
    });

    it('rejects a wrong current password without writing anything', async () => {
      await expect(
        service.changePassword(USER_ID, {
          currentPassword: 'wrong',
          newPassword: 'brand-new-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a new password identical to the current one', async () => {
      await expect(
        service.changePassword(USER_ID, {
          currentPassword: PASSWORD,
          newPassword: PASSWORD,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('hashes the new password and stamps passwordChangedAt', async () => {
      await service.changePassword(USER_ID, {
        currentPassword: PASSWORD,
        newPassword: 'brand-new-password',
      });

      const calls = prisma.user.update.mock.calls as Array<
        [{ data: { password: string; passwordChangedAt: Date } }]
      >;
      expect(calls[0][0].data.password).not.toBe('brand-new-password');
      expect(calls[0][0].data.passwordChangedAt).toBeInstanceOf(Date);
    });

    it('sends the security notice', async () => {
      await service.changePassword(USER_ID, {
        currentPassword: PASSWORD,
        newPassword: 'brand-new-password',
      });

      expect(email.sendPasswordChanged).toHaveBeenCalledWith(
        'alice@example.com',
        'alice',
      );
    });
  });

  // --------------------------------------------------------------------------
  describe('deleteAccount', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        password: passwordHash,
      });
    });

    it('refuses without the correct password', async () => {
      await expect(
        service.deleteAccount(USER_ID, { password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('clears memberships, sent invitations and owned projects atomically', async () => {
      await service.deleteAccount(USER_ID, { password: PASSWORD });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.projectMember.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
      expect(prisma.projectInvitation.deleteMany).toHaveBeenCalledWith({
        where: { invitedById: USER_ID },
      });
      expect(prisma.project.deleteMany).toHaveBeenCalledWith({
        where: { ownerId: USER_ID },
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: USER_ID },
      });
    });

    it('does not delete test suites — they belong to the project, not the user', async () => {
      await service.deleteAccount(USER_ID, { password: PASSWORD });

      // Runs triggered inside somebody else's project survive with a null
      // triggeredById; that history is the project's, not the departing user's.
      expect(prisma).not.toHaveProperty('testSuite.deleteMany');
    });
  });
});
