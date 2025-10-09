import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { SharedModule, TenantModule } from '@metad/server-core';
import { RouterModule } from '@nestjs/core';
import { SubscriptionController } from './subscription.controller';
import { Subscription } from './subscription.entity';
import { SubscriptionService } from './subscription.service';


@Module({
  imports: [
    RouterModule.register([
      { path: '/subscription', module: SubscriptionModule }
    ]),
    TypeOrmModule.forFeature([ Subscription ]),
    forwardRef(() => TenantModule),
    SharedModule,
    CqrsModule,
  ],
  providers: [ SubscriptionService ],
  controllers: [ SubscriptionController ]
})
export class SubscriptionModule {}
