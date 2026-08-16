import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Payload accepted by `PATCH /users/me/notifications`.
 *
 * Covers only the two messages a user can receive repeatedly. Security notices
 * (password changed) and one-off flow mail (verification codes, reset links)
 * are deliberately not switchable — an account holder must always be told when
 * their credentials move.
 */
export class UpdateNotificationsDto {
  @IsOptional()
  @IsBoolean()
  notifyRunFinished?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyInvitations?: boolean;
}
