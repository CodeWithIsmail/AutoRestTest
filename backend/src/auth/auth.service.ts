import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../../generated/prisma/client';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  emailVerificationRequired,
  PUBLIC_USER_SELECT,
  toPublicUser,
  type PublicUser,
} from '../users/user.types';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifySignupDto } from './dto/verify-signup.dto';
import { hashPassword, verifyPassword } from './password';
import { SignupService } from './signup.service';
import { RESET_TTL_MINUTES, TokensService } from './tokens.service';

const JWT_EXPIRES_IN = '7d';

/**
 * Re-exported so the many call sites that already import `PublicUser` from here
 * keep working. The definition itself lives in `users/user.types.ts`, which
 * JwtStrategy can import without depending on the service it guards.
 */
export type { PublicUser };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly tokens: TokensService,
    private readonly signup: SignupService,
  ) {}

  // --------------------------------------------------------------------------
  // register
  // --------------------------------------------------------------------------
  /**
   * Starts registration. Returns a message, deliberately **not** a session:
   * no account exists yet, and none will until the emailed code comes back.
   *
   * `REQUIRE_EMAIL_VERIFICATION=false` short-circuits the whole pending step
   * and creates the account outright. That is the escape hatch for demos and
   * for local runs where mail cannot be delivered.
   */
  async register(
    dto: RegisterDto,
  ): Promise<{ message: string; verificationRequired: boolean }> {
    if (emailVerificationRequired()) {
      const { message } = await this.signup.start(dto);
      return { message, verificationRequired: true };
    }

    await this.createVerifiedUser(dto);
    return {
      message: 'Account created successfully',
      verificationRequired: false,
    };
  }

  /**
   * Finishes registration: validates the code, creates the account, and signs
   * the new user straight in.
   *
   * Returns the same `{ accessToken, user }` shape as `login`, so the client
   * has one code path for "I am now signed in" rather than two.
   */
  async completeSignup(
    dto: VerifySignupDto,
  ): Promise<{ accessToken: string; user: PublicUser }> {
    const user = await this.signup.complete(dto.email, dto.code);
    const accessToken = await this.signAccessToken({
      sub: user.id,
      email: user.email,
      username: user.username,
    });
    return { accessToken, user };
  }

  /** Reissues the signup code. Always 200, registered address or not. */
  async resendSignupCode(email: string): Promise<{ message: string }> {
    return this.signup.resend(email);
  }

  /**
   * The verification-free path, used only when the feature is switched off.
   * Kept here rather than in SignupService because nothing about it is pending.
   */
  private async createVerifiedUser(dto: RegisterDto): Promise<void> {
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { username: true },
    });
    if (existing) {
      throw new ConflictException(
        existing.username === username
          ? 'Username is already taken'
          : 'Email is already registered',
      );
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          email,
          password: await hashPassword(dto.password),
          // Marked verified because with the check disabled there is no other
          // way it ever could be, and a permanently unverifiable account is
          // worse than an honestly-labelled one.
          emailVerifiedAt: new Date(),
        },
        select: PUBLIC_USER_SELECT,
      });

      await this.trySend(() =>
        this.email.sendWelcome(user.email, user.username),
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('User already exists');
      }
      throw new InternalServerErrorException(
        'Could not create account. Please try again later.',
      );
    }
  }

  // --------------------------------------------------------------------------
  // login
  // --------------------------------------------------------------------------
  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; user: PublicUser }> {
    const identifier = dto.identifier.trim();

    // An '@' is the only thing that distinguishes the two identifier kinds, and
    // `username` forbids it (letters, digits and underscores only), so this is
    // unambiguous. Emails are stored lowercased; usernames are matched exactly,
    // because `username` is a case-sensitive unique column and a
    // case-insensitive lookup could genuinely match two different accounts.
    const where = identifier.includes('@')
      ? { email: identifier.toLowerCase() }
      : { username: identifier };

    const user = await this.prisma.user.findFirst({
      where,
      select: { ...PUBLIC_USER_SELECT, password: true },
    });

    // Same error message whether the user does not exist or the password
    // is wrong — prevents user-enumeration attacks.
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    // Split the hash off the row here: `toPublicUser` spreads whatever it is
    // given, so anything left on the object would be handed to the client.
    const { password: storedHash, ...row } = user;

    const passwordMatches = await verifyPassword(dto.password, storedHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const accessToken = await this.signAccessToken({
      sub: row.id,
      email: row.email,
      username: row.username,
    });

    return { accessToken, user: toPublicUser(row) };
  }

  // --------------------------------------------------------------------------
  // getMe — used by GET /auth/me
  // --------------------------------------------------------------------------
  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_USER_SELECT,
    });

    if (!user) {
      // Token valid but user deleted — treat as unauthenticated.
      throw new UnauthorizedException('User no longer exists');
    }

    return toPublicUser(user);
  }

  // --------------------------------------------------------------------------
  // password reset
  // --------------------------------------------------------------------------

  /**
   * Starts the reset flow.
   *
   * Always reports success, whether or not the address is registered. Telling
   * the caller which addresses exist would turn this endpoint into an account
   * enumerator, and it is public and unauthenticated.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const message =
      'If an account exists for that address, a reset link is on its way.';
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, username: true },
    });

    if (user) {
      const token = await this.tokens.issueResetToken(user.id);
      await this.trySend(() =>
        this.email.sendPasswordReset(user.email, {
          username: user.username,
          token,
          expiresMinutes: RESET_TTL_MINUTES,
        }),
      );
    }

    return { message };
  }

  /** Completes the reset flow: burns the token, sets the new password. */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const userId = await this.tokens.consumeResetToken(dto.token.trim());
    const passwordHash = await hashPassword(dto.password);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: passwordHash,
        // Invalidates every JWT minted before now — see JwtStrategy. Resetting
        // a password is pointless if whoever took the account keeps their
        // session.
        passwordChangedAt: new Date(),
      },
      select: { email: true, username: true },
    });

    await this.trySend(() =>
      this.email.sendPasswordChanged(user.email, user.username),
    );

    return { message: 'Your password has been reset. Please sign in.' };
  }

  // --------------------------------------------------------------------------
  // private helpers
  // --------------------------------------------------------------------------

  /**
   * `EmailService.send` already swallows delivery failures and returns false;
   * this guards against the rarer case of it throwing outright. No caller in
   * this service should fail because the mailer did.
   */
  private async trySend(fn: () => Promise<boolean>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`Could not send an account email: ${String(err)}`);
    }
  }

  private async signAccessToken(payload: {
    sub: string;
    email: string;
    username: string;
  }): Promise<string> {
    return this.jwtService.signAsync(payload, {
      expiresIn: JWT_EXPIRES_IN,
      secret: this.config.get<string>('JWT_SECRET'),
    });
  }
}
