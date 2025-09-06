import { forwardRef, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule, SharedModule, TenantModule } from '@metad/server-core';
import { RouterModule } from '@nestjs/core';
import { NotificationDestinationController } from './notification-destination.controller';
import { NotificationDestination } from './notification-destination.entity';
import { NotificationDestinationService } from './notification-destination.service';

@Module({
  imports: [
    RouterModule.register([
      { path: '/notification-destination', module: NotificationDestinationModule }
    ]),
    TypeOrmModule.forFeature([ NotificationDestination ]),
    forwardRef(() => TenantModule),
    SharedModule,
    CqrsModule,
    RedisModule
  ],
  providers: [ NotificationDestinationService ],
  controllers: [ NotificationDestinationController ]
})
export class NotificationDestinationModule {}
