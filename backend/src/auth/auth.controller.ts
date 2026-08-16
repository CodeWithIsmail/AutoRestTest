import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService, PublicUser } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendSignupDto } from './dto/resend-signup.dto';
import { VerifySignupDto } from './dto/verify-signup.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: PublicUser;
}

const MINUTES = 60_000;

/**
 * Every route here is either unauthenticated or a step in proving an identity,
 * which makes this the one controller in the app worth rate-limiting: without
 * it, `login` is a free password oracle and `forgot-password` is a free way to
 * send mail to any address, as often as you like.
 *
 * The guard is applied per-controller rather than globally on purpose — the
 * frontend polls run status every three seconds, and a global limit tuned for
 * logins would strangle it.
 */
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   *
   * Public. Starts a signup and emails a six-digit code. **No account is
   * created here and no session is returned** — writing to `users` before the
   * address was proven let anyone permanently claim an email they did not own.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60 * MINUTES } })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/login
   * Public endpoint. Accepts an email address or a username as `identifier`.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 5 * MINUTES } })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * GET /auth/me
   * Protected. Returns the profile of the currently authenticated user.
   * The `JwtStrategy.validate` callback has already loaded the user from
   * the database and attached it to `request.user`.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req: AuthenticatedRequest) {
    return this.authService.getMe(req.user.id);
  }

  /**
   * POST /auth/forgot-password
   * Public. Always 200 with the same message, registered address or not.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 15 * MINUTES } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  /**
   * POST /auth/reset-password
   * Public. Consumes the one-time token from the emailed link.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTES } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  /**
   * POST /auth/verify-signup
   *
   * Public — there is no account yet, so nothing to authenticate against; the
   * address is carried in the body instead. Creates the account and returns a
   * session, the same `{ accessToken, user }` shape login returns.
   *
   * Public is safe here in a way it would not be for a login gate: a pending
   * signup is disposable, so a failed delivery means "register again", never a
   * locked account.
   */
  @Post('verify-signup')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTES } })
  async verifySignup(@Body() dto: VerifySignupDto) {
    return this.authService.completeSignup(dto);
  }

  /**
   * POST /auth/signup/resend
   * Public. Reissues the code, retiring the previous one. Always 200.
   */
  @Post('signup/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 15 * MINUTES } })
  async resendSignupCode(@Body() dto: ResendSignupDto) {
    return this.authService.resendSignupCode(dto.email);
  }
}
