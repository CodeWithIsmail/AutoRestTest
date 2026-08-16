import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Payload accepted by `DELETE /users/me`.
 *
 * A valid session is not enough for something this irreversible — an
 * unattended laptop should not be able to destroy the account and every
 * project under it.
 */
export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'Enter your password to confirm' })
  password!: string;
}
