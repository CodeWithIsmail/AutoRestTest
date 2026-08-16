import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Payload accepted by `POST /users/me/password`.
 *
 * `currentPassword` has no length rule on purpose — it is checked against the
 * stored hash, and a length error there would just be a confusing way of
 * saying "wrong password".
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Enter your current password' })
  currentPassword!: string;

  @IsString()
  @IsNotEmpty({ message: 'Enter a new password' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must be at most 128 characters long' })
  newPassword!: string;
}
