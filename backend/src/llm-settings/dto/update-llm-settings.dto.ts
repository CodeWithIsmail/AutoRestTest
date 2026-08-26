import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * PATCH /admin/llm-settings/:scope body.
 *
 * Every field is a partial update: omit a key to leave it unchanged, send it
 * as `null` to clear the override (falls back to that surface's environment
 * default), or send a value to set it. `@IsOptional()` lets `null` through
 * without triggering the type validators below, which is what makes the
 * "clear it" case work.
 */
export class UpdateLlmSettingsDto {
  @IsOptional()
  @IsString({ message: 'Model must be a string' })
  @MaxLength(200, { message: 'Model must be at most 200 characters long' })
  model?: string | null;

  /** The provider API key for this scope, stored and returned like any other field. */
  @IsOptional()
  @IsString({ message: 'API key must be a string' })
  @MaxLength(2000, { message: 'API key must be at most 2000 characters long' })
  apiKey?: string | null;

  @IsOptional()
  @IsUrl(
    { require_protocol: true, require_tld: false },
    { message: 'API base must be a valid URL including http(s)://' },
  )
  @MaxLength(500, { message: 'API base must be at most 500 characters long' })
  apiBase?: string | null;

  @IsOptional()
  @IsInt({ message: 'RPM limit must be an integer' })
  @Min(0, { message: 'RPM limit must be at least 0 (0 disables the limit)' })
  @Max(1000, { message: 'RPM limit must be at most 1000' })
  rpmLimit?: number | null;
}
