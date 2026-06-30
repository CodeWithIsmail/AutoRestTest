import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { HttpMethod } from '../../../generated/prisma/client';

/**
 * Payload accepted by `POST /projects/:projectId/endpoints` to manually add an
 * endpoint that isn't (or isn't yet) in the uploaded spec.
 *
 * - `method`: one of GET/POST/PUT/PATCH/DELETE
 * - `path`: must start with `/` (e.g. `/users/{id}`)
 * - `description`: optional, up to 500 characters
 */
export class CreateEndpointDto {
  @IsEnum(HttpMethod, {
    message: 'Method must be one of GET, POST, PUT, PATCH, DELETE',
  })
  method!: HttpMethod;

  @IsString()
  @IsNotEmpty({ message: 'Path is required' })
  @MaxLength(1000, { message: 'Path must be at most 1000 characters long' })
  @Matches(/^\//, { message: 'Path must start with "/"' })
  path!: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, {
    message: 'Description must be at most 500 characters long',
  })
  description?: string;
}
