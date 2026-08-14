import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Provides the transactional mailer globally. Auth, collaboration and
 * test-suites all send mail, so this follows the same @Global pattern as
 * EngineModule rather than being imported into each of them.
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
