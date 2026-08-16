import { IsEmail, IsNotEmpty } from 'class-validator';

/**
 * Payload accepted by `POST /auth/forgot-password`.
 *
 * Only an email address here, never a username: the flow's whole output is an
 * email, so an identifier that does not name an inbox has nothing to send to.
 */
export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;
}
