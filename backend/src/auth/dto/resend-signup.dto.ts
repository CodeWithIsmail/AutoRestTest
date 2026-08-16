import { IsEmail, IsNotEmpty } from 'class-validator';

/** Payload accepted by `POST /auth/signup/resend`. */
export class ResendSignupDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;
}
