import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Payload accepted by `POST /auth/reset-password`.
 *
 * `token` is the raw hex secret out of the emailed link. It is not a UUID, so
 * it arrives as a plain string rather than through `ParseUUIDPipe`.
 */
export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  @MaxLength(200)
  token!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must be at most 128 characters long' })
  password!: string;
}
