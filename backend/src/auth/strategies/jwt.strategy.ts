import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_USER_SELECT, toPublicUser } from '../../users/user.types';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  username: string;
  /** Issued-at, in seconds. Set by the signer; used for the revocation check. */
  iat: number;
}

/**
 * Passport JWT strategy.
 *
 * - Reads the JWT from the `Authorization: Bearer <token>` header.
 * - Verifies the signature using the secret stored in `JWT_SECRET`.
 * - On every protected request, re-fetches the user from the database so
 *   that revoked / deleted accounts are immediately rejected.
 * - Rejects tokens older than the account's last password change.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_SECRET is not defined. Add it to your .env file before starting the app.',
      );
    }

    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    };

    super(options);
  }

  /**
   * Passport invokes this method with the decoded payload after the
   * token signature has been verified. Whatever is returned here is
   * attached to `request.user`.
   */
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { ...PUBLIC_USER_SELECT, passwordChangedAt: true },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const { passwordChangedAt, ...row } = user;

    // Changing a password invalidates every token minted before it. This is the
    // app's only revocation mechanism, and without it a password reset would
    // leave whoever took the account still signed in — which is the entire
    // thing the reset was supposed to undo.
    //
    // Both sides are compared in whole seconds because `iat` only has
    // one-second resolution. Comparing against the millisecond timestamp
    // instead rejects a token minted in the same second as the change, which
    // is precisely what "reset your password, then sign in" does.
    if (
      passwordChangedAt &&
      payload.iat < Math.floor(passwordChangedAt.getTime() / 1000)
    ) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    return toPublicUser(row);
  }
}
