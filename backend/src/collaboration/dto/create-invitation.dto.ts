import { IsEmail, IsEnum } from 'class-validator';
import { Role } from '../../../generated/prisma/client';

/**
 * Payload for `POST /projects/:projectId/invitations`.
 * `role` is the collaborator role to grant on acceptance (never "owner").
 */
export class CreateInvitationDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @IsEnum(Role, { message: 'Role must be one of admin, tester, viewer' })
  role!: Role;
}
