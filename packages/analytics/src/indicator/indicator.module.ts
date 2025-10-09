import { forwardRef, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule, TagModule, TenantModule, UserModule } from '@metad/server-core';
import { RouterModule } from '@nestjs/core';
import { IndicatorController } from './indicator.controller';
import { Indicator } from './indicator.entity';
import { IndicatorService } from './indicator.service';
import { BusinessAreaUserModule } from '../business-area-user/index';
import { QueryHandlers } from './queries/handlers';
import { CommandHandlers } from './commands/handlers';
import { BullModule } from '@nestjs/bull';
import { JOB_EMBEDDING_INDICATORS } from './types';
import { EmbeddingIndicatorsConsumer } from './jobs/indicator.job';

@Module({
  imports: [
    RouterModule.register([
      { path: '/indicator', module: IndicatorModule }
    ]),
    TypeOrmModule.forFeature([ Indicator ]),
    TenantModule,
    SharedModule,
    CqrsModule,
    BusinessAreaUserModule,
    TagModule,
    UserModule,
    BullModule.registerQueue({
				name: JOB_EMBEDDING_INDICATORS,
				})
  ],
  controllers: [IndicatorController],
  providers: [IndicatorService, EmbeddingIndicatorsConsumer, ...QueryHandlers, ...CommandHandlers],
  exports: [TypeOrmModule, IndicatorService]
})
export class IndicatorModule {}
