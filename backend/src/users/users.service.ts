import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { hashPassword, verifyPassword } from '../auth/password';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateNotificationsDto } from './dto/update-notifications.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  PUBLIC_USER_SELECT,
  toPublicUser,
  type PublicUser,
} from './user.types';

/**
 * Everything a signed-in user can do to their own account.
 *
 * Reads still go through `GET /auth/me` — the frontend bootstraps from it and
 * there is no value in a second endpoint returning the same row.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  // --------------------------------------------------------------------------
  // profile
  // --------------------------------------------------------------------------
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    const data: { name?: string | null; avatarColor?: string } = {};

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      // Storing null rather than '' keeps one representation of "no display
      // name", so the UI's `name ?? username` fallback always fires.
      data.name = trimmed === '' ? null : trimmed;
    }
    if (dto.avatarColor !== undefined) {
      data.avatarColor = dto.avatarColor;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: PUBLIC_USER_SELECT,
    });

    return toPublicUser(user);
  }

  // --------------------------------------------------------------------------
  // notification preferences
  // --------------------------------------------------------------------------
  async updateNotifications(
    userId: string,
    dto: UpdateNotificationsDto,
  ): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.notifyRunFinished !== undefined && {
          notifyRunFinished: dto.notifyRunFinished,
        }),
        ...(dto.notifyInvitations !== undefined && {
          notifyInvitations: dto.notifyInvitations,
        }),
      },
      select: PUBLIC_USER_SELECT,
    });

    return toPublicUser(user);
  }

  // --------------------------------------------------------------------------
  // password
  // --------------------------------------------------------------------------
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, password: true },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const matches = await verifyPassword(dto.currentPassword, user.password);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    // Checked against the stored hash rather than by comparing the two plain
    // strings, so it also catches "I retyped the same password" when the client
    // sent a differently-cased or padded value.
    const unchanged = await verifyPassword(dto.newPassword, user.password);
    if (unchanged) {
      throw new BadRequestException(
        'Your new password must be different from the current one.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await hashPassword(dto.newPassword),
        // Kills every existing session, this one included — see JwtStrategy.
        passwordChangedAt: new Date(),
      },
    });

    await this.trySend(() =>
      this.email.sendPasswordChanged(user.email, user.username),
    );

    return {
      message: 'Password changed. Please sign in again.',
    };
  }

  // --------------------------------------------------------------------------
  // account deletion
  // --------------------------------------------------------------------------

  /**
   * Deletes the account and everything that belongs to it.
   *
   * The order below is not incidental. `User` is referenced by four tables and
   * only `authTokens` cascades, so the rest have to be cleared by hand:
   *
   *  - memberships and sent invitations are pure join/transient rows;
   *  - owned projects cascade to their specs, endpoints, suites and logs;
   *  - runs this user triggered inside *other people's* projects survive with a
   *    null `triggeredById`, because they are that project's history, not this
   *    user's. That is the whole reason the column is nullable.
   */
  async deleteAccount(
    userId: string,
    dto: DeleteAccountDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const matches = await verifyPassword(dto.password, user.password);
    if (!matches) {
      throw new UnauthorizedException('Password is incorrect.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({ where: { userId } });
      await tx.projectInvitation.deleteMany({ where: { invitedById: userId } });
      await tx.project.deleteMany({ where: { ownerId: userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    this.logger.log(`Account ${userId} deleted at the owner's request.`);

    return { message: 'Your account has been deleted.' };
  }

  // --------------------------------------------------------------------------
  // private helpers
  // --------------------------------------------------------------------------

  /** Mail must never be the reason an account operation fails. */
  private async trySend(fn: () => Promise<boolean>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`Could not send an account email: ${String(err)}`);
    }
  }
}
