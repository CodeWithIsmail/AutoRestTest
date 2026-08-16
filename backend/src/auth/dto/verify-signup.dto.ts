import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Payload accepted by `POST /auth/verify-signup`.
 *
 * The address is part of the body because this route is public — there is no
 * account yet, so no session to identify the pending signup by.
 */
export class VerifySignupDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Enter the code from your email' })
  @Matches(/^\d{6}$/, { message: 'The code is six digits' })
  code!: string;
}
