import { IsEnum } from 'class-validator';
import { Role } from '../../../generated/prisma/client';

/** Payload for `PATCH /projects/:projectId/members/:userId`. */
export class UpdateMemberRoleDto {
  @IsEnum(Role, { message: 'Role must be one of admin, tester, viewer' })
  role!: Role;
}
