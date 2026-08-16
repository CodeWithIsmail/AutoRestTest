import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Payload accepted by `POST /auth/login`.
 *
 * One field takes both an email address and a username, so it cannot be
 * `@IsEmail` — AuthService.login decides which it is by looking for an '@',
 * which `username` forbids.
 */
export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Enter your email address or username' })
  @MaxLength(255)
  identifier!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;
}
