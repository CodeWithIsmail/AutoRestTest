import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = '7d';

/** Public-safe projection of a User row. Never includes the password hash. */
export interface PublicUser {
  id: string;
  username: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // --------------------------------------------------------------------------
  // register
  // --------------------------------------------------------------------------
  async register(dto: RegisterDto): Promise<{
    message: string;
    user: PublicUser;
  }> {
    // Normalize inputs
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();

    // Pre-check to give a friendly 409 with the specific field in conflict.
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { username: true, email: true },
    });

    if (existing) {
      if (existing.username === username) {
        throw new ConflictException('Username is already taken');
      }
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          email,
          password: passwordHash,
        },
        select: { id: true, username: true, email: true },
      });

      return {
        message: 'Account created successfully',
        user,
      };
    } catch (err) {
      // Race-condition fallback: unique constraint on username / email.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = (err.meta?.['target'] as string[] | undefined) ?? [];
        if (target.includes('username')) {
          throw new ConflictException('Username is already taken');
        }
        if (target.includes('email')) {
          throw new ConflictException('Email is already registered');
        }
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
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, username: true, email: true, password: true },
    });

    // Same error message whether the user does not exist or the password
    // is wrong — prevents user-enumeration attacks.
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.signAccessToken({
      sub: user.id,
      email: user.email,
      username: user.username,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    };
  }

  // --------------------------------------------------------------------------
  // getMe — used by GET /auth/me
  // --------------------------------------------------------------------------
  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true },
    });

    if (!user) {
      // Token valid but user deleted — treat as unauthenticated.
      throw new UnauthorizedException('User no longer exists');
    }

    return user;
  }

  // --------------------------------------------------------------------------
  // private helpers
  // --------------------------------------------------------------------------
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
