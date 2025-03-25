import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  @Cron('0 0 * * * *')
  cleanCron() {
    this.logger.debug('Called when the current second is 45');
  }
}