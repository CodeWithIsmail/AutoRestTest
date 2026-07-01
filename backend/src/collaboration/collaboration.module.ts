import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { MyInvitationsController } from './my-invitations.controller';

@Module({
  controllers: [
    InvitationsController,
    MembersController,
    MyInvitationsController,
  ],
  providers: [InvitationsService, MembersService],
})
export class CollaborationModule {}
