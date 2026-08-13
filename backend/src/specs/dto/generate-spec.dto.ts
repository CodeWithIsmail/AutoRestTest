import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Text fields sent alongside the source archive in the multipart body of
 * `POST /projects/:projectId/spec/generate`.
 *
 * These need real validation decorators rather than a placeholder class: the
 * global ValidationPipe runs with `whitelist` + `forbidNonWhitelisted`, so any
 * undeclared multipart field would be rejected outright.
 */
export class GenerateSpecDto {
  /** `info.title` for the generated document. Defaults to the project name. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  /** `info.version` for the generated document. Defaults to "1.0.0". */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  version?: string;

  /**
   * Comma-separated directory names the analyser should skip. Vendored trees
   * (node_modules, venv, build output) dominate both cost and wall time, so
   * excluding them matters more here than in a normal upload.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  ignorePath?: string;
}
