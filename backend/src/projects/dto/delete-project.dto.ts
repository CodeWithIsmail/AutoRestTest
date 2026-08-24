import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Payload accepted by `DELETE /projects/:id`.
 *
 * Mirrors `DeleteAccountDto`: a valid session is not enough for something
 * this irreversible, so the owner's password is required to confirm.
 */
export class DeleteProjectDto {
  @IsString()
  @IsNotEmpty({ message: 'Enter your password to confirm' })
  password!: string;
}
