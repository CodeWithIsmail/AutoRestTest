import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AVATAR_COLORS } from '../user.types';

/**
 * Payload accepted by `PATCH /users/me`.
 *
 * Deliberately does not accept `username` or `email`. The username is a login
 * identifier and is immutable; changing an email needs a confirm-at-the-new-
 * address round trip that this pass does not implement. The global
 * `forbidNonWhitelisted` pipe turns an attempt at either into a 400 for free.
 */
export class UpdateProfileDto {
  /** Empty string is meaningful: it clears the name back to the username. */
  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'Display name must be at most 60 characters long' })
  name?: string;

  @IsOptional()
  @IsIn(AVATAR_COLORS, { message: 'Pick one of the offered avatar colours' })
  avatarColor?: string;
}
