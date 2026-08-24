import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { PublicUser } from '../../users/user.types';

/**
 * Gates platform-wide admin routes (e.g. LLM settings) behind
 * `PublicUser.isAdmin`, which `toPublicUser` already computes from the
 * `ADMIN_EMAILS` allowlist. Must run after `JwtAuthGuard` so `request.user`
 * is populated.
 *
 * There is no DB-backed admin role: `Role` is project-scoped and this isn't,
 * so an env allowlist is the whole mechanism — fits a single-owner deployment
 * with no promotion flow to build.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: PublicUser }>();
    if (!req.user?.isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
