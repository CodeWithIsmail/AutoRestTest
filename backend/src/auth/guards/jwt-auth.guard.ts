import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that protects routes with the 'jwt' Passport strategy.
 *
 * Apply via `@UseGuards(JwtAuthGuard)` on a controller method or
 * globally with `app.useGlobalGuards(new JwtAuthGuard())`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
