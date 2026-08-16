import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// PrismaService and EmailService come from their @Global modules; JwtAuthGuard
// needs no provider of its own (JwtStrategy is registered by AuthModule).
@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
