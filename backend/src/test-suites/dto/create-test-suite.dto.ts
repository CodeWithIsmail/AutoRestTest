import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Payload accepted by `POST /projects/:projectId/test-suites` to configure a
 * test run. A TestSuite IS the run record; execution happens later (the engine
 * module), so this only captures the configuration the engine needs.
 *
 * - `name`: optional label for the run
 * - `targetUrl`: the live base URL the engine will send requests to
 * - `timeBudget`: how long the engine may run, in seconds (1–3600)
 * - `mutationRate`: fault-injection aggressiveness, 0–1 (defaults to 0.2)
 */
export class CreateTestSuiteDto {
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  @MaxLength(100, { message: 'Name must be at most 100 characters long' })
  name?: string;

  // require_protocol so callers pass http(s)://…; require_tld off so that a
  // local target like http://localhost:8080 is accepted for testing.
  @IsUrl(
    { require_protocol: true, require_tld: false },
    { message: 'Target URL must be a valid URL including http(s)://' },
  )
  @MaxLength(2000, {
    message: 'Target URL must be at most 2000 characters long',
  })
  targetUrl!: string;

  @IsInt({ message: 'Time budget must be an integer number of seconds' })
  @Min(1, { message: 'Time budget must be at least 1 second' })
  @Max(3600, { message: 'Time budget must be at most 3600 seconds (1 hour)' })
  timeBudget!: number;

  @IsOptional()
  @IsNumber({}, { message: 'Mutation rate must be a number' })
  @Min(0, { message: 'Mutation rate must be at least 0' })
  @Max(1, { message: 'Mutation rate must be at most 1' })
  mutationRate?: number;
}
