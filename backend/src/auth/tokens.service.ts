import {
  ConflictException,
  GoneException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'crypto';
import { AuthTokenType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A reset link sits in an inbox, so it gets a longer life than a code the user
 * is expected to be typing right now.
 */
export const RESET_TTL_MINUTES = 30;

/**
 * Six digits is a million possibilities — trivially brute-forceable if you let
 * someone keep guessing. The expiry is not the protection here; this is.
 * Shared with the signup flow, which enforces the same limit on its own code.
 */
export const MAX_VERIFY_ATTEMPTS = 5;

/** Hash a secret for storage. Exported so SignupService hashes identically. */
export function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** A zero-padded six-digit code, for anything a human has to retype. */
export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Mints and burns the single-use tokens behind password reset.
 *
 * Email verification used to live here too, but its code now belongs to a
 * PendingSignup row — there is no user to hang it off until the code is
 * accepted. The hashing and code-generation helpers above are shared with that
 * flow so the two cannot drift apart.
 *
 * Nothing in this service ever returns a stored secret: the raw value exists
 * only in the return value of the `issue*` call that created it.
 */
@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  // --------------------------------------------------------------------------
  // issuing
  // --------------------------------------------------------------------------

  /** A 64-character hex token for the emailed reset link. */
  async issueResetToken(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    await this.issue(
      userId,
      AuthTokenType.password_reset,
      raw,
      RESET_TTL_MINUTES,
    );
    return raw;
  }

  private async issue(
    userId: string,
    type: AuthTokenType,
    raw: string,
    ttlMinutes: number,
  ): Promise<void> {
    const now = new Date();

    // Retiring the previous tokens keeps "the newest email always wins" true.
    // Without this, a user who clicks Resend twice ends up with two live codes
    // and no way to tell which one the app will accept.
    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({
        where: { userId, type, consumedAt: null },
        data: { consumedAt: now },
      }),
      this.prisma.authToken.create({
        data: {
          userId,
          type,
          tokenHash: sha256(raw),
          expiresAt: minutesFromNow(ttlMinutes),
        },
      }),
    ]);
  }

  // --------------------------------------------------------------------------
  // consuming
  // --------------------------------------------------------------------------

  /**
   * Validates a reset token and burns it. Returns the user it belongs to.
   *
   * Looked up by hash because the caller (an unauthenticated request carrying
   * only the token) has no other identifier to go on.
   */
  async consumeResetToken(raw: string): Promise<string> {
    const token = await this.prisma.authToken.findFirst({
      where: { tokenHash: sha256(raw), type: AuthTokenType.password_reset },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw new UnauthorizedException(
        'This reset link is not valid. Request a new one.',
      );
    }
    if (token.consumedAt) {
      throw new ConflictException(
        'This reset link has already been used. Request a new one.',
      );
    }
    if (token.expiresAt.getTime() <= Date.now()) {
      throw new GoneException(
        'This reset link has expired. Request a new one.',
      );
    }

    await this.prisma.authToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });

    return token.userId;
  }
}
