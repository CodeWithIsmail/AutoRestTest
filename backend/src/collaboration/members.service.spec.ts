import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { MembersService } from './members.service';

const PROJECT_ID = 'project-1';
const OWNER_ID = 'owner-1';
const MEMBER_ID = 'member-1';

describe('MembersService', () => {
  let service: MembersService;
  let prisma: {
    project: { findUnique: jest.Mock };
    projectMember: {
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let access: { assertAccess: jest.Mock };

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn() },
      projectMember: {
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    access = { assertAccess: jest.fn().mockResolvedValue(undefined) };
    service = new MembersService(
      prisma as unknown as PrismaService,
      access as unknown as ProjectAccessService,
    );
  });

  describe('list', () => {
    it('returns the owner and members for any member', async () => {
      prisma.project.findUnique.mockResolvedValue({
        owner: { id: OWNER_ID, username: 'alice', email: 'a@x.com' },
        members: [
          {
            userId: MEMBER_ID,
            role: Role.tester,
            joinedAt: new Date(),
            user: { username: 'bob', email: 'b@x.com' },
          },
        ],
      });

      const res = await service.list(PROJECT_ID, OWNER_ID);

      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, OWNER_ID);
      expect(res.owner.username).toBe('alice');
      expect(res.members).toHaveLength(1);
      expect(res.members[0].role).toBe(Role.tester);
    });
  });

  describe('updateRole', () => {
    it('updates and returns the member', async () => {
      prisma.projectMember.updateMany.mockResolvedValue({ count: 1 });
      prisma.projectMember.findUnique.mockResolvedValue({
        userId: MEMBER_ID,
        role: Role.admin,
        joinedAt: new Date(),
        user: { username: 'bob', email: 'b@x.com' },
      });

      const res = await service.updateRole(PROJECT_ID, MEMBER_ID, OWNER_ID, {
        role: Role.admin,
      });

      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, OWNER_ID, [
        Role.admin,
      ]);
      expect(res.role).toBe(Role.admin);
    });

    it('404s when the target is not a member', async () => {
      prisma.projectMember.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.updateRole(PROJECT_ID, 'ghost', OWNER_ID, { role: Role.admin }),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates access-denied', async () => {
      access.assertAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        service.updateRole(PROJECT_ID, MEMBER_ID, OWNER_ID, {
          role: Role.admin,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('removes a member', async () => {
      prisma.projectMember.deleteMany.mockResolvedValue({ count: 1 });
      await expect(
        service.remove(PROJECT_ID, MEMBER_ID, OWNER_ID),
      ).resolves.toEqual({ message: 'Member removed' });
    });

    it('404s when not a member', async () => {
      prisma.projectMember.deleteMany.mockResolvedValue({ count: 0 });
      await expect(
        service.remove(PROJECT_ID, 'ghost', OWNER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('leave', () => {
    it('lets a member leave', async () => {
      prisma.project.findUnique.mockResolvedValue({ ownerId: OWNER_ID });
      prisma.projectMember.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.leave(PROJECT_ID, MEMBER_ID)).resolves.toEqual({
        message: 'You have left the project',
      });
    });

    it('prevents the owner from leaving', async () => {
      prisma.project.findUnique.mockResolvedValue({ ownerId: OWNER_ID });
      await expect(service.leave(PROJECT_ID, OWNER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('404s when the caller is not a member', async () => {
      prisma.project.findUnique.mockResolvedValue({ ownerId: OWNER_ID });
      prisma.projectMember.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.leave(PROJECT_ID, 'ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
