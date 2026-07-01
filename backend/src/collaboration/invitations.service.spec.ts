import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { InvitationStatus, Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { InvitationsService } from './invitations.service';

const PROJECT_ID = 'project-1';
const INVITER_ID = 'owner-1';
const INVITEE_ID = 'user-2';
const INVITEE_EMAIL = 'bob@example.com';

describe('InvitationsService', () => {
  let service: InvitationsService;
  let prisma: {
    project: { findUnique: jest.Mock };
    projectInvitation: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    projectMember: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: { assertAccess: jest.Mock };

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn() },
      projectInvitation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      projectMember: { upsert: jest.fn() },
      $transaction: jest.fn((cb: (tx: typeof prisma) => unknown) => cb(prisma)),
    };
    access = { assertAccess: jest.fn().mockResolvedValue(undefined) };
    service = new InvitationsService(
      prisma as unknown as PrismaService,
      access as unknown as ProjectAccessService,
    );
  });

  describe('create', () => {
    const dto = { email: INVITEE_EMAIL, role: Role.tester };

    function stubProject() {
      prisma.project.findUnique.mockResolvedValue({
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
