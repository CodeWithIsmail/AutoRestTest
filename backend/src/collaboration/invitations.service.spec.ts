import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InvitationStatus, Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { EmailService } from '../email/email.service';
import { InvitationsService } from './invitations.service';

const PROJECT_ID = 'project-1';
const INVITER_ID = 'owner-1';
const INVITEE_ID = 'user-2';
const INVITEE_EMAIL = 'bob@example.com';
const PROJECT_NAME = 'Petstore API';

describe('InvitationsService', () => {
  let service: InvitationsService;
  let prisma: {
    project: { findUnique: jest.Mock };
    projectInvitation: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    projectMember: { upsert: jest.Mock };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: { assertAccess: jest.Mock };
  let email: { sendProjectInvitation: jest.Mock };

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn() },
      projectInvitation: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      projectMember: { upsert: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ username: 'alice' }) },
      $transaction: jest.fn((cb: (tx: typeof prisma) => unknown) => cb(prisma)),
    };
    access = { assertAccess: jest.fn().mockResolvedValue(undefined) };
    email = { sendProjectInvitation: jest.fn().mockResolvedValue(true) };
    service = new InvitationsService(
      prisma as unknown as PrismaService,
      access as unknown as ProjectAccessService,
      email as unknown as EmailService,
    );
  });

  describe('create', () => {
    const dto = { email: INVITEE_EMAIL, role: Role.tester };

    function stubProject() {
      prisma.project.findUnique.mockResolvedValue({
        name: PROJECT_NAME,
        owner: { email: 'alice@example.com' },
        members: [],
      });
    }

    it('creates a pending invitation with a token + acceptUrl', async () => {
      stubProject();
      prisma.projectInvitation.findUnique.mockResolvedValue(null);
      prisma.projectInvitation.create.mockImplementation(
        ({ data }: { data: { token: string } }) =>
          Promise.resolve({
            id: 'inv-1',
            email: INVITEE_EMAIL,
            role: Role.tester,
            status: InvitationStatus.pending,
            token: data.token,
            expiresAt: new Date(),
            createdAt: new Date(),
          }),
      );

      const inv = await service.create(PROJECT_ID, INVITER_ID, dto);

      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, INVITER_ID, [
        Role.admin,
      ]);
      expect(inv.token).toHaveLength(64); // 32 bytes hex
      expect(inv.acceptUrl).toBe(`/invitations/${inv.token}/accept`);
    });

    it('rejects inviting the project owner', async () => {
      prisma.project.findUnique.mockResolvedValue({
        owner: { email: INVITEE_EMAIL },
        members: [],
      });
      await expect(service.create(PROJECT_ID, INVITER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects inviting an existing member', async () => {
      prisma.project.findUnique.mockResolvedValue({
        owner: { email: 'alice@example.com' },
        members: [{ user: { email: INVITEE_EMAIL } }],
      });
      await expect(service.create(PROJECT_ID, INVITER_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects when a pending invite already exists', async () => {
      stubProject();
      prisma.projectInvitation.findUnique.mockResolvedValue({
        id: 'inv-old',
        status: InvitationStatus.pending,
      });
      await expect(service.create(PROJECT_ID, INVITER_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('reuses the row when a previous invite was declined', async () => {
      stubProject();
      prisma.projectInvitation.findUnique.mockResolvedValue({
        id: 'inv-old',
        status: InvitationStatus.declined,
      });
      prisma.projectInvitation.update.mockResolvedValue({
        id: 'inv-old',
        email: INVITEE_EMAIL,
        role: Role.tester,
        status: InvitationStatus.pending,
        token: 'tok',
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      await service.create(PROJECT_ID, INVITER_ID, dto);
      expect(prisma.projectInvitation.update).toHaveBeenCalled();
      expect(prisma.projectInvitation.create).not.toHaveBeenCalled();
    });

    it('emails the invitee the token, the project and the inviter', async () => {
      stubProject();
      prisma.projectInvitation.findUnique.mockResolvedValue(null);
      prisma.projectInvitation.create.mockImplementation(
        ({ data }: { data: { token: string } }) =>
          Promise.resolve({
            id: 'inv-1',
            email: INVITEE_EMAIL,
            role: Role.tester,
            status: InvitationStatus.pending,
            token: data.token,
            expiresAt: new Date(),
            createdAt: new Date(),
          }),
      );

      const inv = await service.create(PROJECT_ID, INVITER_ID, dto);

      expect(email.sendProjectInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          to: INVITEE_EMAIL,
          inviterName: 'alice',
          projectName: PROJECT_NAME,
          role: Role.tester,
          token: inv.token,
        }),
      );
    });

    it('still returns the invitation when the mailer throws', async () => {
      stubProject();
      prisma.projectInvitation.findUnique.mockResolvedValue(null);
      prisma.projectInvitation.create.mockResolvedValue({
        id: 'inv-1',
        email: INVITEE_EMAIL,
        role: Role.tester,
        status: InvitationStatus.pending,
        token: 'tok',
        expiresAt: new Date(),
        createdAt: new Date(),
      });
      email.sendProjectInvitation.mockRejectedValue(new Error('SMTP is down'));

      // The row is already written and the invitee can find it on their
      // Invitations page, so a mail failure must not surface as a 5xx.
      await expect(
        service.create(PROJECT_ID, INVITER_ID, dto),
      ).resolves.toMatchObject({ token: 'tok' });
    });
  });

  describe('resend', () => {
    function stubPending(overrides: Record<string, unknown> = {}) {
      prisma.projectInvitation.findFirst.mockResolvedValue({
        email: INVITEE_EMAIL,
        role: Role.tester,
        token: 'tok',
        status: InvitationStatus.pending,
        expiresAt: new Date(Date.now() + 60_000),
        project: { name: PROJECT_NAME },
        invitedBy: { username: 'alice' },
        ...overrides,
      });
    }

    it('re-sends the existing token rather than minting a new one', async () => {
      stubPending();

      const res = await service.resend(PROJECT_ID, 'inv-1', INVITER_ID);

      expect(res.message).toBe('Invitation email sent');
      expect(email.sendProjectInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ to: INVITEE_EMAIL, token: 'tok' }),
      );
      // A new token would dead-link whatever is already in the invitee's inbox.
      expect(prisma.projectInvitation.update).not.toHaveBeenCalled();
    });

    it('404s for an unknown invitation', async () => {
      prisma.projectInvitation.findFirst.mockResolvedValue(null);
      await expect(
        service.resend(PROJECT_ID, 'inv-1', INVITER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('409s when the invitation is no longer pending', async () => {
      stubPending({ status: InvitationStatus.accepted });
      await expect(
        service.resend(PROJECT_ID, 'inv-1', INVITER_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('410s when the invitation has expired', async () => {
      stubPending({ expiresAt: new Date(Date.now() - 60_000) });
      await expect(
        service.resend(PROJECT_ID, 'inv-1', INVITER_ID),
      ).rejects.toThrow(GoneException);
    });

    it('503s when the mail cannot be sent', async () => {
      stubPending();
      email.sendProjectInvitation.mockResolvedValue(false);
      // Unlike create, this endpoint exists only to send mail, so a failure
      // has to reach the user rather than being logged away.
      await expect(
        service.resend(PROJECT_ID, 'inv-1', INVITER_ID),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('accept', () => {
    function stubInvite(overrides: Record<string, unknown> = {}) {
      prisma.projectInvitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        projectId: PROJECT_ID,
        email: INVITEE_EMAIL,
        role: Role.tester,
        status: InvitationStatus.pending,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
      });
    }

    it('accepts a valid invite and creates membership', async () => {
      stubInvite();

      const res = await service.accept('tok', INVITEE_ID, INVITEE_EMAIL);

      expect(res.projectId).toBe(PROJECT_ID);
      expect(res.role).toBe(Role.tester);
      expect(prisma.projectMember.upsert).toHaveBeenCalled();
      const updateCalls = prisma.projectInvitation.update.mock.calls as Array<
        [{ data: { status: InvitationStatus } }]
      >;
      expect(updateCalls[0][0].data.status).toBe(InvitationStatus.accepted);
    });

    it('404s for an unknown token', async () => {
      prisma.projectInvitation.findUnique.mockResolvedValue(null);
      await expect(
        service.accept('nope', INVITEE_ID, INVITEE_EMAIL),
      ).rejects.toThrow(NotFoundException);
    });

    it('forbids accepting an invite sent to a different email', async () => {
      stubInvite({ email: 'someone-else@example.com' });
      await expect(
        service.accept('tok', INVITEE_ID, INVITEE_EMAIL),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an already-accepted invite', async () => {
      stubInvite({ status: InvitationStatus.accepted });
      await expect(
        service.accept('tok', INVITEE_ID, INVITEE_EMAIL),
      ).rejects.toThrow(ConflictException);
    });

    it('expires an out-of-date invite', async () => {
      stubInvite({ expiresAt: new Date(Date.now() - 1000) });
      await expect(
        service.accept('tok', INVITEE_ID, INVITEE_EMAIL),
      ).rejects.toThrow(GoneException);
      const updateCalls = prisma.projectInvitation.update.mock.calls as Array<
        [{ data: { status: InvitationStatus } }]
      >;
      expect(updateCalls[0][0].data.status).toBe(InvitationStatus.expired);
    });
  });

  describe('decline', () => {
    it('marks a pending invite declined', async () => {
      prisma.projectInvitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        projectId: PROJECT_ID,
        email: INVITEE_EMAIL,
        role: Role.tester,
        status: InvitationStatus.pending,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.decline('tok', INVITEE_EMAIL)).resolves.toEqual({
        message: 'Invitation declined',
      });
      const updateCalls = prisma.projectInvitation.update.mock.calls as Array<
        [{ data: { status: InvitationStatus } }]
      >;
      expect(updateCalls[0][0].data.status).toBe(InvitationStatus.declined);
    });
  });

  describe('revoke', () => {
    it('deletes a project invitation for owner/admin', async () => {
      prisma.projectInvitation.deleteMany.mockResolvedValue({ count: 1 });
      await expect(
        service.revoke(PROJECT_ID, 'inv-1', INVITER_ID),
      ).resolves.toEqual({ message: 'Invitation revoked' });
    });

    it('404s when nothing was deleted', async () => {
      prisma.projectInvitation.deleteMany.mockResolvedValue({ count: 0 });
      await expect(
        service.revoke(PROJECT_ID, 'inv-1', INVITER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
