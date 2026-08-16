import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateNotificationsDto } from './dto/update-notifications.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';
import type { PublicUser } from './user.types';

interface AuthenticatedRequest extends Request {
  user: PublicUser;
}

const MINUTES = 60_000;

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** PATCH /users/me — display name and avatar colour. */
  @Patch('me')
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  /** PATCH /users/me/notifications — which recurring emails to receive. */
  @Patch('me/notifications')
  async updateNotifications(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateNotificationsDto,
  ) {
    return this.usersService.updateNotifications(req.user.id, dto);
  }

  /**
   * POST /users/me/password
   *
   * Throttled, like the auth routes: the current-password field makes this a
   * password oracle for anyone who gets hold of a live session.
   */
  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * MINUTES } })
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(req.user.id, dto);
  }

  /** DELETE /users/me — irreversible; requires the password in the body. */
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * MINUTES } })
  async deleteAccount(
    @Req() req: AuthenticatedRequest,
    @Body() dto: DeleteAccountDto,
  ) {
    return this.usersService.deleteAccount(req.user.id, dto);
  }
}
