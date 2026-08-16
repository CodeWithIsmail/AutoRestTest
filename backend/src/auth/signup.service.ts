import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PUBLIC_USER_SELECT,
  toPublicUser,
  type PublicUser,
} from '../users/user.types';
import { RegisterDto } from './dto/register.dto';
import { hashPassword } from './password';
import {
  generateCode,
  MAX_VERIFY_ATTEMPTS,
  minutesFromNow,
  sha256,
} from './tokens.service';

/**
 * A whole day, and deliberately generous.
 *
 * Because a repeat registration overwrites the pending row, an expired one
 * never blocks anybody — so a short window buys no safety and only makes people
 * retype the form. The attempt counter, not this, is what protects the code.
 */
export const SIGNUP_TTL_MINUTES = 60 * 24;

/**
 * Registration, up to the point where an account becomes real.
 *
 * The reason this exists as its own step: writing straight to `users` let
 * anyone permanently claim an address they did not own. `User.email` is unique,
 * so a squatter's unverified row locked the real owner out forever. Parking the
 * attempt in `pending_signups` instead means an unproven address claims
 * nothing, and the account is created only once someone has read the code out
 * of that inbox.
 *
 * The invariant this buys, relied on everywhere else: **every `User` row is
 * verified.** There is no half-created account to fence off.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  // --------------------------------------------------------------------------
  // start — POST /auth/register
  // --------------------------------------------------------------------------
  async start(dto: RegisterDto): Promise<{ message: string }> {
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();

    await this.assertAvailable(username, email);

    const code = generateCode();

    // Upsert, not create. This single line is the anti-squatting mechanism: a
    // second attempt at the same address replaces the first rather than
    // colliding with it, so whoever can actually read the inbox wins. A
    // squatter's pending row is not a reservation.
    await this.prisma.pendingSignup.upsert({
      where: { email },
      create: {
        email,
        username,
        password: await hashPassword(dto.password),
        codeHash: sha256(code),
        expiresAt: minutesFromNow(SIGNUP_TTL_MINUTES),
      },
      update: {
        username,
        password: await hashPassword(dto.password),
        codeHash: sha256(code),
        expiresAt: minutesFromNow(SIGNUP_TTL_MINUTES),
        // Reset, or an abandoned attempt's failed guesses would count against
        // the person who legitimately starts over.
        attempts: 0,
      },
    });

    await this.trySend(() =>
      this.email.sendEmailVerification(email, {
        username,
        code,
        expiresMinutes: SIGNUP_TTL_MINUTES,
      }),
    );

    return {
      message: 'Check your email for the six-digit code to finish signing up.',
    };
  }

  // --------------------------------------------------------------------------
  // complete — POST /auth/verify-signup
  // --------------------------------------------------------------------------

  /** Validates the code and promotes the pending row into a real account. */
  async complete(rawEmail: string, rawCode: string): Promise<PublicUser> {
    const email = rawEmail.trim().toLowerCase();

    const pending = await this.prisma.pendingSignup.findUnique({
      where: { email },
    });
    if (!pending) {
      throw new UnauthorizedException(
        'No signup is pending for that address. Register again.',
      );
    }

    if (pending.expiresAt.getTime() <= Date.now()) {
      await this.discard(email);
      throw new GoneException('This signup has expired. Register again.');
    }

    if (pending.codeHash !== sha256(rawCode.trim())) {
      const attempts = pending.attempts + 1;

      if (attempts >= MAX_VERIFY_ATTEMPTS) {
        // Destroying the row is what makes the limit real; a counter nobody
        // acts on still lets all million guesses through. Re-registering is
        // the way back, and costs the attacker a fresh code they cannot read.
        await this.discard(email);
        throw new UnauthorizedException(
          'Too many incorrect codes. Register again to get a new one.',
        );
      }

      await this.prisma.pendingSignup.update({
        where: { email },
        data: { attempts },
      });
      throw new UnauthorizedException(
        `That code is not correct. ${MAX_VERIFY_ATTEMPTS - attempts} attempt(s) left.`,
      );
    }

    return this.promote(pending);
  }

  // --------------------------------------------------------------------------
  // resend — POST /auth/signup/resend
  // --------------------------------------------------------------------------

  /**
   * Reissues the code. Always reports success: this route is public and takes a
   * bare address, so confirming whether a signup is pending would say who has
   * started registering. Same rule as `AuthService.forgotPassword`.
   */
  async resend(rawEmail: string): Promise<{ message: string }> {
    const email = rawEmail.trim().toLowerCase();
    const message =
      'If a signup is pending for that address, a new code is on its way.';

    const pending = await this.prisma.pendingSignup.findUnique({
      where: { email },
    });
    if (!pending) return { message };

    const code = generateCode();
    await this.prisma.pendingSignup.update({
      where: { email },
      data: {
        codeHash: sha256(code),
        expiresAt: minutesFromNow(SIGNUP_TTL_MINUTES),
        attempts: 0,
      },
    });

    await this.trySend(() =>
      this.email.sendEmailVerification(email, {
        username: pending.username,
        code,
        expiresMinutes: SIGNUP_TTL_MINUTES,
      }),
    );

    return { message };
  }

  /** Drops a pending signup, freeing the address for anyone to claim. */
  async discard(email: string): Promise<void> {
    // deleteMany rather than delete: the row may already be gone, and a P2025
    // here would turn a tidy-up into a 500.
    await this.prisma.pendingSignup.deleteMany({ where: { email } });
  }

  // --------------------------------------------------------------------------
  // private helpers
  // --------------------------------------------------------------------------

  /** 409s if a real account already holds either identifier. */
  private async assertAvailable(
    username: string,
    email: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { username: true, email: true },
    });
    if (!existing) return;

    // Deliberately explicit rather than a vague "check your email": telling
    // someone they already have an account is worth more than hiding an
    // existence signal that login and password reset expose anyway.
    if (existing.username === username) {
      throw new ConflictException('Username is already taken');
    }
    throw new ConflictException('Email is already registered');
  }

  /**
   * Creates the account and clears the pending row, atomically.
   *
   * The uniqueness check is repeated in here on purpose. `start` checked it
   * too, but a whole day can pass in between, and the only check that can be
   * trusted is the one inside the transaction that does the insert.
   */
  private async promote(pending: {
    email: string;
    username: string;
    password: string;
  }): Promise<PublicUser> {
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const clash = await tx.user.findFirst({
          where: {
            OR: [{ username: pending.username }, { email: pending.email }],
          },
          select: { username: true },
        });
        if (clash) {
          throw new ConflictException(
            clash.username === pending.username
              ? 'That username was taken while you were verifying. Register again with a different one.'
              : 'That email was registered while you were verifying. Try signing in.',
          );
        }

        const created = await tx.user.create({
          data: {
            username: pending.username,
            email: pending.email,
            password: pending.password,
            // Verified by construction — this row only exists because the code
            // that reached this address came back.
            emailVerifiedAt: new Date(),
          },
          select: PUBLIC_USER_SELECT,
        });

        await tx.pendingSignup.delete({ where: { email: pending.email } });
        return created;
      });

      await this.trySend(() =>
        this.email.sendWelcome(user.email, user.username),
      );

      return toPublicUser(user);
    } catch (err) {
      // Race fallback for two verifications landing at once.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'That username or email was just taken. Register again.',
        );
      }
      throw err;
    }
  }

  /** Mail must never be the reason a signup step fails. */
  private async trySend(fn: () => Promise<boolean>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`Could not send a signup email: ${String(err)}`);
    }
  }
}
