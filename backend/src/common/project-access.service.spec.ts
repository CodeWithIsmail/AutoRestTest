import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from './project-access.service';

const PROJECT_ID = 'project-1';
const OWNER_ID = 'owner-1';
const MEMBER_ID = 'member-1';
const OUTSIDER_ID = 'outsider-1';

describe('ProjectAccessService', () => {
  let service: ProjectAccessService;
  let prisma: { project: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { project: { findUnique: jest.fn() } };
    service = new ProjectAccessService(prisma as unknown as PrismaService);
  });

  function mockProject(opts: {
    ownerId?: string;
    memberRole?: Role | null;
    missing?: boolean;
  }) {
    if (opts.missing) {
      prisma.project.findUnique.mockResolvedValue(null);
      return;
    }
    prisma.project.findUnique.mockResolvedValue({
      ownerId: opts.ownerId ?? OWNER_ID,
      members: opts.memberRole ? [{ role: opts.memberRole }] : [],
    });
  }

  it('allows the owner (read)', async () => {
    mockProject({ ownerId: OWNER_ID });
    await expect(
      service.assertAccess(PROJECT_ID, OWNER_ID),
    ).resolves.toBeUndefined();
  });

  it('allows the owner to mutate regardless of role list', async () => {
    mockProject({ ownerId: OWNER_ID });
    await expect(
      service.assertAccess(PROJECT_ID, OWNER_ID, [Role.admin]),
    ).resolves.toBeUndefined();
  });

  it('allows a viewer member to read', async () => {
    mockProject({ ownerId: OWNER_ID, memberRole: Role.viewer });
    await expect(
      service.assertAccess(PROJECT_ID, MEMBER_ID),
    ).resolves.toBeUndefined();
  });

  it('forbids a viewer from a mutating action', async () => {
    mockProject({ ownerId: OWNER_ID, memberRole: Role.viewer });
    await expect(
      service.assertAccess(PROJECT_ID, MEMBER_ID, [Role.admin]),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forbids a tester when only admin may mutate', async () => {
    mockProject({ ownerId: OWNER_ID, memberRole: Role.tester });
    await expect(
      service.assertAccess(PROJECT_ID, MEMBER_ID, [Role.admin]),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows an admin member to mutate', async () => {
    mockProject({ ownerId: OWNER_ID, memberRole: Role.admin });
    await expect(
      service.assertAccess(PROJECT_ID, MEMBER_ID, [Role.admin]),
    ).resolves.toBeUndefined();
  });

  it('forbids a non-member', async () => {
    mockProject({ ownerId: OWNER_ID, memberRole: null });
    await expect(service.assertAccess(PROJECT_ID, OUTSIDER_ID)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('404s when the project does not exist', async () => {
    mockProject({ missing: true });
    await expect(service.assertAccess(PROJECT_ID, OWNER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});
